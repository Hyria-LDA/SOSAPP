CREATE TABLE IF NOT EXISTS public.app_update_policy (
  platform text PRIMARY KEY CHECK (platform IN ('android', 'ios')),
  min_build integer NOT NULL DEFAULT 1 CHECK (min_build > 0),
  latest_version text NOT NULL DEFAULT '',
  force_update boolean NOT NULL DEFAULT false,
  message text NOT NULL DEFAULT 'Uma nova versão do aplicativo está disponível.',
  store_url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_update_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Política de atualização é pública" ON public.app_update_policy;
CREATE POLICY "Política de atualização é pública"
  ON public.app_update_policy FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Administradores gerenciam atualização" ON public.app_update_policy;
CREATE POLICY "Administradores gerenciam atualização"
  ON public.app_update_policy FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.app_update_policy TO anon, authenticated;
GRANT INSERT, UPDATE ON public.app_update_policy TO authenticated;
GRANT ALL ON public.app_update_policy TO service_role;

INSERT INTO public.app_update_policy
  (platform, min_build, latest_version, force_update, message, store_url)
VALUES
  (
    'android',
    1,
    '1.0.18',
    false,
    'Atualize o SOS Marceneiros para continuar usando o aplicativo.',
    'https://play.google.com/store/apps/details?id=br.com.sosmarceneiros.app'
  ),
  (
    'ios',
    1,
    '1.0.18',
    false,
    'Atualize o SOS Marceneiros para continuar usando o aplicativo.',
    'https://apps.apple.com/app/id6799402979'
  )
ON CONFLICT (platform) DO NOTHING;

