-- Reduz de duas horas para trinta minutos a prioridade do plano Brilhante.
-- Brilhante continua recebendo imediatamente; os demais recebem apos 30 minutos.

ALTER TABLE public.match_notifications_queue
  ALTER COLUMN deliver_at SET DEFAULT (now() + interval '30 minutes');

UPDATE public.match_notifications_queue
SET deliver_at = created_at + interval '30 minutes'
WHERE deliver_at > created_at + interval '30 minutes';

DO $$
DECLARE
  function_definition text;
BEGIN
  SELECT pg_get_functiondef('public.match_pedidos_on_material()'::regprocedure)
  INTO function_definition;

  IF position('2 hours' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Tempo atual nao encontrado em match_pedidos_on_material';
  END IF;

  EXECUTE replace(function_definition, '2 hours', '30 minutes');

  SELECT pg_get_functiondef('public.match_materiais_on_pedido()'::regprocedure)
  INTO function_definition;

  IF position('2 hours' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Tempo atual nao encontrado em match_materiais_on_pedido';
  END IF;

  EXECUTE replace(function_definition, '2 hours', '30 minutes');
END;
$$;

