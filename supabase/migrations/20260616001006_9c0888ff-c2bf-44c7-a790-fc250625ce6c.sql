
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS alerta_id uuid REFERENCES public.alertas(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.match_alertas_on_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  al RECORD;
  emp_lat double precision;
  emp_lon double precision;
  emp_owner uuid;
  user_lat double precision;
  user_lon double precision;
  dist double precision;
BEGIN
  IF NEW.status <> 'ativo' THEN RETURN NEW; END IF;

  SELECT owner_id, latitude, longitude INTO emp_owner, emp_lat, emp_lon
  FROM public.empresas WHERE id = NEW.empresa_id;

  FOR al IN
    SELECT * FROM public.alertas
    WHERE ativo = true
      AND (fabricante IS NULL OR NEW.fabricante IS NULL OR lower(fabricante) = lower(NEW.fabricante))
      AND (padrao IS NULL OR lower(padrao) = lower(NEW.padrao))
      AND (espessura_mm IS NULL OR espessura_mm = NEW.espessura_mm)
      AND (comprimento_min_cm IS NULL OR NEW.comprimento_cm >= comprimento_min_cm)
      AND (largura_min_cm IS NULL OR NEW.largura_cm >= largura_min_cm)
  LOOP
    IF emp_owner IS NOT NULL AND al.user_id = emp_owner THEN
      CONTINUE;
    END IF;

    dist := NULL;
    IF emp_lat IS NOT NULL AND emp_lon IS NOT NULL THEN
      SELECT latitude, longitude INTO user_lat, user_lon
      FROM public.empresas WHERE owner_id = al.user_id LIMIT 1;
      IF user_lat IS NOT NULL AND user_lon IS NOT NULL THEN
        dist := public.haversine_km(user_lat, user_lon, emp_lat, emp_lon);
        IF al.raio_km IS NOT NULL AND al.raio_km > 0 AND dist > al.raio_km THEN
          CONTINUE;
        END IF;
      END IF;
    END IF;

    INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem, material_id, alerta_id)
    VALUES (
      al.user_id,
      'match_alerta',
      '🎉 Encontramos uma sobra compatível com seu alerta',
      format('%s • %s • %smm • %sx%scm%s',
        COALESCE(NEW.fabricante,'—'), NEW.padrao, NEW.espessura_mm,
        NEW.comprimento_cm, NEW.largura_cm,
        CASE WHEN dist IS NOT NULL THEN ' • '||round(dist::numeric,1)||' km' ELSE '' END),
      NEW.id, al.id
    );
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_match_alertas ON public.materiais;
CREATE TRIGGER trg_match_alertas
AFTER INSERT OR UPDATE OF status ON public.materiais
FOR EACH ROW EXECUTE FUNCTION public.match_alertas_on_material();
