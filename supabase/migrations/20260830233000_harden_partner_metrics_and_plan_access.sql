-- Evita inflar acessos de parceiros e restringe metricas/planos ao escopo correto.

ALTER TABLE public.vendedor_cliques
  ADD COLUMN IF NOT EXISTS visitor_hash text,
  ADD COLUMN IF NOT EXISTS visit_day date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendedor_cliques_unique_daily_visitor
  ON public.vendedor_cliques(vendedor_id, visitor_hash, visit_day)
  WHERE visitor_hash IS NOT NULL AND visit_day IS NOT NULL;

-- O acesso passa a ser registrado pela Edge Function, que calcula o identificador
-- com dados da requisicao. O navegador nao pode mais inserir cliques via RPC.
REVOKE EXECUTE ON FUNCTION public.registrar_clique_vendedor(text, text, text)
  FROM PUBLIC, anon, authenticated;

-- Parceiros consultam somente os totais autorizados pela RPC, não dados brutos
-- de navegação (referer e user-agent) de quem abriu o link.
DROP POLICY IF EXISTS "Vendedor le proprios cliques" ON public.vendedor_cliques;

CREATE OR REPLACE FUNCTION public.vendedor_metrics(_vendedor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  acessos int;
  cadastros int;
  pagantes int;
  planos_pagos_ativos int;
  valor_total numeric;
  valor_pago numeric;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(caller_id, 'admin')
    AND NOT EXISTS (
      SELECT 1 FROM public.vendedores_parceiros
      WHERE id = _vendedor_id AND user_id = caller_id
    ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO acessos
  FROM public.vendedor_cliques WHERE vendedor_id = _vendedor_id;

  SELECT count(*) INTO cadastros
  FROM public.indicacoes WHERE vendedor_id = _vendedor_id;

  SELECT count(*) INTO pagantes
  FROM public.indicacoes
  WHERE vendedor_id = _vendedor_id AND primeira_conversao_em IS NOT NULL;

  SELECT count(DISTINCT i.empresa_id) INTO planos_pagos_ativos
  FROM public.indicacoes i
  WHERE i.vendedor_id = _vendedor_id
    AND (
      EXISTS (
        SELECT 1 FROM public.revenuecat_subscriptions r
        WHERE r.empresa_id = i.empresa_id AND r.status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM public.financeiro f
        JOIN public.planos p ON p.id = f.plano_id
        WHERE f.empresa_id = i.empresa_id
          AND f.status = 'pago'
          AND f.valor > 0
          AND f.vencimento > now()
          AND p.slug <> 'free'
      )
    );

  SELECT coalesce(sum(comissao_valor), 0) INTO valor_total
  FROM public.indicacoes
  WHERE vendedor_id = _vendedor_id AND primeira_conversao_em IS NOT NULL;

  SELECT coalesce(sum(comissao_valor), 0) INTO valor_pago
  FROM public.indicacoes
  WHERE vendedor_id = _vendedor_id
    AND primeira_conversao_em IS NOT NULL AND paga = true;

  RETURN jsonb_build_object(
    'cliques', acessos,
    'acessos', acessos,
    'cadastros', cadastros,
    'aprovados', pagantes,
    'pagantes', pagantes,
    'premiums_ativos', planos_pagos_ativos,
    'planos_pagos_ativos', planos_pagos_ativos,
    'valor_total', valor_total,
    'valor_pago', valor_pago,
    'valor_pendente', valor_total - valor_pago
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vendedor_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendedor_metrics(uuid) TO authenticated;

-- Visitantes e usuarios comuns enxergam somente planos ativos. Administradores
-- continuam podendo consultar e gerenciar inclusive planos desativados.
DROP POLICY IF EXISTS "Planos públicos" ON public.planos;
DROP POLICY IF EXISTS "Planos ativos são públicos" ON public.planos;
CREATE POLICY "Planos ativos são públicos"
  ON public.planos FOR SELECT TO anon, authenticated
  USING (ativo = true OR public.has_role(auth.uid(), 'admin'));
