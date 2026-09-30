BEGIN;
-- Reutiliza a empresa anunciante e o parceiro de divulgação existentes.
ALTER TABLE public.banner_empresas
 ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS partner_id uuid UNIQUE REFERENCES public.vendedores_parceiros(id),
 ADD COLUMN IF NOT EXISTS login text,
 ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS editable_fields text[] NOT NULL DEFAULT ARRAY['phone','whatsapp','website','instagram'],
 ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive'));
CREATE TABLE IF NOT EXISTS public.store_contracts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.banner_empresas(id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 start_date date NOT NULL, end_date date NOT NULL, segment text NOT NULL, region text NOT NULL DEFAULT '',
 cities text[] NOT NULL DEFAULT '{}', states text[] NOT NULL DEFAULT '{}',
 banners_per_week integer NOT NULL CHECK(banners_per_week BETWEEN 1 AND 20),
 status text NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','suspended','cancelled')),
 notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date >= start_date AND end_date <= start_date + 730)
);
CREATE TABLE IF NOT EXISTS public.store_banners (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.banner_empresas(id),
 contract_id uuid NOT NULL REFERENCES public.store_contracts(id), week_number integer NOT NULL CHECK(week_number > 0),
 title text NOT NULL DEFAULT '', destination_url text NOT NULL DEFAULT '', image_path text,
 start_date date NOT NULL, end_date date NOT NULL,
 segment text NOT NULL, region text NOT NULL, cities text[] NOT NULL DEFAULT '{}', states text[] NOT NULL DEFAULT '{}',
 format text NOT NULL DEFAULT 'horizontal' CHECK(format IN ('horizontal','vertical')),
 approval text NOT NULL DEFAULT 'pending' CHECK(approval IN ('pending','approved','rejected')),
 submitted boolean NOT NULL DEFAULT false, rejection_reason text, approved_at timestamptz,
 views bigint NOT NULL DEFAULT 0, clicks bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date >= start_date)
);
CREATE TABLE IF NOT EXISTS public.store_banner_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.banner_empresas(id),
 banner_id uuid NOT NULL REFERENCES public.store_banners(id), actor_id uuid REFERENCES auth.users(id),
 action text NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_contracts_store_idx ON public.store_contracts(store_id);
CREATE INDEX IF NOT EXISTS store_banners_slot_idx ON public.store_banners(contract_id,week_number);
CREATE INDEX IF NOT EXISTS store_banner_history_store_idx ON public.store_banner_history(store_id);

