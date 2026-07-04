
-- Novos status de material
DO $$ BEGIN
  ALTER TYPE public.material_status ADD VALUE IF NOT EXISTS 'expirado';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.material_status ADD VALUE IF NOT EXISTS 'arquivado';
EXCEPTION WHEN others THEN NULL; END $$;

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

  -- Anúncios: contam ativos e vendidos publicados nos últimos 30 dias
  SELECT count(*) INTO uso_anuncios
    FROM public.materiais m
    JOIN public.empresas e ON e.id = m.empresa_id
    WHERE e.owner_id = _user_id
      AND m.status IN ('ativo','vendido')
      AND m.created_at >= now() - interval '30 days';

  -- Alertas: ativos criados nos últimos 30 dias
  SELECT count(*) INTO uso_alertas
    FROM public.alertas
   WHERE user_id = _user_id
     AND ativo = true
     AND created_at >= now() - interval '30 days';

  -- Buscas: já é mensal
  SELECT count(*) INTO uso_buscas
    FROM public.pedidos_material
   WHERE user_id = _user_id
     AND created_at >= date_trunc('month', now());

  -- Próxima liberação de vaga de anúncio (o material elegível mais antigo)
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

-- check_plan_limit já lê de get_user_plan_status; sem mudanças necessárias.

-- Job de manutenção: expira anúncios e alertas além do ciclo
CREATE OR REPLACE FUNCTION public.expirar_ciclo_30d()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qa int;
  ql int;
BEGIN
  WITH upd AS (
    UPDATE public.materiais
       SET status = 'expirado'
     WHERE status = 'ativo'
       AND created_at < now() - interval '30 days'
     RETURNING id
  ) SELECT count(*) INTO qa FROM upd;

  WITH upd AS (
    UPDATE public.alertas
       SET ativo = false
     WHERE ativo = true
       AND created_at < now() - interval '30 days'
     RETURNING id
  ) SELECT count(*) INTO ql FROM upd;

  RETURN jsonb_build_object('anuncios_expirados', qa, 'alertas_expirados', ql);
END $$;
