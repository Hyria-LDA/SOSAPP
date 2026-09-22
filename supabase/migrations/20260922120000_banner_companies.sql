BEGIN;
CREATE TABLE IF NOT EXISTS public.banner_empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS banner_empresas_nome_unique ON public.banner_empresas (lower(btrim(nome)));
ALTER TABLE public.banner_empresas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.banner_empresas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banner_empresas TO authenticated;
DROP POLICY IF EXISTS banner_empresas_admin ON public.banner_empresas;
CREATE POLICY banner_empresas_admin ON public.banner_empresas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS anunciante_id uuid
  REFERENCES public.banner_empresas(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS banners_anunciante_id_idx ON public.banners(anunciante_id);
COMMIT;
