
-- 1) Restrict empresas SELECT to owner/admin
DROP POLICY IF EXISTS "Empresas visíveis a logados" ON public.empresas;
CREATE POLICY "Owner or admin reads empresa"
ON public.empresas FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 2) Public-safe view for marketplace consumption
CREATE OR REPLACE VIEW public.empresas_publica
WITH (security_invoker = true) AS
SELECT
  id, nome_empresa, responsavel, whatsapp, telefone,
  cidade, estado, latitude, longitude, logo_url,
  avaliacao, status, created_at
FROM public.empresas
WHERE status IN ('ativa','pendente');

-- Grant authenticated to read the view (RLS still applies via security_invoker on the underlying table — so we open a dedicated policy below)
GRANT SELECT ON public.empresas_publica TO authenticated;

-- Add an RLS policy on the underlying table that lets authenticated users read ONLY non-sensitive rows
-- The view selects a limited column set, so even though base table now exposes the row, only safe columns are projected by callers via the view.
-- Restore broad read but only for safe-column consumption via view; sensitive fields remain off-limits at column level using a column GRANT.
REVOKE SELECT ON public.empresas FROM authenticated;
GRANT SELECT (id, nome_empresa, responsavel, whatsapp, telefone, cidade, estado, latitude, longitude, logo_url, avaliacao, status, created_at, owner_id)
  ON public.empresas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas TO service_role;

-- Add back a SELECT policy permitting reads of active/pending rows (safe columns only thanks to column GRANT)
CREATE POLICY "Authenticated read safe columns of active empresas"
ON public.empresas FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR status IN ('ativa','pendente')
);
DROP POLICY IF EXISTS "Owner or admin reads empresa" ON public.empresas;

-- 3) Storage bucket: restrict public read to authenticated
DROP POLICY IF EXISTS "Materiais bucket público leitura" ON storage.objects;
CREATE POLICY "Materiais bucket leitura autenticada"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'materiais');

-- 4) Lock down trigger function from direct call
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;
