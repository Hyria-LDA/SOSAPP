
-- Reset column-level grant and policy from previous step
DROP POLICY IF EXISTS "Authenticated read safe columns of active empresas" ON public.empresas;
REVOKE SELECT ON public.empresas FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas TO authenticated;

-- Strict policy: only owner or admin reads empresa rows fully
CREATE POLICY "Owner or admin reads empresa"
ON public.empresas FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Recreate public view with SECURITY DEFINER semantics (bypasses RLS so non-owners can read safe columns of active empresas)
DROP VIEW IF EXISTS public.empresas_publica;
CREATE VIEW public.empresas_publica
WITH (security_invoker = false) AS
SELECT
  id, nome_empresa, responsavel, whatsapp, telefone,
  cidade, estado, latitude, longitude, logo_url,
  avaliacao, status, created_at
FROM public.empresas
WHERE status IN ('ativa','pendente');

GRANT SELECT ON public.empresas_publica TO authenticated, anon;
