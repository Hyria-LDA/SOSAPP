-- Retira os planos legados Standard e Plus do uso ativo.
-- Standard vira Ultra; Plus vira TX. Os registros antigos ficam inativos
-- para preservar historico e evitar quebra de chaves estrangeiras.

WITH map AS (
  SELECT old_plan.id AS old_id, new_plan.id AS new_id, new_plan.slug AS new_slug
  FROM public.planos old_plan
  JOIN public.planos new_plan
    ON new_plan.slug = CASE old_plan.slug
      WHEN 'standard' THEN 'ultra'
      WHEN 'plus' THEN 'tx'
    END
  WHERE old_plan.slug IN ('standard', 'plus')
)
UPDATE public.empresas e
SET plano_id = map.new_id,
    plano = map.new_slug
FROM map
WHERE e.plano_id = map.old_id;

UPDATE public.empresas e
SET plano_id = p.id,
    plano = p.slug
FROM public.planos p
WHERE e.plano IN ('standard', 'plus')
  AND p.slug = CASE e.plano
    WHEN 'standard' THEN 'ultra'
    WHEN 'plus' THEN 'tx'
  END;

WITH map AS (
  SELECT old_plan.id AS old_id, new_plan.id AS new_id
  FROM public.planos old_plan
  JOIN public.planos new_plan
    ON new_plan.slug = CASE old_plan.slug
      WHEN 'standard' THEN 'ultra'
      WHEN 'plus' THEN 'tx'
    END
  WHERE old_plan.slug IN ('standard', 'plus')
)
UPDATE public.assinaturas a
SET plano_id = map.new_id
FROM map
WHERE a.plano_id = map.old_id;

WITH map AS (
  SELECT old_plan.id AS old_id, new_plan.id AS new_id
  FROM public.planos old_plan
  JOIN public.planos new_plan
    ON new_plan.slug = CASE old_plan.slug
      WHEN 'standard' THEN 'ultra'
      WHEN 'plus' THEN 'tx'
    END
  WHERE old_plan.slug IN ('standard', 'plus')
)
UPDATE public.financeiro f
SET plano_id = map.new_id
FROM map
WHERE f.plano_id = map.old_id;

UPDATE public.planos
SET ativo = false,
    ordem = 99,
    descricao = 'Plano legado aposentado',
    updated_at = now()
WHERE slug IN ('standard', 'plus');

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
          WHEN 'ultra' THEN 2
          WHEN 'tx' THEN 3
          WHEN 'free' THEN 4
          ELSE 5
        END
      ELSE 6
    END ASC,
    md5(m.id::text || COALESCE(_seed, '')) ASC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.materiais_perto_de_voce(
  double precision,
  double precision,
  integer,
  double precision,
  text
) TO authenticated, anon;
