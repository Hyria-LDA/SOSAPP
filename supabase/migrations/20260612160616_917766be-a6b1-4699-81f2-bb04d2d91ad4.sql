
-- ENUM status
DO $$ BEGIN
  CREATE TYPE public.pedido_status AS ENUM ('ativo','atendido','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pedidos_material
CREATE TABLE IF NOT EXISTS public.pedidos_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fabricante_id uuid REFERENCES public.fabricantes(id) ON DELETE SET NULL,
  fabricante text,
  padrao_id uuid REFERENCES public.padroes(id) ON DELETE SET NULL,
  padrao text NOT NULL,
  espessura_mm numeric(6,2) NOT NULL,
  comprimento_min_cm numeric(8,2) NOT NULL DEFAULT 0,
  largura_min_cm numeric(8,2) NOT NULL DEFAULT 0,
  quantidade integer NOT NULL DEFAULT 1,
  raio_km integer NOT NULL DEFAULT 50,
  observacoes text,
  cidade text,
  estado text,
  latitude double precision,
  longitude double precision,
  status public.pedido_status NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos_material TO authenticated;
GRANT ALL ON public.pedidos_material TO service_role;

ALTER TABLE public.pedidos_material ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user can read own pedidos" ON public.pedidos_material FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user can insert own pedidos" ON public.pedidos_material FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user can update own pedidos" ON public.pedidos_material FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user can delete own pedidos" ON public.pedidos_material FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin can read all pedidos" ON public.pedidos_material FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_pedidos_status ON public.pedidos_material(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_user ON public.pedidos_material(user_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_padrao ON public.pedidos_material(padrao_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_fab ON public.pedidos_material(fabricante_id);

CREATE TRIGGER trg_pedidos_updated BEFORE UPDATE ON public.pedidos_material
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- notificacoes
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  material_id uuid REFERENCES public.materiais(id) ON DELETE CASCADE,
  pedido_id uuid REFERENCES public.pedidos_material(id) ON DELETE CASCADE,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own notifs" ON public.notificacoes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user updates own notifs" ON public.notificacoes FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user deletes own notifs" ON public.notificacoes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notificacoes(user_id, lida, created_at DESC);

-- Haversine distance (km)
CREATE OR REPLACE FUNCTION public.haversine_km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT 2 * 6371 * asin(sqrt(
    sin(radians((lat2-lat1)/2))^2 +
    cos(radians(lat1))*cos(radians(lat2)) * sin(radians((lon2-lon1)/2))^2
  ));
$$;

-- Match trigger when a new material is posted
CREATE OR REPLACE FUNCTION public.match_pedidos_on_material()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ped RECORD;
  vendedor_uid uuid;
  dist double precision;
  emp_lat double precision;
  emp_lon double precision;
BEGIN
  SELECT owner_id, latitude, longitude INTO vendedor_uid, emp_lat, emp_lon
  FROM public.empresas WHERE id = NEW.empresa_id;

  FOR ped IN
    SELECT * FROM public.pedidos_material
    WHERE status = 'ativo'
      AND lower(padrao) = lower(NEW.padrao)
      AND espessura_mm = NEW.espessura_mm
      AND (fabricante IS NULL OR NEW.fabricante IS NULL OR lower(fabricante) = lower(NEW.fabricante))
      AND NEW.comprimento_cm >= comprimento_min_cm
      AND NEW.largura_cm >= largura_min_cm
  LOOP
    dist := NULL;
    IF ped.latitude IS NOT NULL AND ped.longitude IS NOT NULL AND emp_lat IS NOT NULL AND emp_lon IS NOT NULL THEN
      dist := public.haversine_km(ped.latitude, ped.longitude, emp_lat, emp_lon);
      IF dist > ped.raio_km THEN CONTINUE; END IF;
    END IF;

    -- comprador
    INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem, material_id, pedido_id)
    VALUES (
      ped.user_id, 'match_comprador',
      '🎉 Encontramos um material compatível com seu pedido',
      format('%s • %s • %smm • %sx%scm%s',
        COALESCE(NEW.fabricante,'—'), NEW.padrao, NEW.espessura_mm,
        NEW.comprimento_cm, NEW.largura_cm,
        CASE WHEN dist IS NOT NULL THEN ' • '||round(dist::numeric,1)||' km' ELSE '' END),
      NEW.id, ped.id
    );

    -- vendedor
    IF vendedor_uid IS NOT NULL AND vendedor_uid <> ped.user_id THEN
      INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem, material_id, pedido_id)
      VALUES (
        vendedor_uid, 'match_vendedor',
        '📢 Existe um comprador procurando este material',
        format('%s • %s • %smm • mín %sx%scm', COALESCE(ped.fabricante,'—'), ped.padrao, ped.espessura_mm, ped.comprimento_min_cm, ped.largura_min_cm),
        NEW.id, ped.id
      );
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_match_pedidos ON public.materiais;
CREATE TRIGGER trg_match_pedidos AFTER INSERT ON public.materiais
FOR EACH ROW EXECUTE FUNCTION public.match_pedidos_on_material();
