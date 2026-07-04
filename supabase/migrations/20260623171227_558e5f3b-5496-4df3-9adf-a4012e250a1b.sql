
-- Enums para análise de IA
DO $$ BEGIN
  CREATE TYPE public.ai_status AS ENUM ('pending','approved','manual_review','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_category AS ENUM (
    'wood_panel','mdf','mdp','plywood','wood_scrap','workshop','hardware',
    'adult_content','violence','spam','unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Colunas em fotos_materiais
ALTER TABLE public.fotos_materiais
  ADD COLUMN IF NOT EXISTS empresa_id uuid,
  ADD COLUMN IF NOT EXISTS ai_status public.ai_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ai_score numeric,
  ADD COLUMN IF NOT EXISTS ai_reason text,
  ADD COLUMN IF NOT EXISTS ai_provider text,
  ADD COLUMN IF NOT EXISTS ai_category public.ai_category,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS needs_ai_analysis boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Backfill empresa_id a partir de materiais
UPDATE public.fotos_materiais f
   SET empresa_id = m.empresa_id
  FROM public.materiais m
 WHERE f.material_id = m.id AND f.empresa_id IS NULL;

-- Trigger para preencher empresa_id automaticamente em novos inserts
CREATE OR REPLACE FUNCTION public.fotos_materiais_set_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.empresa_id IS NULL AND NEW.material_id IS NOT NULL THEN
    SELECT empresa_id INTO NEW.empresa_id FROM public.materiais WHERE id = NEW.material_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fotos_materiais_set_empresa ON public.fotos_materiais;
CREATE TRIGGER trg_fotos_materiais_set_empresa
  BEFORE INSERT ON public.fotos_materiais
  FOR EACH ROW EXECUTE FUNCTION public.fotos_materiais_set_empresa();

CREATE INDEX IF NOT EXISTS idx_fotos_materiais_ai_status ON public.fotos_materiais(ai_status);
CREATE INDEX IF NOT EXISTS idx_fotos_materiais_needs_ai ON public.fotos_materiais(needs_ai_analysis) WHERE needs_ai_analysis = true;
CREATE INDEX IF NOT EXISTS idx_fotos_materiais_empresa ON public.fotos_materiais(empresa_id);

-- Política admin para SELECT/UPDATE de qualquer foto
DROP POLICY IF EXISTS "Admin pode ver todas as fotos" ON public.fotos_materiais;
CREATE POLICY "Admin pode ver todas as fotos"
  ON public.fotos_materiais FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin pode moderar fotos" ON public.fotos_materiais;
CREATE POLICY "Admin pode moderar fotos"
  ON public.fotos_materiais FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Tabela de configuração global
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  enabled boolean NOT NULL DEFAULT false,
  provider text,
  minimum_confidence numeric NOT NULL DEFAULT 0.80,
  auto_approve boolean NOT NULL DEFAULT false,
  auto_reject boolean NOT NULL DEFAULT false,
  manual_review_threshold numeric NOT NULL DEFAULT 0.60,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin lê ai_settings" ON public.ai_settings;
CREATE POLICY "Admin lê ai_settings"
  ON public.ai_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin escreve ai_settings" ON public.ai_settings;
CREATE POLICY "Admin escreve ai_settings"
  ON public.ai_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ai_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- RPC de moderação manual
CREATE OR REPLACE FUNCTION public.admin_moderar_foto(
  _foto_id uuid,
  _decisao public.ai_status,
  _motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.fotos_materiais SET
    ai_status = _decisao,
    ai_reason = COALESCE(_motivo, ai_reason),
    ai_provider = COALESCE(ai_provider, 'manual'),
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    needs_ai_analysis = false
  WHERE id = _foto_id;

  RETURN jsonb_build_object('ok', true);
END $$;
