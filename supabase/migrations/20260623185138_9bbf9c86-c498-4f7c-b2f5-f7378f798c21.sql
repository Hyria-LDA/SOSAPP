
-- Conta TODOS os alertas (ativos e inativos) criados nos últimos 30 dias para o uso do ciclo,
-- impedindo bypass do limite via toggle off / delete + recriação.
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

  -- Alertas: TODOS criados nos últimos 30 dias (ativos ou desativados) ocupam vaga
  SELECT count(*) INTO uso_alertas
    FROM public.alertas
   WHERE user_id = _user_id
     AND created_at >= now() - interval '30 days';

  SELECT count(*) INTO uso_buscas
    FROM public.pedidos_material
   WHERE user_id = _user_id
     AND created_at >= date_trunc('month', now());

  SELECT min(m.created_at) + interval '30 days' INTO proxima_lib
    FROM public.materiais m
    JOIN public.empresas e ON e.id = m.empresa_id
   WHERE e.owner_id = _user_id
     AND m.status IN ('ativo','vendido')
     AND m.created_at >= now() - interval '30 days';

  SELECT count(*) INTO lib_7d
    FROM public.materiais m
    JOIN public.empresas e ON e.id = m.empresa_id
   WHERE e.owner_id = _user_id
     AND m.status IN ('ativo','vendido')
     AND m.created_at >= now() - interval '30 days'
     AND m.created_at + interval '30 days' <= now() + interval '7 days';

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

-- Enforce limite de alertas no banco (defesa real, independente do front)
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
    RAISE EXCEPTION 'Limite de alertas do plano % atingido (%/%). Faça upgrade para criar mais alertas.',
      nome_plano, atual, limite
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_alerta_limit ON public.alertas;
CREATE TRIGGER trg_enforce_alerta_limit
BEFORE INSERT ON public.alertas
FOR EACH ROW EXECUTE FUNCTION public.enforce_alerta_limit();
