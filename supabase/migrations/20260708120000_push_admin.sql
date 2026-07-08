CREATE TABLE IF NOT EXISTS public.push_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 180),
  target text NOT NULL DEFAULT 'all',
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  total_tokens integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_broadcasts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_tokens'
      AND policyname = 'admins read push tokens'
  ) THEN
    CREATE POLICY "admins read push tokens"
    ON public.push_tokens
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_broadcasts'
      AND policyname = 'admins read push broadcasts'
  ) THEN
    CREATE POLICY "admins read push broadcasts"
    ON public.push_broadcasts
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

GRANT SELECT ON public.push_broadcasts TO authenticated;
GRANT ALL ON public.push_broadcasts TO service_role;
