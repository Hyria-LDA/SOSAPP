ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS banner_format text NOT NULL DEFAULT 'horizontal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'banners_banner_format_check'
      AND conrelid = 'public.banners'::regclass
  ) THEN
    ALTER TABLE public.banners
      ADD CONSTRAINT banners_banner_format_check
      CHECK (banner_format IN ('horizontal', 'vertical'));
  END IF;
END $$;

COMMENT ON COLUMN public.banners.banner_format IS
  'horizontal: carrossel 16:9; vertical: publicidade de abertura 9:16';
