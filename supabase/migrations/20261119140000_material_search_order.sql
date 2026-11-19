BEGIN;
-- Invoker permissions preserve the same visibility/RLS as direct material searches.
CREATE OR REPLACE FUNCTION public.material_search_order(
 _order text,_lat double precision DEFAULT NULL,_lng double precision DEFAULT NULL,
 _radius double precision DEFAULT 50,_manufacturer uuid DEFAULT NULL,_pattern uuid DEFAULT NULL,
 _thickness numeric[] DEFAULT NULL,_length numeric DEFAULT 0,_width numeric DEFAULT 0,_rotate boolean DEFAULT false
) RETURNS TABLE(id uuid) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH candidates AS (
 SELECT m.id,m.preco,m.created_at,
 CASE WHEN _lat BETWEEN -90 AND 90 AND _lng BETWEEN -180 AND 180
  AND m.latitude BETWEEN -90 AND 90 AND m.longitude BETWEEN -180 AND 180 THEN
  12742 * asin(sqrt(least(1.0,greatest(0.0,
    power(sin(radians(m.latitude-_lat)/2),2) + cos(radians(_lat))*cos(radians(m.latitude))*power(sin(radians(m.longitude-_lng)/2),2)
  )))) END AS distance
 FROM public.materiais m
 WHERE m.status='ativo' AND m.created_at>now()-interval '30 days'
 AND (_manufacturer IS NULL OR m.fabricante_id=_manufacturer)
 AND (_pattern IS NULL OR m.padrao_id=_pattern)
 AND (_thickness IS NULL OR cardinality(_thickness)=0 OR m.espessura_mm=ANY(_thickness))
 AND ((m.comprimento_cm>=greatest(0,_length) AND m.largura_cm>=greatest(0,_width))
  OR (_rotate AND m.comprimento_cm>=greatest(0,_width) AND m.largura_cm>=greatest(0,_length)))
 ) SELECT id FROM candidates
 WHERE _order IN ('preco','distancia') AND (coalesce(_radius,0)<=0 OR distance IS NULL OR distance<=least(_radius,50))
 ORDER BY CASE WHEN _order='preco' THEN preco END ASC NULLS LAST,
 CASE WHEN _order='distancia' THEN distance END ASC NULLS LAST,created_at DESC,id
 LIMIT 120;
$$;
REVOKE ALL ON FUNCTION public.material_search_order(text,double precision,double precision,double precision,uuid,uuid,numeric[],numeric,numeric,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_search_order(text,double precision,double precision,double precision,uuid,uuid,numeric[],numeric,numeric,boolean) TO anon,authenticated;
COMMIT;
