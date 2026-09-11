-- O WhatsApp dos anuncios so e revelado a usuarios de empresas ativas.
-- Administradores mantem acesso para executar a moderacao e o suporte.
CREATE OR REPLACE FUNCTION public.can_access_ad_whatsapp()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.empresas viewer
      WHERE viewer.owner_id = auth.uid()
        AND viewer.status = 'ativa'
        AND viewer.onboarded = true
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_ad_whatsapp() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_ad_whatsapp() TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.empresas_publica
WITH (security_invoker = false) AS
SELECT
  id,
  nome_empresa,
  responsavel,
  CASE WHEN public.can_access_ad_whatsapp() THEN whatsapp ELSE NULL END AS whatsapp,
  telefone,
  cidade,
  estado,
  latitude,
  longitude,
  logo_url,
  avaliacao,
  status,
  created_at
FROM public.empresas
WHERE status IN ('ativa', 'pendente');

GRANT SELECT ON public.empresas_publica TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.empresa_publica(_empresa_id uuid)
RETURNS TABLE (
  id uuid,
  nome_empresa text,
  responsavel text,
  whatsapp text,
  telefone text,
  cidade text,
  estado text,
  latitude double precision,
  longitude double precision,
  logo_url text,
  avaliacao numeric,
  status public.empresa_status,
  created_at timestamptz,
  plano_slug text,
  plano_nome text,
  plano_vigente boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.nome_empresa,
    e.responsavel,
    CASE WHEN public.can_access_ad_whatsapp() THEN e.whatsapp ELSE NULL END,
    e.telefone,
    e.cidade,
    e.estado,
    e.latitude,
    e.longitude,
    e.logo_url,
    e.avaliacao,
    e.status,
    e.created_at,
    p.slug AS plano_slug,
    p.nome AS plano_nome,
    (p.slug = 'free' OR e.plano_vencimento IS NULL OR e.plano_vencimento > now()) AS plano_vigente
  FROM public.empresas e
  LEFT JOIN public.planos p ON p.id = e.plano_id
  WHERE e.id = _empresa_id
    AND e.status IN ('ativa', 'pendente');
$$;

REVOKE EXECUTE ON FUNCTION public.empresa_publica(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.empresa_publica(uuid) TO anon, authenticated;
