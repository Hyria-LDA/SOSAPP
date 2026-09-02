-- Parceiros passam a ser cadastros administrativos, sem conta de acesso propria.
-- O rastreamento por link, instalacoes, cadastros e conversoes permanece ativo.

ALTER TABLE public.vendedores_parceiros
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL;

DROP POLICY IF EXISTS "Vendedor le proprio registro" ON public.vendedores_parceiros;
DROP POLICY IF EXISTS "Vendedor le proprios cliques" ON public.vendedor_cliques;
DROP POLICY IF EXISTS "Vendedor le proprias indicacoes" ON public.indicacoes;

-- Novas indicacoes nao devem mais criar elegibilidade para testes gratis.
DROP TRIGGER IF EXISTS trg_create_partner_store_trial_eligibility
  ON public.indicacoes;

REVOKE EXECUTE ON FUNCTION public.get_partner_store_trial_eligibility()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_partner_apple_offer_code(text, text)
  FROM PUBLIC, anon, authenticated;

-- Mantem a tela resumida existente, mas restringe seus numeros ao administrador.
CREATE OR REPLACE FUNCTION public.vendedor_metrics(_vendedor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'cliques', (SELECT count(*) FROM public.vendedor_cliques WHERE vendedor_id = _vendedor_id),
    'acessos', (SELECT count(*) FROM public.vendedor_cliques WHERE vendedor_id = _vendedor_id),
    'instalacoes', (SELECT count(*) FROM public.vendedor_instalacoes WHERE vendedor_id = _vendedor_id),
    'instalacoes_android', (SELECT count(*) FROM public.vendedor_instalacoes WHERE vendedor_id = _vendedor_id AND plataforma = 'android'),
    'instalacoes_ios', (SELECT count(*) FROM public.vendedor_instalacoes WHERE vendedor_id = _vendedor_id AND plataforma = 'ios'),
    'cadastros', (SELECT count(*) FROM public.indicacoes WHERE vendedor_id = _vendedor_id),
    'pagantes', (SELECT count(*) FROM public.indicacoes WHERE vendedor_id = _vendedor_id AND primeira_conversao_em IS NOT NULL),
    'aprovados', (SELECT count(*) FROM public.indicacoes WHERE vendedor_id = _vendedor_id AND primeira_conversao_em IS NOT NULL),
    'planos_pagos_ativos', (SELECT count(DISTINCT i.empresa_id) FROM public.indicacoes i WHERE i.vendedor_id = _vendedor_id AND (EXISTS (SELECT 1 FROM public.revenuecat_subscriptions r WHERE r.empresa_id = i.empresa_id AND r.status = 'active') OR EXISTS (SELECT 1 FROM public.financeiro f JOIN public.planos p ON p.id = f.plano_id WHERE f.empresa_id = i.empresa_id AND f.status = 'pago' AND f.valor > 0 AND f.vencimento > now() AND p.slug <> 'free'))),
    'premiums_ativos', (SELECT count(DISTINCT i.empresa_id) FROM public.indicacoes i WHERE i.vendedor_id = _vendedor_id AND (EXISTS (SELECT 1 FROM public.revenuecat_subscriptions r WHERE r.empresa_id = i.empresa_id AND r.status = 'active') OR EXISTS (SELECT 1 FROM public.financeiro f JOIN public.planos p ON p.id = f.plano_id WHERE f.empresa_id = i.empresa_id AND f.status = 'pago' AND f.valor > 0 AND f.vencimento > now() AND p.slug <> 'free'))),
    'valor_total', (SELECT coalesce(sum(comissao_valor), 0) FROM public.indicacoes WHERE vendedor_id = _vendedor_id AND primeira_conversao_em IS NOT NULL),
    'valor_pago', (SELECT coalesce(sum(comissao_valor), 0) FROM public.indicacoes WHERE vendedor_id = _vendedor_id AND primeira_conversao_em IS NOT NULL AND paga = true),
    'valor_pendente', (SELECT coalesce(sum(comissao_valor), 0) - coalesce(sum(comissao_valor) FILTER (WHERE paga), 0) FROM public.indicacoes WHERE vendedor_id = _vendedor_id AND primeira_conversao_em IS NOT NULL)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_partner_report(
  _vendedor_id uuid,
  _from_date date,
  _to_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  from_time timestamptz;
  until_time timestamptz;
BEGIN
  IF caller_id IS NULL OR NOT public.has_role(caller_id, 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF _from_date IS NULL OR _to_date IS NULL OR _from_date > _to_date THEN
    RAISE EXCEPTION 'Periodo invalido';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vendedores_parceiros WHERE id = _vendedor_id
  ) THEN
    RAISE EXCEPTION 'Vendedor nao encontrado';
  END IF;

  from_time := _from_date::timestamptz;
  until_time := (_to_date + 1)::timestamptz;

  RETURN jsonb_build_object(
    'acessos', (
      SELECT count(*) FROM public.vendedor_cliques
      WHERE vendedor_id = _vendedor_id
        AND created_at >= from_time AND created_at < until_time
    ),
    'instalacoes', (
      SELECT count(*) FROM public.vendedor_instalacoes
      WHERE vendedor_id = _vendedor_id
        AND created_at >= from_time AND created_at < until_time
    ),
    'instalacoes_android', (
      SELECT count(*) FROM public.vendedor_instalacoes
      WHERE vendedor_id = _vendedor_id AND plataforma = 'android'
        AND created_at >= from_time AND created_at < until_time
    ),
    'instalacoes_ios', (
      SELECT count(*) FROM public.vendedor_instalacoes
      WHERE vendedor_id = _vendedor_id AND plataforma = 'ios'
        AND created_at >= from_time AND created_at < until_time
    ),
    'cadastros', (
      SELECT count(*) FROM public.indicacoes
      WHERE vendedor_id = _vendedor_id
        AND created_at >= from_time AND created_at < until_time
    ),
    'pagantes', (
      SELECT count(*) FROM public.indicacoes
      WHERE vendedor_id = _vendedor_id
        AND primeira_conversao_em >= from_time AND primeira_conversao_em < until_time
    ),
    'valor_total', (
      SELECT coalesce(sum(comissao_valor), 0) FROM public.indicacoes
      WHERE vendedor_id = _vendedor_id
        AND primeira_conversao_em >= from_time AND primeira_conversao_em < until_time
    ),
    'valor_pago', (
      SELECT coalesce(sum(comissao_valor), 0) FROM public.indicacoes
      WHERE vendedor_id = _vendedor_id AND paga = true
        AND primeira_conversao_em >= from_time AND primeira_conversao_em < until_time
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_partner_report(uuid, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_partner_report(uuid, date, date)
  TO authenticated;
