BEGIN;
ALTER TABLE public.banners DROP CONSTRAINT IF EXISTS banners_target_region_check;
ALTER TABLE public.banners ADD CONSTRAINT banners_target_region_check CHECK (
  (target_scope = 'all' AND target_uf IS NULL AND target_city IS NULL)
  OR (target_scope = 'state' AND target_uf IS NOT NULL AND btrim(target_uf) <> '' AND target_city IS NULL)
  OR (target_scope = 'city' AND target_uf IS NOT NULL AND btrim(target_uf) <> '' AND target_city IS NOT NULL AND btrim(target_city) <> '')
  OR (target_scope = 'all_except' AND target_uf IS NULL AND target_city IS NOT NULL AND btrim(target_city) <> '')
);
COMMIT;
