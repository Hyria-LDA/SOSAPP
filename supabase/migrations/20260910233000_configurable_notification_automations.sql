-- Tres notificacoes automaticas configuraveis pelo painel administrativo.
CREATE TABLE IF NOT EXISTS public.notification_automation_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position smallint NOT NULL UNIQUE CHECK (position BETWEEN 1 AND 3),
  send_time time NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 180),
  audience text NOT NULL CHECK (audience IN (
    'no_registration', 'active_registration', 'plan_tx', 'plan_ultra', 'plan_premium', 'all'
  )),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_automation_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage notification automations"
  ON public.notification_automation_schedules;
CREATE POLICY "admins manage notification automations"
ON public.notification_automation_schedules
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.notification_automation_schedules TO authenticated;
GRANT ALL ON public.notification_automation_schedules TO service_role;

INSERT INTO public.notification_automation_schedules
  (position, send_time, title, body, audience, active)
VALUES
  (1, '09:00', 'Falta pouco para comecar',
   'Conclua o cadastro da sua marcenaria e aproveite todos os recursos do SOS Marceneiros.',
   'no_registration', true),
  (2, '14:00', 'Seu cadastro esta quase pronto',
   'Continue de onde parou. Leva poucos minutos para liberar sua conta no SOS Marceneiros.',
   'no_registration', true),
  (3, '19:00', 'Conclua seu cadastro hoje',
   'Preencha os dados que faltam e deixe sua conta pronta para usar o SOS Marceneiros.',
   'no_registration', true)
ON CONFLICT (position) DO NOTHING;

DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'onboarding-reminder-morning',
      'onboarding-reminder-afternoon',
      'onboarding-reminder-evening',
      'notification-automations-tick'
    )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'notification-automations-tick',
    '* * * * 1-5',
    $job$
      SELECT net.http_post(
        url := 'https://yzbfjqeltqgqpqecmwdv.supabase.co/functions/v1/send-onboarding-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'onboarding_reminder_cron_secret' LIMIT 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      );
    $job$
  );
END;
$$;
