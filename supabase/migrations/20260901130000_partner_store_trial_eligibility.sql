-- Elegibilidade segura para a promocao de 30 dias nas lojas.
-- A loja continua responsavel pelo trial e pela cobranca posterior.

CREATE TABLE IF NOT EXISTS public.partner_store_trial_eligibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicacao_id uuid NOT NULL UNIQUE
    REFERENCES public.indicacoes(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL UNIQUE
    REFERENCES public.empresas(id) ON DELETE CASCADE,
  vendedor_id uuid NOT NULL
    REFERENCES public.vendedores_parceiros(id) ON DELETE RESTRICT,
  eligible_from timestamptz NOT NULL DEFAULT now(),
  eligible_until timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  reserved_platform text
    CHECK (reserved_platform IS NULL OR reserved_platform IN ('android', 'ios')),
  reserved_plan text
    CHECK (reserved_plan IS NULL OR reserved_plan IN ('tx', 'ultra', 'premium')),
  reserved_at timestamptz,
  redeemed_at timestamptz,
  store_product_id text,
  store_transaction_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (eligible_until > eligible_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_trial_store_transaction
  ON public.partner_store_trial_eligibility(store_transaction_id)
  WHERE store_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partner_trial_vendor_created
  ON public.partner_store_trial_eligibility(vendedor_id, created_at DESC);

ALTER TABLE public.partner_store_trial_eligibility ENABLE ROW LEVEL SECURITY;

-- Nenhum acesso direto pelo aplicativo. Somente funcoes controladas e service_role.
REVOKE ALL ON TABLE public.partner_store_trial_eligibility
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.partner_store_trial_eligibility TO service_role;

CREATE OR REPLACE FUNCTION public.create_partner_store_trial_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.partner_store_trial_eligibility(
    indicacao_id,
    empresa_id,
    vendedor_id,
    eligible_from,
    eligible_until
  )
  VALUES (
    NEW.id,
    NEW.empresa_id,
    NEW.vendedor_id,
    NEW.created_at,
    NEW.created_at + interval '90 days'
  )
  ON CONFLICT (empresa_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_partner_store_trial_eligibility
  ON public.indicacoes;
CREATE TRIGGER trg_create_partner_store_trial_eligibility
AFTER INSERT ON public.indicacoes
FOR EACH ROW
EXECUTE FUNCTION public.create_partner_store_trial_eligibility();

-- Inclui indicacoes recentes que ainda nao tiveram conversao.
INSERT INTO public.partner_store_trial_eligibility(
  indicacao_id,
  empresa_id,
  vendedor_id,
  eligible_from,
  eligible_until
)
SELECT
  i.id,
  i.empresa_id,
  i.vendedor_id,
  i.created_at,
  i.created_at + interval '90 days'
FROM public.indicacoes i
JOIN public.vendedores_parceiros v
  ON v.id = i.vendedor_id AND v.ativo = true
WHERE i.primeira_conversao_em IS NULL
  AND i.created_at + interval '90 days' > now()
ON CONFLICT (empresa_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_partner_store_trial_eligibility()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_record record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'not_authenticated');
  END IF;

  SELECT
    t.eligible_until,
    i.codigo
  INTO result_record
  FROM public.empresas e
  JOIN public.indicacoes i ON i.empresa_id = e.id
  JOIN public.vendedores_parceiros v
    ON v.id = i.vendedor_id AND v.ativo = true
  JOIN public.partner_store_trial_eligibility t
    ON t.indicacao_id = i.id AND t.empresa_id = e.id
  WHERE e.owner_id = auth.uid()
    AND i.primeira_conversao_em IS NULL
    AND i.status = 'cadastrada'
    AND t.redeemed_at IS NULL
    AND now() >= t.eligible_from
    AND now() < t.eligible_until
    AND NOT EXISTS (
      SELECT 1
      FROM public.revenuecat_subscriptions r
      WHERE r.empresa_id = e.id
        AND (r.status = 'active' OR r.product_id IS NOT NULL)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.financeiro f
      JOIN public.planos p ON p.id = f.plano_id
      WHERE f.empresa_id = e.id
        AND f.status = 'pago'
        AND f.valor > 0
        AND p.slug <> 'free'
    )
  LIMIT 1;

  IF result_record IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'not_eligible');
  END IF;

  RETURN jsonb_build_object(
    'eligible', true,
    'eligible_until', result_record.eligible_until,
    'partner_code', result_record.codigo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_partner_store_trial_eligibility()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_store_trial_eligibility()
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_partner_store_trial_eligibility()
  FROM PUBLIC, anon, authenticated;

