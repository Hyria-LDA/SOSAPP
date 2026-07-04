CREATE OR REPLACE FUNCTION public.materiais_perto_de_voce(
  _lat double precision DEFAULT NULL,
  _lon double precision DEFAULT NULL,
  _limit integer DEFAULT 12,
  _raio_km double precision DEFAULT 999999,
  _seed text DEFAULT ''
)
RETURNS TABLE (
  id uuid,
  padrao text,
  fabricante text,
  preco numeric,
  cidade text,
  estado text,
  latitude double precision,
  longitude double precision,
  distancia_km double precision,
  plano_slug text,
  plano_vigente boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.padrao,
    m.fabricante,
    m.preco,
    m.cidade,
    m.estado,
    m.latitude,
    m.longitude,
    CASE
      WHEN _lat IS NOT NULL AND _lon IS NOT NULL AND m.latitude IS NOT NULL AND m.longitude IS NOT NULL
        THEN public.haversine_km(_lat, _lon, m.latitude, m.longitude)
      ELSE NULL
    END AS distancia_km,
    p.slug AS plano_slug,
    (p.slug = 'free' OR e.plano_vencimento IS NULL OR e.plano_vencimento > now()) AS plano_vigente
  FROM public.materiais m
  JOIN public.empresas e ON e.id = m.empresa_id
  LEFT JOIN public.planos p ON p.id = e.plano_id
  WHERE m.status = 'ativo'
    AND (
      _lat IS NULL
      OR _lon IS NULL
      OR m.latitude IS NULL
      OR m.longitude IS NULL
      OR public.haversine_km(_lat, _lon, m.latitude, m.longitude) <= _raio_km
    )
  ORDER BY
    CASE
      WHEN (p.slug = 'free' OR e.plano_vencimento IS NULL OR e.plano_vencimento > now()) THEN
        CASE p.slug
          WHEN 'premium' THEN 1
          WHEN 'standard' THEN 2
          WHEN 'plus' THEN 3
          WHEN 'free' THEN 4
          ELSE 5
        END
      ELSE 6
    END ASC,
    md5(m.id::text || COALESCE(_seed, '')) ASC
  LIMIT _limit;
$$;