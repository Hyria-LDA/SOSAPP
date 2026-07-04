-- Endurecer policy de leitura autenticada em fotos_materiais:
-- antes: USING (true) deixava qualquer logado ver fotos de materiais inativos
DROP POLICY IF EXISTS "Fotos visíveis com material" ON public.fotos_materiais;

CREATE POLICY "Fotos visíveis com material"
  ON public.fotos_materiais
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.materiais m
      WHERE m.id = fotos_materiais.material_id
        AND m.status = 'ativo'
    )
    OR EXISTS (
      SELECT 1 FROM public.materiais m
      JOIN public.empresas e ON e.id = m.empresa_id
      WHERE m.id = fotos_materiais.material_id
        AND e.owner_id = auth.uid()
    )
  );