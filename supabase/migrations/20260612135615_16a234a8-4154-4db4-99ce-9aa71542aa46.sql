ALTER TABLE public.materiais
  ADD COLUMN IF NOT EXISTS grain_direction TEXT
  CHECK (grain_direction IN ('vertical','horizontal'));
CREATE INDEX IF NOT EXISTS idx_materiais_grain ON public.materiais (grain_direction);