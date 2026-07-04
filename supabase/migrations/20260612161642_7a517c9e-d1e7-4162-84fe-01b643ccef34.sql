ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS bairro text;