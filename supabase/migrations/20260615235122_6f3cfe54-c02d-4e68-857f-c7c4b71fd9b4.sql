ALTER TABLE public.padroes DROP COLUMN IF EXISTS imagem_url;

DROP POLICY IF EXISTS "Admin delete padroes" ON storage.objects;
DROP POLICY IF EXISTS "Admin update padroes" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload padroes" ON storage.objects;
DROP POLICY IF EXISTS "Padroes imagens leitura publica" ON storage.objects;