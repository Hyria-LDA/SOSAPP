
CREATE TABLE public.assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  plano_id uuid NOT NULL REFERENCES public.planos(id),
  mp_preapproval_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  valor numeric(10,2) NOT NULL,
  proximo_pagamento timestamptz,
  init_point text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.assinaturas TO authenticated;
GRANT ALL ON public.assinaturas TO service_role;

ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Donos veem suas assinaturas"
  ON public.assinaturas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid()));

CREATE POLICY "Donos criam suas assinaturas"
  ON public.assinaturas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid()));

CREATE POLICY "Admins veem todas"
  ON public.assinaturas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_assinaturas_updated_at
  BEFORE UPDATE ON public.assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_assinaturas_empresa ON public.assinaturas(empresa_id);
CREATE INDEX idx_assinaturas_preapproval ON public.assinaturas(mp_preapproval_id);
