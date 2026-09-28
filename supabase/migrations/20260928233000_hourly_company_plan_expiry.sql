-- Ajusta somente a frequência; não executa vencimentos nem altera planos agora.
BEGIN;
DO $$
DECLARE
  expiry_job bigint;
BEGIN
  SELECT jobid INTO expiry_job FROM cron.job
    WHERE jobname = 'sos-expire-company-plans';
  IF expiry_job IS NULL THEN
    RAISE EXCEPTION 'A rotina de vencimento não foi instalada. Execute primeiro 20260928230000_expire_company_plans.sql.';
  END IF;
  PERFORM cron.alter_job(expiry_job, schedule := '0 * * * *');
END;
$$;
COMMIT;
