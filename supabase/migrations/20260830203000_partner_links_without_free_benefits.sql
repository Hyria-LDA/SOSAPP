-- Links de parceiros passam a servir somente para atribuicao e conversao.
-- Nenhum plano ou beneficio gratuito e concedido pelo codigo.

ALTER TABLE public.indicacoes
  ADD COLUMN IF NOT EXISTS plano_pago_slug text,
  ADD COLUMN IF NOT EXISTS primeira_conversao_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_indicacoes_primeira_conversao
  ON public.indicacoes(vendedor_id, primeira_conversao_em);

CREATE OR REPLACE FUNCTION public.registrar_clique_vendedor(
  _codigo text,
  _referer text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  click_id uuid;
  normalized_code text := upper(regexp_replace(trim(_codigo), '\s+', '', 'g'));
BEGIN
  SELECT id INTO v_id
  FROM public.vendedores_parceiros
  WHERE upper(codigo) = normalized_code AND ativo = true;
  IF v_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.vendedor_cliques(codigo, vendedor_id, referer, user_agent)
  VALUES (normalized_code, v_id, _referer, _user_agent)
  RETURNING id INTO click_id;
  RETURN click_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.aplicar_ref_codigo(_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
  emp record;
  ind_id uuid;
  normalized_code text := upper(regexp_replace(trim(_codigo), '\s+', '', 'g'));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v
  FROM public.vendedores_parceiros
  WHERE upper(codigo) = normalized_code AND ativo = true;

  IF v IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'codigo_invalido');
  END IF;

  SELECT * INTO emp FROM public.empresas WHERE owner_id = auth.uid();
  IF emp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empresa_inexistente');
  END IF;

  IF emp.vendedor_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ja_vinculada');
  END IF;

  UPDATE public.empresas
  SET vendedor_id = v.user_id,
      ref_codigo_usado = v.codigo
  WHERE id = emp.id;

  INSERT INTO public.indicacoes(
    vendedor_id, empresa_id, codigo, status, comissao_valor,
    premium_inicio, premium_fim
  )
  VALUES (
    v.id, emp.id, v.codigo, 'cadastrada', v.comissao_valor,
    NULL, NULL
  )
  ON CONFLICT (empresa_id) DO NOTHING
  RETURNING id INTO ind_id;

  RETURN jsonb_build_object('ok', true, 'indicacao_id', ind_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_conversao_parceiro(
  _empresa_id uuid,
  _plano_slug text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows integer;
BEGIN
  UPDATE public.indicacoes
  SET status = 'aprovada',
      aprovada_em = COALESCE(aprovada_em, now()),
      primeira_conversao_em = COALESCE(primeira_conversao_em, now()),
      plano_pago_slug = COALESCE(plano_pago_slug, _plano_slug)
  WHERE empresa_id = _empresa_id
    AND status IN ('cadastrada', 'aprovada')
    AND primeira_conversao_em IS NULL;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.track_partner_revenuecat_conversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active'
    AND NEW.empresa_id IS NOT NULL
    AND NEW.entitlement_id IS NOT NULL THEN
    PERFORM public.registrar_conversao_parceiro(NEW.empresa_id, NEW.entitlement_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_partner_revenuecat_conversion
  ON public.revenuecat_subscriptions;
CREATE TRIGGER trg_track_partner_revenuecat_conversion
AFTER INSERT OR UPDATE OF status, entitlement_id
ON public.revenuecat_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.track_partner_revenuecat_conversion();

CREATE OR REPLACE FUNCTION public.track_partner_financeiro_conversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paid_plan_slug text;
BEGIN
  IF NEW.status = 'pago' AND NEW.valor > 0 AND NEW.plano_id IS NOT NULL THEN
    SELECT slug INTO paid_plan_slug FROM public.planos WHERE id = NEW.plano_id;
    IF paid_plan_slug IS NOT NULL AND paid_plan_slug <> 'free' THEN
      PERFORM public.registrar_conversao_parceiro(NEW.empresa_id, paid_plan_slug);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_partner_financeiro_conversion ON public.financeiro;
CREATE TRIGGER trg_track_partner_financeiro_conversion
AFTER INSERT OR UPDATE OF status, plano_id, valor
ON public.financeiro
FOR EACH ROW EXECUTE FUNCTION public.track_partner_financeiro_conversion();

-- A regra antiga de tres anuncios nao gera mais comissao nem muda o status.
CREATE OR REPLACE FUNCTION public.verificar_aprovacao_indicacao(_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN;
END;
$$;

-- Remove trials de indicacao existentes sem afetar assinaturas realmente pagas.
WITH free_plan AS (
  SELECT id FROM public.planos WHERE slug = 'free' LIMIT 1
)
UPDATE public.empresas e
SET plano_id = free_plan.id,
    plano = 'free',
    plano_inicio = NULL,
    plano_vencimento = NULL,
    premium_trial_fim = NULL
FROM free_plan
WHERE e.premium_trial_fim IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.revenuecat_subscriptions r
    WHERE r.empresa_id = e.id AND r.status = 'active'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.financeiro f
    JOIN public.planos p ON p.id = f.plano_id
    WHERE f.empresa_id = e.id
      AND f.status = 'pago'
      AND f.valor > 0
      AND p.slug <> 'free'
      AND f.vencimento > now()
  );

UPDATE public.empresas SET premium_trial_fim = NULL
WHERE premium_trial_fim IS NOT NULL;

UPDATE public.indicacoes
SET premium_inicio = NULL,
    premium_fim = NULL;

UPDATE public.indicacoes
SET status = 'cadastrada',
    aprovada_em = NULL
WHERE status = 'aprovada'
  AND primeira_conversao_em IS NULL;

-- Reconhece pagamentos ja existentes, inclusive os feitos antes desta migration.
UPDATE public.indicacoes i
SET status = 'aprovada',
    aprovada_em = COALESCE(i.aprovada_em, r.created_at),
    primeira_conversao_em = COALESCE(i.primeira_conversao_em, r.created_at),
    plano_pago_slug = COALESCE(i.plano_pago_slug, r.entitlement_id)
FROM public.revenuecat_subscriptions r
WHERE r.empresa_id = i.empresa_id
  AND r.status = 'active'
  AND r.entitlement_id IS NOT NULL;

UPDATE public.indicacoes i
SET status = 'aprovada',
    aprovada_em = COALESCE(i.aprovada_em, f.pagamento, f.created_at),
    primeira_conversao_em = COALESCE(i.primeira_conversao_em, f.pagamento, f.created_at),
    plano_pago_slug = COALESCE(i.plano_pago_slug, p.slug)
FROM public.financeiro f
JOIN public.planos p ON p.id = f.plano_id
WHERE f.empresa_id = i.empresa_id
  AND f.status = 'pago'
  AND f.valor > 0
  AND p.slug <> 'free';

CREATE OR REPLACE FUNCTION public.vendedor_metrics(_vendedor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acessos int;
  cadastros int;
  pagantes int;
  planos_pagos_ativos int;
  valor_total numeric;
  valor_pago numeric;
BEGIN
  SELECT count(*) INTO acessos FROM public.vendedor_cliques WHERE vendedor_id = _vendedor_id;
  SELECT count(*) INTO cadastros FROM public.indicacoes WHERE vendedor_id = _vendedor_id;
  SELECT count(*) INTO pagantes FROM public.indicacoes
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
  SELECT coalesce(sum(comissao_valor), 0) INTO valor_total FROM public.indicacoes
    WHERE vendedor_id = _vendedor_id AND primeira_conversao_em IS NOT NULL;
  SELECT coalesce(sum(comissao_valor), 0) INTO valor_pago FROM public.indicacoes
    WHERE vendedor_id = _vendedor_id AND primeira_conversao_em IS NOT NULL AND paga = true;

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

REVOKE EXECUTE ON FUNCTION public.registrar_conversao_parceiro(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.track_partner_revenuecat_conversion()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.track_partner_financeiro_conversion()
  FROM PUBLIC, anon, authenticated;
