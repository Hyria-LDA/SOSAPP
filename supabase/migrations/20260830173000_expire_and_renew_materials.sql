-- Anuncios deixam a exposicao publica apos 30 dias, mas continuam disponiveis
-- ao proprietario na aba Expirados. Renovar inicia um novo ciclo de uso.

DROP POLICY IF EXISTS "Materiais ativos visíveis" ON public.materiais;
CREATE POLICY "Materiais ativos visíveis" ON public.materiais FOR SELECT TO authenticated
USING (
  (status = 'ativo' AND created_at > now() - interval '30 days')
  OR EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Materiais ativos públicos (anon)" ON public.materiais;
CREATE POLICY "Materiais ativos públicos (anon)" ON public.materiais FOR SELECT TO anon
USING (status = 'ativo' AND created_at > now() - interval '30 days');

CREATE OR REPLACE FUNCTION public.materiais_perto_de_voce(
  _lat double precision DEFAULT NULL, _lon double precision DEFAULT NULL,
  _limit integer DEFAULT 12, _raio_km double precision DEFAULT 999999, _seed text DEFAULT ''
)
RETURNS TABLE (
  id uuid, padrao text, fabricante text, preco numeric, cidade text, estado text,
  latitude double precision, longitude double precision, distancia_km double precision,
  plano_slug text, plano_vigente boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id, m.padrao, m.fabricante, m.preco, m.cidade, m.estado, m.latitude, m.longitude,
    CASE WHEN _lat IS NOT NULL AND _lon IS NOT NULL AND m.latitude IS NOT NULL AND m.longitude IS NOT NULL
      THEN public.haversine_km(_lat, _lon, m.latitude, m.longitude) ELSE NULL END,
    p.slug,
    (p.slug = 'free' OR e.plano_vencimento IS NULL OR e.plano_vencimento > now())
  FROM public.materiais m
  JOIN public.empresas e ON e.id = m.empresa_id
  LEFT JOIN public.planos p ON p.id = e.plano_id
  WHERE m.status = 'ativo'
    AND m.created_at > now() - interval '30 days'
    AND (_lat IS NULL OR _lon IS NULL OR m.latitude IS NULL OR m.longitude IS NULL
      OR public.haversine_km(_lat, _lon, m.latitude, m.longitude) <= _raio_km)
  ORDER BY
    CASE WHEN (p.slug = 'free' OR e.plano_vencimento IS NULL OR e.plano_vencimento > now()) THEN
      CASE p.slug WHEN 'premium' THEN 1 WHEN 'ultra' THEN 2 WHEN 'tx' THEN 3 WHEN 'free' THEN 4 ELSE 5 END
    ELSE 6 END,
    md5(m.id::text || COALESCE(_seed, ''))
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.renew_material(_material_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid(); mat record; st jsonb;
  limite integer; atual integer; nome_plano text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;

  SELECT m.id, m.status, m.created_at INTO mat
  FROM public.materiais m JOIN public.empresas e ON e.id = m.empresa_id
  WHERE m.id = _material_id AND e.owner_id = uid FOR UPDATE OF m;

  IF mat IS NULL THEN
    RAISE EXCEPTION 'Anuncio nao encontrado ou sem permissao.' USING ERRCODE = '42501';
  END IF;
  IF mat.status <> 'ativo' OR mat.created_at > now() - interval '30 days' THEN
    RAISE EXCEPTION 'Somente anuncios expirados podem ser renovados.' USING ERRCODE = 'check_violation';
  END IF;

  st := public.get_user_plan_status(uid);
  limite := (st->'plano'->>'max_anuncios')::integer;
  atual := (st->'uso'->>'anuncios')::integer;
  nome_plano := st->'plano'->>'nome';
  IF limite <> -1 AND atual >= limite THEN
    RAISE EXCEPTION 'Limite de anuncios do plano % atingido (%/%).', nome_plano, atual, limite
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.materiais SET status = 'ativo', created_at = now(), updated_at = now()
  WHERE id = _material_id;
  RETURN jsonb_build_object('ok', true, 'uso_anuncios', atual + 1, 'limite', limite);
END;
$$;

REVOKE ALL ON FUNCTION public.renew_material(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_material(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.materiais_perto_de_voce(double precision, double precision, integer, double precision, text) TO anon, authenticated;
