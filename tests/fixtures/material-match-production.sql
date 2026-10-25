-- Funcao exportada do banco para regressao; sem dados de usuarios.
CREATE OR REPLACE FUNCTION public.match_pedidos_on_material()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ped record;
  seller_user_id uuid;
  dist double precision;
  emp_lat double precision;
  emp_lon double precision;
  notification_message text;
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
      AND (
        (NEW.comprimento_cm >= comprimento_min_cm AND NEW.largura_cm >= largura_min_cm)
        OR (
          COALESCE(medidas_invertiveis, false)
          AND NEW.comprimento_cm >= largura_min_cm
          AND NEW.largura_cm >= comprimento_min_cm
        )
      )
  LOOP
    IF seller_user_id IS NOT NULL AND ped.user_id = seller_user_id THEN CONTINUE; END IF;

    dist := NULL;
    IF ped.latitude IS NOT NULL AND ped.longitude IS NOT NULL
      AND emp_lat IS NOT NULL AND emp_lon IS NOT NULL THEN
      dist := public.haversine_km(ped.latitude, ped.longitude, emp_lat, emp_lon);
      IF dist > ped.raio_km THEN CONTINUE; END IF;
    END IF;

    notification_message := format('%s - %s - %smm - %sx%scm%s',
      COALESCE(NEW.fabricante, '-'), NEW.padrao, NEW.espessura_mm,
      NEW.comprimento_cm, NEW.largura_cm,
      CASE WHEN dist IS NOT NULL THEN ' - ' || round(dist::numeric, 1) || ' km' ELSE '' END);

    IF public.is_brilhante_user(ped.user_id) THEN
      INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem, material_id, pedido_id)
      VALUES (ped.user_id, 'match_comprador',
        'Encontramos um material compativel com seu pedido', notification_message, NEW.id, ped.id);
    ELSE
      INSERT INTO public.match_notifications_queue
        (user_id, tipo, titulo, mensagem, material_id, pedido_id, deliver_at)
      VALUES (ped.user_id, 'match_comprador',
        'Encontramos um material compativel com seu pedido', notification_message,
        NEW.id, ped.id, now() + interval '30 minutes')
      ON CONFLICT (user_id, material_id, pedido_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;
