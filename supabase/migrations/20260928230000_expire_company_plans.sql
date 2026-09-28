BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE OR REPLACE FUNCTION public.expire_company_plans()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  free_id uuid;
  affected integer;
BEGIN
  SELECT id INTO free_id FROM public.planos WHERE slug = 'free';
  IF free_id IS NULL THEN RAISE EXCEPTION 'Plano Free não encontrado'; END IF;
  WITH expired AS MATERIALIZED (
    SELECT e.id, e.plano AS old_plan, e.plano_vencimento AS old_expiry
    FROM public.empresas e
    WHERE e.plano_vencimento IS NOT NULL AND e.plano_vencimento <= now()
      AND (e.plano_id IS DISTINCT FROM free_id OR lower(coalesce(e.plano, '')) <> 'free')
      AND NOT EXISTS (
        SELECT 1 FROM public.revenuecat_subscriptions r
        WHERE r.user_id = e.owner_id AND r.status = 'active'
          AND (r.expires_at IS NULL OR r.expires_at > now())
      )
    FOR UPDATE OF e
  ), changed AS (
    UPDATE public.empresas e SET plano_id = free_id, plano = 'free'
    FROM expired x WHERE e.id = x.id
    RETURNING e.id, x.old_plan, x.old_expiry
  )
  INSERT INTO public.empresa_historico(empresa_id, autor_id, tipo, descricao)
  SELECT id, NULL, 'plano',
    format('Plano %s vencido em %s (UTC). Alterado automaticamente para Free.', old_plan, old_expiry AT TIME ZONE 'UTC')
  FROM changed;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
-- Execução exclusiva do agendador/SQL Editor. Clientes não podem disparar a rotina.
REVOKE ALL ON FUNCTION public.expire_company_plans() FROM PUBLIC, anon, authenticated;

-- Corrige os vencidos existentes e mantém as datas para consulta do histórico.
SELECT public.expire_company_plans();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sos-expire-company-plans') THEN
    PERFORM cron.unschedule('sos-expire-company-plans');
  END IF;
  PERFORM cron.schedule('sos-expire-company-plans', '* * * * *', 'SELECT public.expire_company_plans();');
END;
$$;
COMMIT;
