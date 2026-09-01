-- Codigos individuais da Apple para o mes gratuito de parceiros.
-- Os codigos nunca ficam disponiveis por SELECT para o aplicativo.

CREATE TABLE IF NOT EXISTS public.partner_apple_offer_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  plan_slug text NOT NULL CHECK (plan_slug IN ('tx', 'ultra', 'premium')),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  expires_at timestamptz NOT NULL,
  assigned_eligibility_id uuid UNIQUE
    REFERENCES public.partner_store_trial_eligibility(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (
    (assigned_eligibility_id IS NULL AND assigned_at IS NULL)
    OR (assigned_eligibility_id IS NOT NULL AND assigned_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_partner_apple_codes_available
  ON public.partner_apple_offer_codes(plan_slug, environment, expires_at)
  WHERE assigned_eligibility_id IS NULL;

ALTER TABLE public.partner_apple_offer_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.partner_apple_offer_codes
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.partner_apple_offer_codes TO service_role;

CREATE OR REPLACE FUNCTION public.claim_partner_apple_offer_code(
  _plan_slug text,
  _environment text DEFAULT 'production'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eligibility_record record;
  code_record record;
  normalized_plan text := lower(trim(_plan_slug));
  normalized_environment text := lower(trim(_environment));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF normalized_plan NOT IN ('tx', 'ultra', 'premium') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_plan');
  END IF;

  IF normalized_environment NOT IN ('sandbox', 'production') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_environment');
  END IF;

  SELECT t.id, t.reserved_plan, t.reserved_platform
  INTO eligibility_record
  FROM public.empresas e
  JOIN public.indicacoes i ON i.empresa_id = e.id
  JOIN public.vendedores_parceiros v
    ON v.id = i.vendedor_id AND v.ativo = true
  JOIN public.partner_store_trial_eligibility t
    ON t.indicacao_id = i.id AND t.empresa_id = e.id
  WHERE e.owner_id = auth.uid()
    AND i.status = 'cadastrada'
    AND i.primeira_conversao_em IS NULL
    AND t.redeemed_at IS NULL
    AND now() >= t.eligible_from
    AND now() < t.eligible_until
    AND NOT EXISTS (
      SELECT 1 FROM public.revenuecat_subscriptions r
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
  LIMIT 1
  FOR UPDATE OF t;

  IF eligibility_record IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_eligible');
  END IF;

  SELECT c.code, c.plan_slug, c.environment, c.expires_at
  INTO code_record
  FROM public.partner_apple_offer_codes c
  WHERE c.assigned_eligibility_id = eligibility_record.id
  LIMIT 1;

  IF code_record IS NOT NULL THEN
    IF code_record.plan_slug <> normalized_plan
      OR code_record.environment <> normalized_environment THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'offer_already_reserved',
        'reserved_plan', code_record.plan_slug
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'code', code_record.code,
      'plan', code_record.plan_slug,
      'environment', code_record.environment,
      'expires_at', code_record.expires_at,
      'redeem_url', 'https://apps.apple.com/redeem?ctx=offercodes&id=6799402979&code=' || code_record.code
    );
  END IF;

  SELECT c.id, c.code, c.expires_at
  INTO code_record
  FROM public.partner_apple_offer_codes c
  WHERE c.plan_slug = normalized_plan
    AND c.environment = normalized_environment
    AND c.assigned_eligibility_id IS NULL
    AND c.redeemed_at IS NULL
    AND c.expires_at > now()
  ORDER BY c.expires_at, c.created_at
  LIMIT 1
  FOR UPDATE OF c SKIP LOCKED;

  IF code_record IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_codes_available');
  END IF;

  UPDATE public.partner_apple_offer_codes
  SET assigned_eligibility_id = eligibility_record.id,
      assigned_at = now(),
      updated_at = now()
  WHERE id = code_record.id;

  UPDATE public.partner_store_trial_eligibility
  SET reserved_platform = 'ios',
      reserved_plan = normalized_plan,
      reserved_at = now(),
      updated_at = now()
  WHERE id = eligibility_record.id;

  RETURN jsonb_build_object(
    'ok', true,
    'code', code_record.code,
    'plan', normalized_plan,
    'environment', normalized_environment,
    'expires_at', code_record.expires_at,
    'redeem_url', 'https://apps.apple.com/redeem?ctx=offercodes&id=6799402979&code=' || code_record.code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_partner_apple_offer_code(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_partner_apple_offer_code(text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_partner_apple_offer_code_redeemed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active'
    AND NEW.empresa_id IS NOT NULL
    AND NEW.product_id IS NOT NULL THEN
    UPDATE public.partner_apple_offer_codes c
    SET redeemed_at = COALESCE(c.redeemed_at, now()),
        updated_at = now()
    FROM public.partner_store_trial_eligibility t
    WHERE t.id = c.assigned_eligibility_id
      AND t.empresa_id = NEW.empresa_id
      AND c.redeemed_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_partner_apple_offer_code_redeemed
  ON public.revenuecat_subscriptions;
CREATE TRIGGER trg_mark_partner_apple_offer_code_redeemed
AFTER INSERT OR UPDATE OF status, product_id
ON public.revenuecat_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.mark_partner_apple_offer_code_redeemed();

REVOKE ALL ON FUNCTION public.mark_partner_apple_offer_code_redeemed()
  FROM PUBLIC, anon, authenticated;

