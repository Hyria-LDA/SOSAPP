
-- Reverse-direction matching: when a pedido is created, find existing materiais
CREATE OR REPLACE FUNCTION public.match_materiais_on_pedido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mat RECORD;
  vendedor_uid uuid;
  dist double precision;
BEGIN
  FOR mat IN
    SELECT m.*, e.owner_id AS vendedor_uid, e.latitude AS emp_lat, e.longitude AS emp_lon
    FROM public.materiais m
    JOIN public.empresas e ON e.id = m.empresa_id
    WHERE m.status = 'ativo'
      AND lower(m.padrao) = lower(NEW.padrao)
      AND m.espessura_mm = NEW.espessura_mm
      AND (NEW.fabricante IS NULL OR m.fabricante IS NULL OR lower(m.fabricante) = lower(NEW.fabricante))
      AND m.comprimento_cm >= NEW.comprimento_min_cm
      AND m.largura_cm >= NEW.largura_min_cm
  LOOP
    dist := NULL;
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL AND mat.emp_lat IS NOT NULL AND mat.emp_lon IS NOT NULL THEN
      dist := public.haversine_km(NEW.latitude, NEW.longitude, mat.emp_lat, mat.emp_lon);
      IF dist > NEW.raio_km THEN CONTINUE; END IF;
    END IF;

    -- comprador
    INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem, material_id, pedido_id)
    VALUES (
      NEW.user_id, 'match_comprador',
      '🎉 Encontramos um material compatível com seu pedido',
      format('%s • %s • %smm • %sx%scm%s',
        COALESCE(mat.fabricante,'—'), mat.padrao, mat.espessura_mm,
        mat.comprimento_cm, mat.largura_cm,
        CASE WHEN dist IS NOT NULL THEN ' • '||round(dist::numeric,1)||' km' ELSE '' END),
      mat.id, NEW.id
    );

    -- vendedor
    IF mat.vendedor_uid IS NOT NULL AND mat.vendedor_uid <> NEW.user_id THEN
      INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem, material_id, pedido_id)
      VALUES (
        mat.vendedor_uid, 'match_vendedor',
        '📢 Existe um comprador procurando este material',
        format('%s • %s • %smm • mín %sx%scm', COALESCE(NEW.fabricante,'—'), NEW.padrao, NEW.espessura_mm, NEW.comprimento_min_cm, NEW.largura_min_cm),
        mat.id, NEW.id
      );
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_match_materiais ON public.pedidos_material;
CREATE TRIGGER trg_match_materiais
AFTER INSERT ON public.pedidos_material
FOR EACH ROW EXECUTE FUNCTION public.match_materiais_on_pedido();

-- Realtime
ALTER TABLE public.notificacoes REPLICA IDENTITY FULL;
ALTER TABLE public.pedidos_material REPLICA IDENTITY FULL;
ALTER TABLE public.materiais REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos_material; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.materiais; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
