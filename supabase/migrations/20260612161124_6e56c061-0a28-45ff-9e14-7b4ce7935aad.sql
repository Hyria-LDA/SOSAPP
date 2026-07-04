
DROP VIEW IF EXISTS public.empresas_publica;

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
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, nome_empresa, responsavel, whatsapp, telefone,
         cidade, estado, latitude, longitude, logo_url, avaliacao, status, created_at
  FROM public.empresas
  WHERE id = _empresa_id AND status IN ('ativa','pendente');
$$;

REVOKE EXECUTE ON FUNCTION public.empresa_publica(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.empresa_publica(uuid) TO authenticated;
