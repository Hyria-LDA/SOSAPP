-- Guarda a imagem opcional usada em notificacoes push enviadas pelo painel.

ALTER TABLE public.push_broadcasts
ADD COLUMN IF NOT EXISTS image_url text;
