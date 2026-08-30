ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS target_scope text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS target_uf text,
  ADD COLUMN IF NOT EXISTS target_city text;

UPDATE public.banners
SET target_scope = 'all'
WHERE target_scope IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.banners'::regclass
      AND conname = 'banners_target_region_check'
  ) THEN
    ALTER TABLE public.banners
      ADD CONSTRAINT banners_target_region_check CHECK (
        (target_scope = 'all' AND target_uf IS NULL AND target_city IS NULL)
        OR (target_scope = 'state' AND target_uf IS NOT NULL AND btrim(target_uf) <> '' AND target_city IS NULL)
        OR (target_scope = 'city' AND target_uf IS NOT NULL AND btrim(target_uf) <> '' AND target_city IS NOT NULL AND btrim(target_city) <> '')
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.banners VALIDATE CONSTRAINT banners_target_region_check;

CREATE INDEX IF NOT EXISTS idx_banners_target_region
  ON public.banners (target_scope, target_uf)
  WHERE ativo = true;
