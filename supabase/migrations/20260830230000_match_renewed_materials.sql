-- Renovar um anuncio inicia um novo ciclo e deve procurar novamente por
-- buscas automaticas ativas. Edicoes comuns continuam sem disparar matches.

DO $$
DECLARE
  function_definition text;
  old_guard text :=
    'IF NEW.status <> ''ativo'' OR (TG_OP = ''UPDATE'' AND OLD.status = ''ativo'') THEN';
  new_guard text :=
    'IF NEW.status <> ''ativo'' OR (TG_OP = ''UPDATE'' AND NOT (OLD.status = ''ativo'' AND OLD.created_at <= now() - interval ''30 days'' AND NEW.created_at > OLD.created_at)) THEN';
BEGIN
  SELECT pg_get_functiondef('public.match_pedidos_on_material()'::regprocedure)
  INTO function_definition;

  IF position(new_guard IN function_definition) > 0 THEN
    RETURN;
  END IF;

  IF position(old_guard IN function_definition) = 0 THEN
    RAISE EXCEPTION
      'Protecao esperada nao encontrada em match_pedidos_on_material; migration interrompida sem alterar o banco.';
  END IF;

  EXECUTE replace(function_definition, old_guard, new_guard);
END;
$$;

DROP TRIGGER IF EXISTS trg_match_pedidos ON public.materiais;
CREATE TRIGGER trg_match_pedidos
AFTER INSERT OR UPDATE OF created_at ON public.materiais
FOR EACH ROW EXECUTE FUNCTION public.match_pedidos_on_material();

REVOKE EXECUTE ON FUNCTION public.match_pedidos_on_material()
FROM PUBLIC, anon, authenticated;
