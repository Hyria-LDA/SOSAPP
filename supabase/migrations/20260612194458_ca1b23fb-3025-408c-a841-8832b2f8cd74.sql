
REVOKE EXECUTE ON FUNCTION public.match_materiais_on_pedido() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_pedidos_on_material() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.empresa_publica(uuid) FROM PUBLIC, anon;
