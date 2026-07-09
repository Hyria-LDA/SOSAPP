-- Bloqueia novas buscas automaticas acima do limite do plano.
-- A tela /app/pedidos tambem valida no frontend, mas o banco precisa ser a defesa real.

CREATE OR REPLACE FUNCTION public.enforce_pedido_material_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st jsonb;
  limite int;
  atual int;
  nome_plano text;
BEGIN
  st := public.get_user_plan_status(NEW.user_id);
  limite := (st->'plano'->>'max_buscas')::int;
  atual := (st->'uso'->>'buscas')::int;
  nome_plano := st->'plano'->>'nome';

  IF limite <> -1 AND atual >= limite THEN
    RAISE EXCEPTION 'Limite de buscas automaticas do plano % atingido (%/%). Faca upgrade para criar mais buscas.',
      nome_plano, atual, limite
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_pedido_material_limit ON public.pedidos_material;
CREATE TRIGGER trg_enforce_pedido_material_limit
BEFORE INSERT ON public.pedidos_material
FOR EACH ROW EXECUTE FUNCTION public.enforce_pedido_material_limit();
