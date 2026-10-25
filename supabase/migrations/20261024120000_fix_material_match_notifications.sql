-- Executar o arquivo inteiro no SQL Editor. Nao reenvia avisos antigos.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Brilhante usa ultra desde a consolidacao dos planos em setembro.
CREATE OR REPLACE FUNCTION public.is_brilhante_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.empresas e
    LEFT JOIN public.planos p ON p.id = e.plano_id
    WHERE e.owner_id = _user_id
      AND lower(coalesce(p.slug, e.plano, 'free')) IN ('ultra', 'premium', 'brilhante')
      AND (e.plano_vencimento IS NULL OR e.plano_vencimento > now())
  );
$$;

-- Preserva filtros de medidas, giro, fabricante, distancia e a fila existente.
DO $$
DECLARE
  definition text;
  old_guard text := 'IF NEW.status <> ''ativo'' OR (TG_OP = ''UPDATE'' AND NOT (OLD.status = ''ativo'' AND OLD.created_at <= now() - interval ''30 days'' AND NEW.created_at > OLD.created_at)) THEN';
  new_guard text := 'IF NEW.status <> ''ativo'' OR (TG_OP = ''UPDATE'' AND OLD.status = ''ativo'' AND NOT (OLD.created_at <= now() - interval ''30 days'' AND NEW.created_at > OLD.created_at)) THEN';
BEGIN
  SELECT pg_get_functiondef('public.match_pedidos_on_material()'::regprocedure) INTO definition;
  IF position(new_guard IN definition) > 0 THEN RETURN; END IF;
  IF position(old_guard IN definition) = 0 THEN
    RAISE EXCEPTION 'Versao inesperada de match_pedidos_on_material. Nenhuma alteracao aplicada; verificar migrations anteriores.';
  END IF;
  EXECUTE replace(definition, old_guard, new_guard);
END;
$$;

DROP TRIGGER IF EXISTS trg_match_pedidos ON public.materiais;
CREATE TRIGGER trg_match_pedidos
AFTER INSERT OR UPDATE OF status, created_at ON public.materiais
FOR EACH ROW EXECUTE FUNCTION public.match_pedidos_on_material();

REVOKE EXECUTE ON FUNCTION public.is_brilhante_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_pedidos_on_material() FROM PUBLIC, anon, authenticated;
COMMIT;
