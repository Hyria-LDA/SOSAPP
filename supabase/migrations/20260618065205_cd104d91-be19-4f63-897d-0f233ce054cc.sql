
CREATE POLICY "Banners: leitura autenticada"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'banners');

CREATE POLICY "Banners: upload admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Banners: update admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Banners: delete admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'));
