CREATE TABLE IF NOT EXISTS public.vendedor_instalacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.vendedores_parceiros(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  installation_id uuid NOT NULL UNIQUE,
  plataforma text NOT NULL CHECK (plataforma IN ('android', 'ios')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendedor_instalacoes_vendedor
  ON public.vendedor_instalacoes(vendedor_id, created_at DESC);

ALTER TABLE public.vendedor_instalacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendedor_instalacoes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.vendedor_instalacoes TO service_role;

CREATE OR REPLACE FUNCTION public.vendedor_metrics(_vendedor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  result jsonb;
BEGIN
  IF caller_id IS NULL OR (
    NOT public.has_role(caller_id, 'admin') AND NOT EXISTS (
      SELECT 1 FROM public.vendedores_parceiros
      WHERE id = _vendedor_id AND user_id = caller_id
    )
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
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
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vendedor_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendedor_metrics(uuid) TO authenticated;
