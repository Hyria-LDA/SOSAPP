-- Um match pertence a quem cadastrou a busca automatica.
-- O anunciante da sobra nunca recebe notificacao por esse evento.

CREATE OR REPLACE FUNCTION public.match_pedidos_on_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ped record;
  seller_user_id uuid;
  dist double precision;
  emp_lat double precision;
  emp_lon double precision;
BEGIN
  IF NEW.status <> 'ativo' OR (TG_OP = 'UPDATE' AND OLD.status = 'ativo') THEN
    RETURN NEW;
  END IF;

  SELECT owner_id, latitude, longitude
    INTO seller_user_id, emp_lat, emp_lon
  FROM public.empresas
  WHERE id = NEW.empresa_id;

  FOR ped IN
    SELECT *
    FROM public.pedidos_material
    WHERE status = 'ativo'
      AND lower(padrao) = lower(NEW.padrao)
      AND espessura_mm = NEW.espessura_mm
      AND (fabricante IS NULL OR NEW.fabricante IS NULL OR lower(fabricante) = lower(NEW.fabricante))
      AND NEW.comprimento_cm >= comprimento_min_cm
      AND NEW.largura_cm >= largura_min_cm
  LOOP
    IF seller_user_id IS NOT NULL AND ped.user_id = seller_user_id THEN
      CONTINUE;
    END IF;

    dist := NULL;
    IF ped.latitude IS NOT NULL AND ped.longitude IS NOT NULL
      AND emp_lat IS NOT NULL AND emp_lon IS NOT NULL THEN
      dist := public.haversine_km(ped.latitude, ped.longitude, emp_lat, emp_lon);
      IF dist > ped.raio_km THEN
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem, material_id, pedido_id)
    VALUES (
      ped.user_id,
      'match_comprador',
      'Encontramos um material compativel com seu pedido',
      format('%s - %s - %smm - %sx%scm%s',
        COALESCE(NEW.fabricante, '-'), NEW.padrao, NEW.espessura_mm,
        NEW.comprimento_cm, NEW.largura_cm,
        CASE WHEN dist IS NOT NULL THEN ' - ' || round(dist::numeric, 1) || ' km' ELSE '' END),
      NEW.id,
      ped.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_pedidos ON public.materiais;
CREATE TRIGGER trg_match_pedidos
AFTER INSERT OR UPDATE OF status ON public.materiais
FOR EACH ROW EXECUTE FUNCTION public.match_pedidos_on_material();

CREATE OR REPLACE FUNCTION public.match_materiais_on_pedido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mat record;
  dist double precision;
BEGIN
  IF NEW.status <> 'ativo' THEN
    RETURN NEW;
  END IF;

  FOR mat IN
    SELECT m.*, e.owner_id AS seller_user_id, e.latitude AS emp_lat, e.longitude AS emp_lon
    FROM public.materiais m
    JOIN public.empresas e ON e.id = m.empresa_id
    WHERE m.status = 'ativo'
      AND lower(m.padrao) = lower(NEW.padrao)
      AND m.espessura_mm = NEW.espessura_mm
      AND (NEW.fabricante IS NULL OR m.fabricante IS NULL OR lower(m.fabricante) = lower(NEW.fabricante))
      AND m.comprimento_cm >= NEW.comprimento_min_cm
      AND m.largura_cm >= NEW.largura_min_cm
  LOOP
    IF mat.seller_user_id = NEW.user_id THEN
      CONTINUE;
    END IF;

    dist := NULL;
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL
      AND mat.emp_lat IS NOT NULL AND mat.emp_lon IS NOT NULL THEN
      dist := public.haversine_km(NEW.latitude, NEW.longitude, mat.emp_lat, mat.emp_lon);
      IF dist > NEW.raio_km THEN
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem, material_id, pedido_id)
    VALUES (
      NEW.user_id,
      'match_comprador',
      'Encontramos um material compativel com seu pedido',
      format('%s - %s - %smm - %sx%scm%s',
        COALESCE(mat.fabricante, '-'), mat.padrao, mat.espessura_mm,
        mat.comprimento_cm, mat.largura_cm,
        CASE WHEN dist IS NOT NULL THEN ' - ' || round(dist::numeric, 1) || ' km' ELSE '' END),
      mat.id,
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_materiais ON public.pedidos_material;
CREATE TRIGGER trg_match_materiais
AFTER INSERT ON public.pedidos_material
FOR EACH ROW EXECUTE FUNCTION public.match_materiais_on_pedido();

REVOKE EXECUTE ON FUNCTION public.match_pedidos_on_material() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_materiais_on_pedido() FROM PUBLIC, anon, authenticated;
