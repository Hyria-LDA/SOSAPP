-- Quando uma sobra nova bater com buscas automaticas existentes,
-- avisa apenas quem cadastrou a busca. O anunciante nao recebe notificacao.

CREATE OR REPLACE FUNCTION public.match_pedidos_on_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ped record;
  vendedor_uid uuid;
  dist double precision;
  emp_lat double precision;
  emp_lon double precision;
BEGIN
  IF NEW.status <> 'ativo' OR (TG_OP = 'UPDATE' AND OLD.status = 'ativo') THEN
    RETURN NEW;
  END IF;

  SELECT owner_id, latitude, longitude
    INTO vendedor_uid, emp_lat, emp_lon
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
    IF vendedor_uid IS NOT NULL AND ped.user_id = vendedor_uid THEN
      CONTINUE;
    END IF;

    dist := NULL;
    IF ped.latitude IS NOT NULL AND ped.longitude IS NOT NULL AND emp_lat IS NOT NULL AND emp_lon IS NOT NULL THEN
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

REVOKE EXECUTE ON FUNCTION public.match_pedidos_on_material() FROM PUBLIC, anon, authenticated;