CREATE OR REPLACE FUNCTION public.store_today() RETURNS date LANGUAGE sql STABLE
AS $$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date $$;
CREATE OR REPLACE FUNCTION public.store_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$ SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'admin') $$;
CREATE OR REPLACE FUNCTION public.store_can_access(_store uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$ SELECT public.store_is_admin() OR EXISTS(SELECT 1 FROM public.banner_empresas WHERE id=_store AND user_id=auth.uid() AND status='active' AND public.has_role(auth.uid(),'store_partner')) $$;
CREATE OR REPLACE FUNCTION public.store_city_key(_value text) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT lower(regexp_replace(btrim(translate(coalesce(_value,''),'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '\s+', ' ', 'g')) $$;
CREATE OR REPLACE FUNCTION public.store_contract_status(_c public.store_contracts) RETURNS text LANGUAGE sql STABLE
AS $$ SELECT CASE WHEN _c.status <> 'enabled' THEN _c.status WHEN public.store_today()<_c.start_date THEN 'waiting' WHEN public.store_today()>_c.end_date THEN 'ended' ELSE 'active' END $$;
CREATE OR REPLACE FUNCTION public.store_banner_live(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$ SELECT EXISTS(SELECT 1 FROM public.store_banners b JOIN public.store_contracts c ON c.id=b.contract_id AND c.store_id=b.store_id JOIN public.banner_empresas s ON s.id=b.store_id
 WHERE b.id=_id AND s.status='active' AND b.approval='approved' AND b.submitted AND c.status='enabled'
 AND public.store_today() BETWEEN c.start_date AND c.end_date AND public.store_today() BETWEEN b.start_date AND b.end_date
 AND b.start_date >= c.start_date+(b.week_number-1)*7 AND b.end_date <= least(c.end_date,c.start_date+b.week_number*7-1)) $$;

ALTER TABLE public.store_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_banner_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_contracts,public.store_banners,public.store_banner_history FROM PUBLIC,authenticated,anon;
GRANT SELECT ON public.store_contracts,public.store_banners,public.store_banner_history TO authenticated;
GRANT ALL ON public.store_contracts,public.store_banners,public.store_banner_history TO service_role;
CREATE POLICY store_company_guard ON public.banner_empresas AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT public.has_role(auth.uid(),'store_partner') OR public.store_can_access(id));
CREATE POLICY store_company_update_guard ON public.banner_empresas AS RESTRICTIVE FOR UPDATE TO authenticated USING(NOT public.has_role(auth.uid(),'store_partner') OR public.store_is_admin()) WITH CHECK(NOT public.has_role(auth.uid(),'store_partner') OR public.store_is_admin());
CREATE POLICY store_company_insert_guard ON public.banner_empresas AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(NOT public.has_role(auth.uid(),'store_partner') OR public.store_is_admin());
CREATE POLICY store_company_delete_guard ON public.banner_empresas AS RESTRICTIVE FOR DELETE TO authenticated USING(NOT public.has_role(auth.uid(),'store_partner') OR public.store_is_admin());
CREATE POLICY store_company_read ON public.banner_empresas FOR SELECT TO authenticated USING(public.store_can_access(id));
CREATE POLICY store_contract_read ON public.store_contracts FOR SELECT TO authenticated USING(public.store_can_access(store_id));
CREATE POLICY store_banner_read ON public.store_banners FOR SELECT TO authenticated USING(public.store_can_access(store_id));
CREATE POLICY store_history_read ON public.store_banner_history FOR SELECT TO authenticated USING(public.store_can_access(store_id));

-- Nenhuma escrita direta do lojista: toda alteração é validada nos RPCs abaixo.
CREATE OR REPLACE FUNCTION public.store_save_profile(_store uuid,_profile jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.banner_empresas; k text; allowed text[] := ARRAY['legal_name','cnpj','responsible_name','phone','whatsapp','city','state','logo_path','website','instagram'];
BEGIN
 IF NOT public.store_can_access(_store) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT * INTO s FROM public.banner_empresas WHERE id=_store FOR UPDATE;
 IF jsonb_typeof(_profile) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Perfil inválido'; END IF;
 FOR k IN SELECT jsonb_object_keys(_profile) LOOP
  IF NOT k=ANY(allowed) OR (NOT public.store_is_admin() AND NOT k=ANY(s.editable_fields)) THEN RAISE EXCEPTION 'Campo não autorizado: %',k; END IF;
  IF jsonb_typeof(_profile->k)<>'string' OR length(_profile->>k)>500 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF k IN ('website','instagram') AND _profile->>k<>'' AND _profile->>k !~ '^https://[^[:space:]]+$' THEN RAISE EXCEPTION 'Use um link https://'; END IF;
  IF k='logo_path' AND _profile->>k<>'' AND NOT (_profile->>k LIKE _store::text||'/logo/%') THEN RAISE EXCEPTION 'Logo inválido'; END IF;
 END LOOP;
 UPDATE public.banner_empresas SET profile=profile||_profile WHERE id=_store;
END $$;

CREATE OR REPLACE FUNCTION public.store_save_contract(_store uuid,_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cid uuid := nullif(_data->>'id','')::uuid; c public.store_contracts;
BEGIN
 IF NOT public.store_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF _data ? 'cities' AND (jsonb_typeof(_data->'cities') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(_data->'cities') x WHERE x !~ '^.+/[A-Za-z]{2}$')) THEN RAISE EXCEPTION 'Use cidades no formato Cidade/UF'; END IF;
 IF _data ? 'states' AND (jsonb_typeof(_data->'states') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(_data->'states') x WHERE upper(x) !~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$')) THEN RAISE EXCEPTION 'Estado inválido'; END IF;
 IF cid IS NOT NULL THEN
  SELECT * INTO c FROM public.store_contracts WHERE id=cid AND store_id=_store FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  IF EXISTS(SELECT 1 FROM public.store_banners WHERE contract_id=cid) AND
    (c.start_date<>(_data->>'start_date')::date OR c.end_date<>(_data->>'end_date')::date OR c.banners_per_week<>(_data->>'banners_per_week')::int) THEN
    RAISE EXCEPTION 'Contrato com envios: preserve datas e limite; crie outro contrato para mudar o período'; END IF;
 END IF;
 INSERT INTO public.store_contracts(id,store_id,name,start_date,end_date,segment,region,cities,states,banners_per_week,status,notes)
 VALUES(coalesce(cid,gen_random_uuid()),_store,_data->>'name',(_data->>'start_date')::date,(_data->>'end_date')::date,_data->>'segment',coalesce(_data->>'region',''),
 ARRAY(SELECT jsonb_array_elements_text(coalesce(_data->'cities','[]'))),ARRAY(SELECT upper(jsonb_array_elements_text(coalesce(_data->'states','[]')))),
 (_data->>'banners_per_week')::integer,coalesce(_data->>'status','enabled'),coalesce(_data->>'notes',''))
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,start_date=excluded.start_date,end_date=excluded.end_date,segment=excluded.segment,region=excluded.region,cities=excluded.cities,states=excluded.states,banners_per_week=excluded.banners_per_week,status=excluded.status,notes=excluded.notes
 RETURNING id INTO cid;
 RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.store_reserve_banner(_contract uuid,_week integer,_banner uuid DEFAULT NULL,_extension text DEFAULT 'jpg') RETURNS public.store_banners
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.store_contracts; b public.store_banners; wstart date; wend date; bid uuid;
BEGIN
 SELECT * INTO c FROM public.store_contracts WHERE id=_contract FOR UPDATE;
 IF c.id IS NULL OR NOT public.store_can_access(c.store_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF public.store_contract_status(c)<>'active' OR NOT EXISTS(SELECT 1 FROM public.banner_empresas WHERE id=c.store_id AND status='active') THEN RAISE EXCEPTION 'Você não possui uma campanha de publicidade ativa no momento. Entre em contato com o SOS Marceneiros para contratar uma nova campanha.'; END IF;
 wstart := c.start_date+(_week-1)*7; wend := least(c.end_date,wstart+6);
 IF _week IS NULL OR _week<1 OR _week>105 OR wstart>c.end_date OR wend<public.store_today() THEN RAISE EXCEPTION 'Semana indisponível'; END IF;
 IF _extension IS NULL OR _extension NOT IN ('jpg','png','webp') THEN RAISE EXCEPTION 'Formato inválido'; END IF;
 IF _banner IS NULL THEN
  IF (SELECT count(*) FROM public.store_banners WHERE contract_id=c.id AND week_number=_week)>=c.banners_per_week THEN RAISE EXCEPTION 'Limite de banners desta semana atingido'; END IF;
  bid := gen_random_uuid();
  INSERT INTO public.store_banners(id,store_id,contract_id,week_number,start_date,end_date,segment,region,cities,states)
   VALUES(bid,c.store_id,c.id,_week,wstart,wend,c.segment,c.region,c.cities,c.states);
 ELSE
  SELECT * INTO b FROM public.store_banners WHERE id=_banner AND contract_id=c.id AND week_number=_week FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Banner não encontrado'; END IF;
  IF b.approval='approved' AND NOT public.store_is_admin() THEN RAISE EXCEPTION 'Banner aprovado: solicite a alteração ao administrador'; END IF;
  bid := b.id;
  INSERT INTO public.store_banner_history(store_id,banner_id,actor_id,action,snapshot) VALUES(c.store_id,b.id,auth.uid(),'replacement',to_jsonb(b));
 END IF;
 UPDATE public.store_banners SET image_path=c.store_id::text||'/'||c.id::text||'/'||bid::text||'/'||gen_random_uuid()::text||'.'||_extension,
 start_date=wstart,end_date=wend,approval='pending',submitted=false,approved_at=NULL,rejection_reason=NULL,updated_at=now() WHERE id=bid RETURNING * INTO b;
 RETURN b;
END $$;

CREATE OR REPLACE FUNCTION public.store_submit_banner(_banner uuid,_title text,_url text,_format text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE b public.store_banners; c public.store_contracts;
BEGIN
 SELECT * INTO b FROM public.store_banners WHERE id=_banner FOR UPDATE;
 IF b.id IS NULL OR NOT public.store_can_access(b.store_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT * INTO c FROM public.store_contracts WHERE id=b.contract_id;
 IF public.store_contract_status(c)<>'active' OR b.end_date<public.store_today() OR b.approval='approved' THEN RAISE EXCEPTION 'Envio indisponível'; END IF;
 IF _title IS NULL OR _url IS NULL OR _format IS NULL OR length(btrim(_title)) NOT BETWEEN 1 AND 120 OR length(_url)>2048 OR (_url<>'' AND _url !~ '^https://[^[:space:]]+$') THEN RAISE EXCEPTION 'Informe título e link HTTPS válido'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='store-media' AND name=b.image_path) THEN RAISE EXCEPTION 'Envie a imagem antes de finalizar'; END IF;
 UPDATE public.store_banners SET title=btrim(_title),destination_url=_url,format=_format,submitted=true,approval='pending',updated_at=now() WHERE id=_banner;
 INSERT INTO public.store_banner_history(store_id,banner_id,actor_id,action,snapshot) VALUES(b.store_id,b.id,auth.uid(),'submitted',to_jsonb(b));
END $$;

CREATE OR REPLACE FUNCTION public.store_review_banner(_banner uuid,_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE b public.store_banners; c public.store_contracts; d1 date; d2 date;
BEGIN
 IF NOT public.store_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF _data ? 'cities' AND (jsonb_typeof(_data->'cities') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(_data->'cities') x WHERE x !~ '^.+/[A-Za-z]{2}$')) THEN RAISE EXCEPTION 'Use cidades no formato Cidade/UF'; END IF;
 IF _data ? 'states' AND (jsonb_typeof(_data->'states') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(_data->'states') x WHERE upper(x) !~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$')) THEN RAISE EXCEPTION 'Estado inválido'; END IF;
 SELECT * INTO b FROM public.store_banners WHERE id=_banner FOR UPDATE;
 SELECT * INTO c FROM public.store_contracts WHERE id=b.contract_id;
 IF b.id IS NULL OR NOT b.submitted THEN RAISE EXCEPTION 'Banner não enviado'; END IF;
 IF _data->>'approval' IS NULL OR _data->>'approval' NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Decisão inválida'; END IF;
 IF _data->>'approval'='rejected' AND nullif(btrim(_data->>'rejection_reason'),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo'; END IF;
 d1 := coalesce((_data->>'start_date')::date,b.start_date); d2 := coalesce((_data->>'end_date')::date,b.end_date);
 IF d1<c.start_date+(b.week_number-1)*7 OR d2>least(c.end_date,c.start_date+b.week_number*7-1) OR d2<d1 THEN RAISE EXCEPTION 'Datas devem estar dentro da semana contratada'; END IF;
 INSERT INTO public.store_banner_history(store_id,banner_id,actor_id,action,snapshot) VALUES(b.store_id,b.id,auth.uid(),_data->>'approval',to_jsonb(b));
 UPDATE public.store_banners SET approval=_data->>'approval',rejection_reason=CASE WHEN _data->>'approval'='rejected' THEN _data->>'rejection_reason' END,
 approved_at=CASE WHEN _data->>'approval'='approved' THEN now() END,start_date=d1,end_date=d2,
 segment=coalesce(_data->>'segment',b.segment),region=coalesce(_data->>'region',b.region),
 cities=CASE WHEN _data ? 'cities' THEN ARRAY(SELECT jsonb_array_elements_text(_data->'cities')) ELSE b.cities END,
 states=CASE WHEN _data ? 'states' THEN ARRAY(SELECT upper(jsonb_array_elements_text(_data->'states'))) ELSE b.states END,updated_at=now() WHERE id=b.id;
END $$;

-- A biblioteca é privada. Somente arte aprovada e vigente pode ser lida pelo público do app.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('store-media','store-media',false,10485760,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
CREATE OR REPLACE FUNCTION public.store_file_access(_name text,_write boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE sid uuid; b public.store_banners;
BEGIN
 BEGIN sid := split_part(_name,'/',1)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 IF _write THEN
  IF NOT public.store_can_access(sid) THEN RETURN false; END IF;
  IF _name LIKE sid::text||'/logo/%' THEN RETURN public.store_is_admin() OR EXISTS(SELECT 1 FROM public.banner_empresas WHERE id=sid AND 'logo_path'=ANY(editable_fields)); END IF;
  SELECT * INTO b FROM public.store_banners WHERE store_id=sid AND image_path=_name AND approval='pending';
  RETURN b.id IS NOT NULL AND EXISTS(SELECT 1 FROM public.store_contracts c JOIN public.banner_empresas s ON s.id=c.store_id
    WHERE c.id=b.contract_id AND public.store_contract_status(c)='active' AND s.status='active' AND b.end_date>=public.store_today());
 END IF;
 RETURN public.store_can_access(sid) OR EXISTS(SELECT 1 FROM public.store_banners WHERE image_path=_name AND public.store_banner_live(id));
END $$;
CREATE POLICY store_media_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='store-media' AND public.store_file_access(name));
CREATE POLICY store_media_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='store-media' AND public.store_file_access(name,true));
-- Restritiva impede políticas antigas e amplas de abrir o novo bucket.
CREATE POLICY store_media_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(bucket_id<>'store-media' OR public.store_file_access(name));
CREATE POLICY store_media_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(bucket_id<>'store-media' OR public.store_file_access(name,true));
CREATE POLICY store_media_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(bucket_id<>'store-media') WITH CHECK(bucket_id<>'store-media');
CREATE POLICY store_media_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(bucket_id<>'store-media');

CREATE OR REPLACE FUNCTION public.store_live_banners() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'store_banner',true,'titulo',NULL,'subtitulo',NULL,'imagem_url','store-media:'||b.image_path,
 'data_inicio',to_char(b.start_date::timestamp AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'data_fim',to_char((b.end_date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'link',b.destination_url,'botao_texto',CASE WHEN b.destination_url<>'' THEN 'Saiba mais' ELSE NULL END,'duracao_segundos',10,'delay_segundos',0,'intervalo_minutos',0,'banner_format',b.format,'exibir_abertura',b.format='vertical','target_scope','all','planos_alvo',ARRAY['free'])), '[]')
 FROM public.store_banners b JOIN public.store_contracts c ON c.id=b.contract_id
 WHERE public.store_banner_live(b.id)
 AND (cardinality(c.states)=0 AND cardinality(c.cities)=0 OR EXISTS(SELECT 1 FROM public.empresas e WHERE e.owner_id=auth.uid() AND
  (upper(e.estado)=ANY(c.states) OR EXISTS(SELECT 1 FROM unnest(c.cities) x WHERE public.store_city_key(e.cidade||'/'||e.estado)=public.store_city_key(x)))))
 AND (cardinality(b.states)=0 AND cardinality(b.cities)=0 OR EXISTS(SELECT 1 FROM public.empresas e WHERE e.owner_id=auth.uid() AND
  (upper(e.estado)=ANY(b.states) OR EXISTS(SELECT 1 FROM unnest(b.cities) x WHERE public.store_city_key(e.cidade||'/'||e.estado)=public.store_city_key(x)))))
$$;
CREATE OR REPLACE FUNCTION public.store_banner_event(_banner uuid,_click boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.store_banner_live(_banner) THEN UPDATE public.store_banners SET views=views+CASE WHEN _click THEN 0 ELSE 1 END,clicks=clicks+CASE WHEN _click THEN 1 ELSE 0 END WHERE id=_banner; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.store_metrics(_store uuid,_from date DEFAULT NULL,_to date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pid uuid; result jsonb;
BEGIN
 IF NOT public.store_can_access(_store) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT partner_id INTO pid FROM public.banner_empresas WHERE id=_store;
 WITH origins AS (
  SELECT empresa_id,min(created_at) AS created_at FROM (
   SELECT empresa_id,created_at FROM public.cadastro_origens WHERE vendedor_id=pid
   UNION ALL SELECT empresa_id,created_at FROM public.indicacoes WHERE vendedor_id=pid
  ) a GROUP BY empresa_id
 ), registrations AS (
  SELECT o.*,e.onboarded FROM origins o JOIN public.empresas e ON e.id=o.empresa_id
  WHERE (_from IS NULL OR (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date>=_from) AND (_to IS NULL OR (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date<=_to)
 ), clicks AS (
  SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day FROM public.vendedor_cliques
  WHERE vendedor_id=pid AND (_from IS NULL OR (created_at AT TIME ZONE 'America/Sao_Paulo')::date>=_from) AND (_to IS NULL OR (created_at AT TIME ZONE 'America/Sao_Paulo')::date<=_to)
 )
 SELECT jsonb_build_object(
 'clicks',(SELECT count(*) FROM clicks),'today',(SELECT count(*) FROM clicks WHERE day=public.store_today()),
 'last7',(SELECT count(*) FROM clicks WHERE day>=public.store_today()-6),'last30',(SELECT count(*) FROM clicks WHERE day>=public.store_today()-29),
 'registrations',(SELECT count(*) FROM registrations),'completed',(SELECT count(*) FROM registrations WHERE onboarded),
 'publishers',(SELECT count(*) FROM registrations r WHERE EXISTS(SELECT 1 FROM public.materiais m WHERE m.empresa_id=r.empresa_id)),
 'subscriptions',(SELECT count(*) FROM public.indicacoes i WHERE i.vendedor_id=pid AND i.primeira_conversao_em IS NOT NULL AND (_from IS NULL OR (i.primeira_conversao_em AT TIME ZONE 'America/Sao_Paulo')::date>=_from) AND (_to IS NULL OR (i.primeira_conversao_em AT TIME ZONE 'America/Sao_Paulo')::date<=_to)),
 'daily',(SELECT jsonb_agg(jsonb_build_object('date',d::date,'clicks',(SELECT count(*) FROM clicks WHERE day=d::date),'registrations',(SELECT count(*) FROM registrations WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date=d::date)) ORDER BY d) FROM generate_series(public.store_today()-29,public.store_today(),interval '1 day') d)
 ) INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.store_snapshot(_store uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.banner_empresas; sid uuid; result jsonb;
BEGIN
 IF _store IS NOT NULL THEN sid:=_store; ELSE SELECT id INTO sid FROM public.banner_empresas WHERE user_id=auth.uid(); END IF;
 IF sid IS NULL OR NOT public.store_can_access(sid) THEN RAISE EXCEPTION 'Acesso indisponível. Entre em contato com o SOS Marceneiros.'; END IF;
 SELECT * INTO s FROM public.banner_empresas WHERE id=sid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
 SELECT jsonb_build_object('store',to_jsonb(s),'today',public.store_today(),'admin',public.store_is_admin(),
 'code',(SELECT codigo FROM public.vendedores_parceiros WHERE id=s.partner_id),
 'metrics',public.store_metrics(sid),
 'contracts',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('effective_status',public.store_contract_status(c),
   'metrics',public.store_metrics(sid,c.start_date,c.end_date),
   'weeks',(SELECT jsonb_agg(jsonb_build_object('number',w,'start_date',c.start_date+(w-1)*7,'end_date',least(c.end_date,c.start_date+w*7-1),'used',(SELECT count(*) FROM public.store_banners b WHERE b.contract_id=c.id AND b.week_number=w))) FROM generate_series(1,((c.end_date-c.start_date)/7)+1) w)) ORDER BY c.start_date DESC) FROM public.store_contracts c WHERE c.store_id=sid),'[]'),
 'banners',coalesce((SELECT jsonb_agg(to_jsonb(b)||jsonb_build_object('effective_status',CASE WHEN b.end_date<public.store_today() THEN 'expired' WHEN b.approval='rejected' THEN 'rejected' WHEN NOT b.submitted THEN 'draft' WHEN b.approval='pending' THEN 'pending' WHEN public.store_banner_live(b.id) THEN 'published' WHEN b.start_date>public.store_today() THEN 'scheduled' ELSE 'approved' END) ORDER BY b.created_at DESC) FROM public.store_banners b WHERE b.store_id=sid),'[]'),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC) FROM public.store_banner_history h WHERE h.store_id=sid),'[]')) INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.store_admin_list() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.store_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('metrics',public.store_metrics(s.id),
 'contract',(SELECT to_jsonb(c)||jsonb_build_object('effective_status',public.store_contract_status(c)) FROM public.store_contracts c WHERE c.store_id=s.id ORDER BY (public.store_contract_status(c)='active') DESC,c.start_date DESC LIMIT 1),
 'banner_count',(SELECT count(*) FROM public.store_banners WHERE store_id=s.id)) ORDER BY s.nome) FROM public.banner_empresas s WHERE s.user_id IS NOT NULL),'[]');
END $$;

CREATE OR REPLACE FUNCTION public.store_admin_settings(_store uuid,_name text,_status text,_fields text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.store_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF _name IS NULL OR length(btrim(_name)) NOT BETWEEN 1 AND 120 OR _status IS NULL OR _fields IS NULL THEN RAISE EXCEPTION 'Dados inválidos'; END IF;
 IF NOT _fields <@ ARRAY['legal_name','cnpj','responsible_name','phone','whatsapp','city','state','logo_path','website','instagram'] THEN RAISE EXCEPTION 'Campos inválidos'; END IF;
 UPDATE public.banner_empresas SET nome=btrim(_name),status=_status,editable_fields=_fields WHERE id=_store;
 UPDATE public.vendedores_parceiros SET ativo=(_status='active'),nome=btrim(_name) WHERE id=(SELECT partner_id FROM public.banner_empresas WHERE id=_store);
END $$;

-- Chamado só pela função Edge após criar um usuário novo pelo Admin Auth API.
CREATE OR REPLACE FUNCTION public.store_provision(_user uuid,_login text,_name text,_code text,_existing uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE sid uuid; pid uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_user AND raw_app_meta_data->>'store_provisioning'='true') THEN RAISE EXCEPTION 'Usuário não reservado para loja'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user AND role IN ('admin','store_partner')) THEN RAISE EXCEPTION 'Usuário já utilizado'; END IF;
 IF _code !~ '^[A-Z0-9_-]{3,40}$' THEN RAISE EXCEPTION 'Código inválido'; END IF;
 IF _existing IS NOT NULL THEN
  SELECT id INTO sid FROM public.banner_empresas WHERE id=_existing AND user_id IS NULL FOR UPDATE;
  IF sid IS NULL THEN RAISE EXCEPTION 'Empresa indisponível para vincular'; END IF;
 END IF;
 INSERT INTO public.vendedores_parceiros(user_id,nome,email,codigo,comissao_valor,ativo) VALUES(NULL,_name,_login,_code,0,true) RETURNING id INTO pid;
 IF sid IS NULL THEN INSERT INTO public.banner_empresas(nome,user_id,partner_id,login) VALUES(_name,_user,pid,_login) RETURNING id INTO sid;
 ELSE UPDATE public.banner_empresas SET user_id=_user,partner_id=pid,login=_login WHERE id=sid; END IF;
 DELETE FROM public.user_roles WHERE user_id=_user AND role='user';
 INSERT INTO public.user_roles(user_id,role) VALUES(_user,'store_partner');
 DELETE FROM public.empresas WHERE owner_id=_user AND NOT coalesce(onboarded,false);
 RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.store_provision(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_provision(uuid,text,text,text,uuid) TO service_role;

-- Evita que conta exclusiva de lojista recrie uma marcenaria e acesse funções de proprietário.
CREATE POLICY store_no_company_access ON public.empresas AS RESTRICTIVE FOR ALL TO authenticated
 USING(NOT public.has_role(auth.uid(),'store_partner') OR public.has_role(auth.uid(),'admin'))
 WITH CHECK(NOT public.has_role(auth.uid(),'store_partner') OR public.has_role(auth.uid(),'admin'));

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('store_is_admin','store_can_access','store_save_profile','store_save_contract','store_reserve_banner','store_submit_banner','store_review_banner','store_metrics','store_snapshot','store_admin_list','store_admin_settings') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;
-- Helpers usados pelas políticas de leitura pública não revelam perfis nem dados de cadastro.
GRANT EXECUTE ON FUNCTION public.store_file_access(text,boolean),public.store_banner_live(uuid),public.store_live_banners(),public.store_banner_event(uuid,boolean) TO anon,authenticated;
COMMIT;
