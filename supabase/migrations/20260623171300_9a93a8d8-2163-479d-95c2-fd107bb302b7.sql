
DROP POLICY IF EXISTS "Auth upload materiais" ON storage.objects;
CREATE POLICY "Auth upload materiais"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'materiais'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.empresas e
        WHERE e.owner_id = auth.uid()
          AND e.id::text = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS "Auth update próprias fotos" ON storage.objects;
CREATE POLICY "Auth update próprias fotos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'materiais'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.empresas e
        WHERE e.owner_id = auth.uid()
          AND e.id::text = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS "Auth delete próprias fotos" ON storage.objects;
CREATE POLICY "Auth delete próprias fotos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'materiais'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.empresas e
        WHERE e.owner_id = auth.uid()
          AND e.id::text = (storage.foldername(name))[1]
      )
    )
  );
