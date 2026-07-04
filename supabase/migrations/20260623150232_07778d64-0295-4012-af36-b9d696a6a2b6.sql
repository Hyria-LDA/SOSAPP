ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS exibir_abertura boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duracao_segundos integer NOT NULL DEFAULT 10;