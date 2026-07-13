-- Faz buscas/alertas consumirem limite por 30 dias, mesmo que o usuario exclua o item.

CREATE TABLE IF NOT EXISTS public.plan_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource text NOT NULL CHECK (resource IN ('alertas', 'buscas')),
  source_table text,
  source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_usage_events_source_uniq
  ON public.plan_usage_events(resource, source_table, source_id)
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS plan_usage_events_user_resource_created_idx
  ON public.plan_usage_events(user_id, resource, created_at DESC);

ALTER TABLE public.plan_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios leem proprio uso de plano" ON public.plan_usage_events;
CREATE POLICY "Usuarios leem proprio uso de plano"
  ON public.plan_usage_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.plan_usage_events TO authenticated;
GRANT ALL ON public.plan_usage_events TO service_role;

INSERT INTO public.plan_usage_events(user_id, resource, source_table, source_id, created_at)
SELECT user_id, 'alertas', 'alertas', id, created_at
FROM public.alertas
WHERE created_at >= now() - interval '30 days'
ON CONFLICT DO NOTHING;

INSERT INTO public.plan_usage_events(user_id, resource, source_table, source_id, created_at)
SELECT user_id, 'buscas', 'pedidos_material', id, created_at
FROM public.pedidos_material
WHERE created_at >= now() - interval '30 days'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_user_plan_status(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp RECORD;
  pl  RECORD;
  freep RECORD;
  vencido boolean;
  ini timestamptz;
  fim timestamptz;
  uso_anuncios int;
  uso_alertas  int;
  uso_buscas   int;
  proxima_lib timestamptz;
  lib_7d int;
BEGIN
  SELECT * INTO emp FROM public.empresas WHERE owner_id = _user_id LIMIT 1;
  SELECT * INTO freep FROM public.planos WHERE slug = 'free' LIMIT 1;

  IF emp IS NULL THEN
    pl := freep;
    vencido := false;
  ELSE
    SELECT * INTO pl FROM public.planos WHERE id = emp.plano_id;
    IF pl IS NULL THEN pl := freep; END IF;
    vencido := (pl.slug <> 'free' AND emp.plano_vencimento IS NOT NULL AND emp.plano_vencimento < now());
    IF vencido THEN pl := freep; END IF;
  END IF;

  SELECT count(*) INTO uso_anuncios
    FROM public.materiais m
    JOIN public.empresas e ON e.id = m.empresa_id
    WHERE e.owner_id = _user_id
      AND m.status IN ('ativo','vendido')
      AND m.created_at >= now() - interval '30 days';

  SELECT count(*) INTO uso_alertas
    FROM public.plan_usage_events
   WHERE user_id = _user_id
     AND resource = 'alertas'
     AND created_at >= now() - interval '30 days';

  SELECT count(*) INTO uso_buscas
    FROM public.plan_usage_events
   WHERE user_id = _user_id
     AND resource = 'buscas'
     AND created_at >= now() - interval '30 days';

  SELECT min(dt) INTO proxima_lib
  FROM (
    SELECT m.created_at + interval '30 days' AS dt
      FROM public.materiais m
      JOIN public.empresas e ON e.id = m.empresa_id
     WHERE e.owner_id = _user_id
       AND m.status IN ('ativo','vendido')
       AND m.created_at >= now() - interval '30 days'
    UNION ALL
    SELECT created_at + interval '30 days' AS dt
      FROM public.plan_usage_events
     WHERE user_id = _user_id
       AND created_at >= now() - interval '30 days'
  ) s;

  SELECT count(*) INTO lib_7d
  FROM (
    SELECT m.created_at + interval '30 days' AS dt
      FROM public.materiais m
      JOIN public.empresas e ON e.id = m.empresa_id
     WHERE e.owner_id = _user_id
       AND m.status IN ('ativo','vendido')
       AND m.created_at >= now() - interval '30 days'
    UNION ALL
    SELECT created_at + interval '30 days' AS dt
      FROM public.plan_usage_events
     WHERE user_id = _user_id
       AND created_at >= now() - interval '30 days'
  ) s
  WHERE dt <= now() + interval '7 days';

  ini := emp.plano_inicio;
  fim := emp.plano_vencimento;

  RETURN jsonb_build_object(
    'plano', jsonb_build_object(
      'id', pl.id, 'slug', pl.slug, 'nome', pl.nome, 'cor', pl.cor,
      'preco', pl.preco, 'descricao', pl.descricao, 'recursos', pl.recursos,
      'max_anuncios', pl.max_anuncios, 'max_buscas', pl.max_buscas,
      'max_alertas', pl.max_alertas, 'max_fotos', pl.max_fotos
    ),
    'vencido', vencido,
    'plano_inicio', ini,
    'plano_vencimento', fim,
    'uso', jsonb_build_object(
      'anuncios', uso_anuncios,
      'alertas',  uso_alertas,
      'buscas',   uso_buscas
    ),
    'proxima_liberacao', proxima_lib,
    'liberacoes_proximas_7d', lib_7d
  );
END $function$;

CREATE OR REPLACE FUNCTION public.enforce_alerta_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st jsonb;
  limite int;
  atual int;
  nome_plano text;
BEGIN
  st := public.get_user_plan_status(NEW.user_id);
  limite := (st->'plano'->>'max_alertas')::int;
  atual  := (st->'uso'->>'alertas')::int;
  nome_plano := st->'plano'->>'nome';

  IF limite <> -1 AND atual >= limite THEN
    RAISE EXCEPTION 'Limite de alertas do plano % atingido (%/%). Esse limite renova 30 dias apos a criacao do alerta.',
      nome_plano, atual, limite
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.plan_usage_events(user_id, resource, source_table, source_id, created_at)
  VALUES (NEW.user_id, 'alertas', 'alertas', NEW.id, COALESCE(NEW.created_at, now()))
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_alerta_limit ON public.alertas;
CREATE TRIGGER trg_enforce_alerta_limit
BEFORE INSERT ON public.alertas
FOR EACH ROW EXECUTE FUNCTION public.enforce_alerta_limit();

CREATE OR REPLACE FUNCTION public.enforce_pedido_material_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st jsonb;
  limite int;
  atual int;
  nome_plano text;
BEGIN
  st := public.get_user_plan_status(NEW.user_id);
  limite := (st->'plano'->>'max_buscas')::int;
  atual := (st->'uso'->>'buscas')::int;
  nome_plano := st->'plano'->>'nome';

  IF limite <> -1 AND atual >= limite THEN
    RAISE EXCEPTION 'Limite de buscas automaticas do plano % atingido (%/%). Esse limite renova 30 dias apos a criacao da busca.',
      nome_plano, atual, limite
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.plan_usage_events(user_id, resource, source_table, source_id, created_at)
  VALUES (NEW.user_id, 'buscas', 'pedidos_material', NEW.id, COALESCE(NEW.created_at, now()))
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_pedido_material_limit ON public.pedidos_material;
CREATE TRIGGER trg_enforce_pedido_material_limit
BEFORE INSERT ON public.pedidos_material
FOR EACH ROW EXECUTE FUNCTION public.enforce_pedido_material_limit();
