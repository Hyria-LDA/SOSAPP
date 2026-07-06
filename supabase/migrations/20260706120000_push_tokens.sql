CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'android',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_active
ON public.push_tokens(user_id, active);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own push tokens"
ON public.push_tokens
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "user deletes own push tokens"
ON public.push_tokens
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT, DELETE ON public.push_tokens TO authenticated;
GRANT ALL ON public.push_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.register_push_token(
  p_token text,
  p_platform text DEFAULT 'android'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.push_tokens(user_id, token, platform, active, last_seen_at)
  VALUES (auth.uid(), p_token, COALESCE(NULLIF(p_platform, ''), 'android'), true, now())
  ON CONFLICT (token) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      platform = EXCLUDED.platform,
      active = true,
      last_seen_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO authenticated;
