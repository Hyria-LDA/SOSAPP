CREATE OR REPLACE FUNCTION public.materiais_perto_de_voce(
  _lat double precision DEFAULT NULL,
  _lon double precision DEFAULT NULL,
  _limit integer DEFAULT 6
)
RETURNS TABLE(
  id uuid,
  padrao text,
  fabricante text,
  preco numeric,
  cidade text,
  estado text,
  latitude double precision,
  longitude double precision,
  distancia_km double precision
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.padrao, m.fabricante, m.preco, m.cidade, m.estado,
         m.latitude, m.longitude,
         CASE
           WHEN _lat IS NOT NULL AND _lon IS NOT NULL AND m.latitude IS NOT NULL AND m.longitude IS NOT NULL
             THEN public.haversine_km(_lat, _lon, m.latitude, m.longitude)
           ELSE NULL
         END AS distancia_km
  FROM public.materiais m
  JOIN public.empresas e ON e.id = m.empresa_id
  JOIN public.planos p ON p.id = e.plano_id
  WHERE m.status = 'ativo'
    AND p.slug = 'premium'
    AND (e.plano_vencimento IS NULL OR e.plano_vencimento > now())
  ORDER BY
    CASE WHEN _lat IS NOT NULL AND _lon IS NOT NULL AND m.latitude IS NOT NULL AND m.longitude IS NOT NULL
      THEN public.haversine_km(_lat, _lon, m.latitude, m.longitude)
      ELSE 999999 END ASC,
    m.created_at DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.materiais_perto_de_voce(double precision, double precision, integer) TO authenticated, anon;