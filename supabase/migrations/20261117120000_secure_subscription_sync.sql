-- Apply before deploying sync-revenuecat-subscription. No payments or messages sent.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS plano_origem text NOT NULL DEFAULT 'legacy'
  CHECK (plano_origem IN ('legacy', 'manual', 'revenuecat'));

-- Preserve existing paid grants unless their expiry matches a known store subscription.
UPDATE public.empresas e SET plano_origem = CASE WHEN EXISTS (
  SELECT 1 FROM public.revenuecat_subscriptions r WHERE r.user_id=e.owner_id
  AND r.status='active' AND r.sandbox IS FALSE
  AND r.expires_at IS NOT DISTINCT FROM e.plano_vencimento
) THEN 'revenuecat' ELSE 'manual' END
WHERE e.plano_origem='legacy' AND coalesce(e.plano, 'free') <> 'free';

CREATE OR REPLACE FUNCTION public.protect_company_plan_origin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF public.has_role(auth.uid(), 'admin') THEN
      IF TG_OP='INSERT' THEN
        NEW.plano_origem := 'manual';
      ELSIF ROW(NEW.plano_id,NEW.plano,NEW.plano_inicio,NEW.plano_vencimento)
        IS DISTINCT FROM ROW(OLD.plano_id,OLD.plano,OLD.plano_inicio,OLD.plano_vencimento) THEN
        NEW.plano_origem := 'manual';
      END IF;
    ELSE
      IF TG_OP='INSERT' THEN NEW.plano_origem := 'legacy';
      ELSE NEW.plano_origem := OLD.plano_origem; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_company_plan_origin() FROM PUBLIC;
-- Runs after the existing plan-field guard, so rejected owner edits cannot mark a grant manual.
DROP TRIGGER IF EXISTS zz_protect_company_plan_origin ON public.empresas;
CREATE TRIGGER zz_protect_company_plan_origin BEFORE INSERT OR UPDATE ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.protect_company_plan_origin();

CREATE OR REPLACE FUNCTION public.apply_revenuecat_subscription(_user_id uuid, _subscription jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  company public.empresas%ROWTYPE;
  plan_id uuid;
  sub_status text := _subscription->>'status';
  expiry timestamptz := (_subscription->>'expires_at')::timestamptz;
  manual_active boolean;
BEGIN
  IF sub_status IS NULL OR sub_status NOT IN ('active','expired','none') THEN
    RAISE EXCEPTION 'invalid_subscription_status';
  END IF;
  IF sub_status='active' AND (
    (_subscription->>'sandbox')::boolean IS DISTINCT FROM false OR
    (expiry IS NOT NULL AND expiry <= now())
  ) THEN RAISE EXCEPTION 'production_purchase_required'; END IF;

  SELECT * INTO company FROM public.empresas WHERE owner_id=_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'company_not_found'; END IF;
  manual_active := company.plano_origem='manual' AND company.plano <> 'free'
    AND (company.plano_vencimento IS NULL OR company.plano_vencimento > now());

  IF NOT manual_active AND (sub_status='active' OR company.plano_origem='revenuecat') THEN
    SELECT id INTO plan_id FROM public.planos
      WHERE slug=CASE WHEN sub_status='active' THEN 'ultra' ELSE 'free' END AND ativo=true;
    IF plan_id IS NULL THEN RAISE EXCEPTION 'plan_not_found'; END IF;
    UPDATE public.empresas SET plano_id=plan_id,
      plano=CASE WHEN sub_status='active' THEN 'ultra' ELSE 'free' END,
      plano_inicio=CASE WHEN sub_status='active' THEN coalesce((_subscription->>'purchase_date')::timestamptz,now()) ELSE NULL END,
      plano_vencimento=CASE WHEN sub_status='active' THEN expiry ELSE NULL END,
      plano_origem='revenuecat'
    WHERE id=company.id RETURNING * INTO company;
  END IF;

  INSERT INTO public.revenuecat_subscriptions(user_id,empresa_id,app_user_id,entitlement_id,product_id,
    status,expires_at,will_renew,sandbox,last_synced_at,updated_at)
  VALUES (_user_id,company.id,_user_id::text,_subscription->>'entitlement_id',_subscription->>'product_id',
    sub_status,expiry,(_subscription->>'will_renew')::boolean,(_subscription->>'sandbox')::boolean,now(),now())
  ON CONFLICT(user_id) DO UPDATE SET empresa_id=excluded.empresa_id,
    entitlement_id=excluded.entitlement_id,product_id=excluded.product_id,status=excluded.status,
    expires_at=excluded.expires_at,will_renew=excluded.will_renew,sandbox=excluded.sandbox,
    last_synced_at=excluded.last_synced_at,updated_at=excluded.updated_at;
  RETURN jsonb_build_object('active',company.plano <> 'free' AND
    (company.plano_vencimento IS NULL OR company.plano_vencimento > now()),
    'plan',company.plano,'expiresAt',company.plano_vencimento,'source',company.plano_origem);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_revenuecat_subscription(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_revenuecat_subscription(uuid,jsonb) TO service_role;
COMMIT;
