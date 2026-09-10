-- Lembretes de cadastro incompleto: segunda a sexta, as 09h, 14h e 19h
-- no horario de Brasilia. O segredo fica no Vault e nunca e exposto ao app.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE TABLE IF NOT EXISTS public.onboarding_reminder_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key text NOT NULL UNIQUE,
  slot text NOT NULL CHECK (slot IN ('morning', 'afternoon', 'evening')),
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  total_recipients integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_reminder_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read onboarding reminder runs" ON public.onboarding_reminder_runs;
CREATE POLICY "admins read onboarding reminder runs"
ON public.onboarding_reminder_runs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.onboarding_reminder_runs TO authenticated;
GRANT ALL ON public.onboarding_reminder_runs TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'onboarding_reminder_cron_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'onboarding_reminder_cron_secret',
      'Autenticacao interna dos lembretes de cadastro incompleto'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_onboarding_reminder_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'onboarding_reminder_cron_secret'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_onboarding_reminder_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_onboarding_reminder_cron_secret() TO service_role;

DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'onboarding-reminder-morning',
      'onboarding-reminder-afternoon',
      'onboarding-reminder-evening'
    )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'onboarding-reminder-morning',
    '0 12 * * 1-5',
    $job$
      SELECT net.http_post(
        url := 'https://yzbfjqeltqgqpqecmwdv.supabase.co/functions/v1/send-onboarding-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'onboarding_reminder_cron_secret' LIMIT 1)
        ),
        body := '{"slot":"morning"}'::jsonb,
        timeout_milliseconds := 55000
      );
    $job$
  );

  PERFORM cron.schedule(
    'onboarding-reminder-afternoon',
    '0 17 * * 1-5',
    $job$
      SELECT net.http_post(
        url := 'https://yzbfjqeltqgqpqecmwdv.supabase.co/functions/v1/send-onboarding-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'onboarding_reminder_cron_secret' LIMIT 1)
        ),
        body := '{"slot":"afternoon"}'::jsonb,
        timeout_milliseconds := 55000
      );
    $job$
  );

  PERFORM cron.schedule(
    'onboarding-reminder-evening',
    '0 22 * * 1-5',
    $job$
      SELECT net.http_post(
        url := 'https://yzbfjqeltqgqpqecmwdv.supabase.co/functions/v1/send-onboarding-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'onboarding_reminder_cron_secret' LIMIT 1)
        ),
        body := '{"slot":"evening"}'::jsonb,
        timeout_milliseconds := 55000
      );
    $job$
  );
END;
$$;
