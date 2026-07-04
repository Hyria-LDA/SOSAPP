
DROP FUNCTION IF EXISTS public.empresa_publica(uuid);

CREATE FUNCTION public.empresa_publica(_empresa_id uuid)
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
  SELECT e.id, e.nome_empresa, e.responsavel, e.whatsapp, e.telefone,
         e.cidade, e.estado, e.latitude, e.longitude, e.logo_url, e.avaliacao, e.status, e.created_at,
         p.slug AS plano_slug,
         p.nome AS plano_nome,
         (p.slug = 'free' OR e.plano_vencimento IS NULL OR e.plano_vencimento > now()) AS plano_vigente
  FROM public.empresas e
  LEFT JOIN public.planos p ON p.id = e.plano_id
  WHERE e.id = _empresa_id AND e.status IN ('ativa','pendente');
$$;

REVOKE EXECUTE ON FUNCTION public.empresa_publica(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.empresa_publica(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.materiais_planos(_ids uuid[])
RETURNS TABLE (
  material_id uuid,
  plano_slug text,
  plano_vigente boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id AS material_id,
         p.slug AS plano_slug,
         (p.slug = 'free' OR e.plano_vencimento IS NULL OR e.plano_vencimento > now()) AS plano_vigente
  FROM public.materiais m
  JOIN public.empresas e ON e.id = m.empresa_id
  LEFT JOIN public.planos p ON p.id = e.plano_id
  WHERE m.id = ANY(_ids);
$$;

REVOKE EXECUTE ON FUNCTION public.materiais_planos(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materiais_planos(uuid[]) TO anon, authenticated;
