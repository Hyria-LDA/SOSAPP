
CREATE POLICY "Padroes imagens leitura publica" ON storage.objects FOR SELECT USING (bucket_id = 'padroes');
CREATE POLICY "Admin upload padroes" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'padroes' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update padroes" ON storage.objects FOR UPDATE USING (bucket_id = 'padroes' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete padroes" ON storage.objects FOR DELETE USING (bucket_id = 'padroes' AND public.has_role(auth.uid(), 'admin'));
