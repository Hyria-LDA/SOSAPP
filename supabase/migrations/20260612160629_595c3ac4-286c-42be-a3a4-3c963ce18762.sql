
ALTER FUNCTION public.haversine_km(double precision,double precision,double precision,double precision) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.match_pedidos_on_material() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.haversine_km(double precision,double precision,double precision,double precision) FROM PUBLIC, anon;
