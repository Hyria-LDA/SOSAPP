-- Miniatura leve usada nas listagens; a foto original continua disponível nos detalhes.
ALTER TABLE public.fotos_materiais
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

