
REVOKE EXECUTE ON FUNCTION public.match_alertas_on_material() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_pedidos_on_material() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_materiais_on_pedido() FROM PUBLIC, anon, authenticated;
