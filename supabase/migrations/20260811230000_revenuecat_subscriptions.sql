CREATE TABLE IF NOT EXISTS public.revenuecat_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  app_user_id text NOT NULL UNIQUE,
  entitlement_id text,
  product_id text,
  status text NOT NULL DEFAULT 'none'
    CHECK (status IN ('active', 'expired', 'none')),
  expires_at timestamptz,
  will_renew boolean,
  sandbox boolean,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.revenuecat_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios veem sua assinatura RevenueCat"
  ON public.revenuecat_subscriptions;
CREATE POLICY "Usuarios veem sua assinatura RevenueCat"
  ON public.revenuecat_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.revenuecat_subscriptions TO authenticated;
GRANT ALL ON public.revenuecat_subscriptions TO service_role;

CREATE INDEX IF NOT EXISTS idx_revenuecat_subscriptions_empresa
  ON public.revenuecat_subscriptions(empresa_id);
CREATE INDEX IF NOT EXISTS idx_revenuecat_subscriptions_status_expiry
  ON public.revenuecat_subscriptions(status, expires_at);
