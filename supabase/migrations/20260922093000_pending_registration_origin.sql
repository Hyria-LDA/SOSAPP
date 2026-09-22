BEGIN;

-- Origem informada pelo link durante o onboarding. Não gera indicação/comissão.
CREATE TABLE IF NOT EXISTS public.cadastro_origens (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  vendedor_id uuid REFERENCES public.vendedores_parceiros(id) ON DELETE SET NULL,
  codigo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cadastro_origens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cadastro_origens FROM anon, authenticated;
GRANT SELECT ON public.cadastro_origens TO authenticated;
DROP POLICY IF EXISTS cadastro_origens_admin_read ON public.cadastro_origens;
CREATE POLICY cadastro_origens_admin_read ON public.cadastro_origens
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.registrar_origem_cadastro(_codigo text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  emp_id uuid;
  parceiro public.vendedores_parceiros%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT id INTO emp_id FROM public.empresas
    WHERE owner_id = auth.uid() AND onboarded IS NOT TRUE AND status = 'pendente';
  IF emp_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO parceiro FROM public.vendedores_parceiros
    WHERE upper(codigo) = upper(regexp_replace(trim(_codigo), '\s+', '', 'g'))
      AND ativo = true;
  IF parceiro.id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.cadastro_origens(empresa_id, vendedor_id, codigo)
    VALUES (emp_id, parceiro.id, parceiro.codigo)
    ON CONFLICT (empresa_id) DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_origem_cadastro(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_origem_cadastro(text) TO authenticated;
COMMIT;
