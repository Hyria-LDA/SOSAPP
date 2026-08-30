-- Matches chegam imediatamente ao plano Brilhante e, apos duas horas,
-- aos demais usuarios. Outros tipos de notificacao nao passam por esta fila.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS public.match_notifications_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.pedidos_material(id) ON DELETE CASCADE,
  deliver_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, material_id, pedido_id)
);

ALTER TABLE public.match_notifications_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.match_notifications_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.match_notifications_queue TO service_role;

CREATE INDEX IF NOT EXISTS idx_match_notifications_queue_due
  ON public.match_notifications_queue(deliver_at);

CREATE OR REPLACE FUNCTION public.is_brilhante_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.empresas e
    JOIN public.planos p ON p.id = e.plano_id
    WHERE e.owner_id = _user_id
      AND p.slug = 'premium'
      AND (e.plano_vencimento IS NULL OR e.plano_vencimento > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.release_due_match_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  released_count integer;
BEGIN
  WITH due AS (
    DELETE FROM public.match_notifications_queue q
    WHERE q.deliver_at <= now()
    RETURNING q.*
  ), inserted AS (
    INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem, material_id, pedido_id)
    SELECT d.user_id, d.tipo, d.titulo, d.mensagem, d.material_id, d.pedido_id
    FROM due d
    JOIN public.materiais m ON m.id = d.material_id
    JOIN public.pedidos_material p ON p.id = d.pedido_id
    WHERE m.status = 'ativo'
      AND m.created_at > now() - interval '30 days'
      AND p.status = 'ativo'
    RETURNING 1
  )
  SELECT count(*) INTO released_count FROM inserted;

  RETURN released_count;
END;
$$;

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
        NEW.id, ped.id, now() + interval '2 hours')
      ON CONFLICT (user_id, material_id, pedido_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_materiais_on_pedido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mat record;
  dist double precision;
  notification_message text;
  user_is_brilhante boolean := public.is_brilhante_user(NEW.user_id);
BEGIN
  IF NEW.status <> 'ativo' THEN RETURN NEW; END IF;

  FOR mat IN
    SELECT m.*, e.owner_id AS seller_user_id, e.latitude AS emp_lat, e.longitude AS emp_lon
    FROM public.materiais m
    JOIN public.empresas e ON e.id = m.empresa_id
    WHERE m.status = 'ativo'
      AND m.created_at > now() - interval '30 days'
      AND lower(m.padrao) = lower(NEW.padrao)
      AND m.espessura_mm = NEW.espessura_mm
      AND (NEW.fabricante IS NULL OR m.fabricante IS NULL OR lower(m.fabricante) = lower(NEW.fabricante))
      AND (
        (m.comprimento_cm >= NEW.comprimento_min_cm AND m.largura_cm >= NEW.largura_min_cm)
        OR (
          COALESCE(NEW.medidas_invertiveis, false)
          AND m.comprimento_cm >= NEW.largura_min_cm
          AND m.largura_cm >= NEW.comprimento_min_cm
        )
      )
  LOOP
    IF mat.seller_user_id = NEW.user_id THEN CONTINUE; END IF;

    dist := NULL;
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL
      AND mat.emp_lat IS NOT NULL AND mat.emp_lon IS NOT NULL THEN
      dist := public.haversine_km(NEW.latitude, NEW.longitude, mat.emp_lat, mat.emp_lon);
      IF dist > NEW.raio_km THEN CONTINUE; END IF;
    END IF;

    notification_message := format('%s - %s - %smm - %sx%scm%s',
      COALESCE(mat.fabricante, '-'), mat.padrao, mat.espessura_mm,
      mat.comprimento_cm, mat.largura_cm,
      CASE WHEN dist IS NOT NULL THEN ' - ' || round(dist::numeric, 1) || ' km' ELSE '' END);

    IF user_is_brilhante THEN
      INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem, material_id, pedido_id)
      VALUES (NEW.user_id, 'match_comprador',
        'Encontramos um material compativel com seu pedido', notification_message, mat.id, NEW.id);
    ELSE
      INSERT INTO public.match_notifications_queue
        (user_id, tipo, titulo, mensagem, material_id, pedido_id, deliver_at)
      VALUES (NEW.user_id, 'match_comprador',
        'Encontramos um material compativel com seu pedido', notification_message,
        mat.id, NEW.id, now() + interval '2 hours')
      ON CONFLICT (user_id, material_id, pedido_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_brilhante_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_due_match_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_pedidos_on_material() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_materiais_on_pedido() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'release-delayed-match-notifications'
  ) THEN
    PERFORM cron.schedule(
      'release-delayed-match-notifications',
      '* * * * *',
      'SELECT public.release_due_match_notifications()'
    );
  END IF;
END;
$$;
