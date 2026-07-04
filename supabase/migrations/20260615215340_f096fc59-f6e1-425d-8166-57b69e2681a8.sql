
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS observacoes_admin text,
  ADD COLUMN IF NOT EXISTS ultimo_acesso timestamptz;

ALTER TABLE public.financeiro
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS observacoes text;

CREATE TABLE IF NOT EXISTS public.empresa_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  autor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  descricao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_historico TO authenticated;
GRANT ALL ON public.empresa_historico TO service_role;

ALTER TABLE public.empresa_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia historico empresa"
  ON public.empresa_historico
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owner le proprio historico"
  ON public.empresa_historico
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_historico.empresa_id AND e.owner_id = auth.uid()));

CREATE INDEX IF NOT EXISTS empresa_historico_empresa_idx ON public.empresa_historico(empresa_id, created_at DESC);
