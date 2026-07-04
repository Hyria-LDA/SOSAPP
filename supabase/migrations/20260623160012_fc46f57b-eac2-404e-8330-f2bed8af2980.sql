
ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS planos_alvo text[] NOT NULL DEFAULT '{}';

DROP FUNCTION IF EXISTS public.materiais_perto_de_voce(double precision, double precision, integer);

CREATE OR REPLACE FUNCTION public.materiais_perto_de_voce(
  _lat double precision DEFAULT NULL,
  _lon double precision DEFAULT NULL,
  _limit integer DEFAULT 6
)
RETURNS TABLE(
  id uuid, padrao text, fabricante text, preco numeric,
  cidade text, estado text,
  latitude double precision, longitude double precision,
  distancia_km double precision,
  plano_slug text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.id, m.padrao, m.fabricante, m.preco, m.cidade, m.estado,
         m.latitude, m.longitude,
         CASE
           WHEN _lat IS NOT NULL AND _lon IS NOT NULL AND m.latitude IS NOT NULL AND m.longitude IS NOT NULL
             THEN public.haversine_km(_lat, _lon, m.latitude, m.longitude)
           ELSE NULL
         END AS distancia_km,
         p.slug AS plano_slug
  FROM public.materiais m
  JOIN public.empresas e ON e.id = m.empresa_id
  LEFT JOIN public.planos p ON p.id = e.plano_id
  WHERE m.status = 'ativo'
  ORDER BY
    CASE
      WHEN _lat IS NOT NULL AND _lon IS NOT NULL AND m.latitude IS NOT NULL AND m.longitude IS NOT NULL
        THEN floor(public.haversine_km(_lat, _lon, m.latitude, m.longitude) / 5.0)
      ELSE 999999
    END ASC,
    CASE p.slug
      WHEN 'premium' THEN 1
      WHEN 'standard' THEN 2
      WHEN 'plus' THEN 3
      WHEN 'free' THEN 4
      ELSE 5
    END ASC,
    m.created_at DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.materiais_perto_de_voce(double precision, double precision, integer) TO authenticated, anon;
