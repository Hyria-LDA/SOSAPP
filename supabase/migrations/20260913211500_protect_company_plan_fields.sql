-- Prevent authenticated company owners from granting themselves paid-plan access.
--
-- The application must keep table-level UPDATE access because owners edit their
-- profile directly.  RLS restricts the row, but it cannot restrict which columns
-- are changed, so this trigger protects only the entitlement fields. Admin users
-- and backend/service-role calls keep their existing behavior.

CREATE OR REPLACE FUNCTION public.protect_company_plan_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_is_admin boolean := false;
  is_onboarding_activation boolean := false;
  free_plan_id uuid;
BEGIN
  -- Backend jobs and Edge Functions using the service-role key have no user id.
  -- They remain authorized to synchronize RevenueCat and administrative plans.
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  caller_is_admin := public.has_role(caller_id, 'admin');
  IF caller_is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT id
      INTO free_plan_id
      FROM public.planos
     WHERE slug = 'free'
     LIMIT 1;

    -- New companies always start active only when onboarding is complete and
    -- always use the free plan. Server-side timestamps cannot be forged by the
    -- client.
    NEW.status := CASE
      WHEN COALESCE(NEW.onboarded, false) THEN 'ativa'::public.empresa_status
      ELSE 'pendente'::public.empresa_status
    END;
    NEW.plano := 'free';
    NEW.plano_id := free_plan_id;
    NEW.plano_inicio := now();
    NEW.plano_vencimento := NULL;
    NEW.premium_trial_fim := NULL;
    RETURN NEW;
  END IF;

  -- The auth trigger creates a pending company shell before onboarding. Allow
  -- exactly the transition the onboarding screen needs; suspension/block state
  -- can never be cleared by an owner through a later profile update.
  is_onboarding_activation :=
    COALESCE(OLD.onboarded, false) = false
    AND COALESCE(NEW.onboarded, false) = true
    AND OLD.status = 'pendente'::public.empresa_status
    AND NEW.status = 'ativa'::public.empresa_status;

  -- Silently preserve entitlement fields on owner updates. This is intentional:
  -- onboarding uses UPSERT and sends free-plan values, so raising an exception
  -- here would break a legitimate retry while preserving the old values is safe.
  NEW.plano := OLD.plano;
  NEW.plano_id := OLD.plano_id;
  NEW.plano_inicio := OLD.plano_inicio;
  NEW.plano_vencimento := OLD.plano_vencimento;
  NEW.premium_trial_fim := OLD.premium_trial_fim;
  IF NOT is_onboarding_activation THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_company_plan_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_company_plan_fields_before_write ON public.empresas;
CREATE TRIGGER protect_company_plan_fields_before_write
BEFORE INSERT OR UPDATE ON public.empresas
FOR EACH ROW
EXECUTE FUNCTION public.protect_company_plan_fields();

COMMENT ON FUNCTION public.protect_company_plan_fields() IS
  'Prevents non-admin authenticated users from changing company plan entitlement fields.';
