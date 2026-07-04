-- Allow anonymous (visitor) read access to active materials and their photos
CREATE POLICY "Materiais ativos públicos (anon)"
  ON public.materiais FOR SELECT TO anon
  USING (status = 'ativo');

CREATE POLICY "Fotos públicas para anon"
  ON public.fotos_materiais FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.materiais m
    WHERE m.id = fotos_materiais.material_id AND m.status = 'ativo'
  ));

-- Allow anon to call the public-company function (only exposes non-sensitive fields)
GRANT EXECUTE ON FUNCTION public.empresa_publica(uuid) TO anon;