BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- Additive: keep all existing IDs, files, accounts and counters.
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS campaign_kind text NOT NULL DEFAULT 'legacy' CHECK(campaign_kind IN ('legacy','regional','global','institutional'));
ALTER TABLE public.store_contracts ADD COLUMN IF NOT EXISTS campaign_kind text NOT NULL DEFAULT 'legacy' CHECK(campaign_kind IN ('legacy','regional','global'));
ALTER TABLE public.store_banners ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS published_version jsonb;
CREATE TABLE public.banner_delivery_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 fallback text NOT NULL DEFAULT 'hide' CHECK(fallback IN ('hide','institutional')),
 fallback_banner uuid REFERENCES public.banners(id) ON DELETE RESTRICT,
 CHECK(fallback='hide' OR fallback_banner IS NOT NULL)
);
INSERT INTO public.banner_delivery_settings(id) VALUES(true);
CREATE TABLE public.advertising_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.banner_empresas(id),
 kind text NOT NULL CHECK(kind IN ('campaign','region')), message text NOT NULL CHECK(length(btrim(message)) BETWEEN 5 AND 2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
 response text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
 reviewer uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TABLE public.advertising_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, entity text NOT NULL, entity_id uuid,
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, action text NOT NULL,
 before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.banner_delivery_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertising_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertising_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.banner_delivery_settings,public.advertising_requests,public.advertising_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.banner_delivery_settings TO anon,authenticated;
CREATE POLICY delivery_read ON public.banner_delivery_settings FOR SELECT USING(true);
GRANT SELECT,INSERT,UPDATE ON public.advertising_requests TO authenticated;
CREATE POLICY request_read ON public.advertising_requests FOR SELECT TO authenticated USING(public.store_can_access(store_id));
CREATE POLICY request_insert ON public.advertising_requests FOR INSERT TO authenticated WITH CHECK(public.store_can_access(store_id) AND status='pending' AND response='' AND reviewer IS NULL AND reviewed_at IS NULL);
CREATE POLICY request_update ON public.advertising_requests FOR UPDATE TO authenticated USING(public.store_is_admin()) WITH CHECK(public.store_is_admin());
GRANT SELECT ON public.advertising_audit TO authenticated;
CREATE POLICY audit_admin ON public.advertising_audit FOR SELECT TO authenticated USING(public.store_is_admin());
REVOKE ALL ON public.banner_delivery_settings,public.advertising_requests,public.advertising_audit FROM PUBLIC;

CREATE FUNCTION public.advertising_log() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(OLD)-ARRAY['views','clicks','updated_at'])=(to_jsonb(NEW)-ARRAY['views','clicks','updated_at']) THEN RETURN NEW; END IF;
 INSERT INTO public.advertising_audit(entity,entity_id,actor_id,action,before_data,after_data)
 VALUES(TG_TABLE_NAME,coalesce(NEW.id,OLD.id),auth.uid(),TG_OP,to_jsonb(OLD),to_jsonb(NEW));
 RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.advertising_log() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER advertising_log_banners AFTER INSERT OR UPDATE OR DELETE ON public.banners FOR EACH ROW EXECUTE FUNCTION public.advertising_log();
CREATE TRIGGER advertising_log_companies AFTER INSERT OR UPDATE ON public.banner_empresas FOR EACH ROW EXECUTE FUNCTION public.advertising_log();
CREATE TRIGGER advertising_log_contracts AFTER INSERT OR UPDATE OR DELETE ON public.store_contracts FOR EACH ROW EXECUTE FUNCTION public.advertising_log();
CREATE TRIGGER advertising_log_requests AFTER INSERT OR UPDATE OR DELETE ON public.advertising_requests FOR EACH ROW EXECUTE FUNCTION public.advertising_log();
-- Avoid auditing counters: record content and administrative decisions only.
CREATE TRIGGER advertising_log_store AFTER INSERT OR UPDATE OF approval,paused,image_path,start_date,end_date,cities,states ON public.store_banners FOR EACH ROW EXECUTE FUNCTION public.advertising_log();

CREATE FUNCTION public.advertising_configure(_source text,_id uuid,_kind text,_paused boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.store_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF _source='legacy' THEN
  IF _kind='regional' AND NOT EXISTS(SELECT 1 FROM public.banners WHERE id=_id AND target_scope IN ('state','city')) THEN RAISE EXCEPTION 'Configure estado ou cidades antes de classificar como regional'; END IF;
  IF _kind IN ('global','institutional') AND NOT EXISTS(SELECT 1 FROM public.banners WHERE id=_id AND target_scope IN ('all','all_except')) THEN RAISE EXCEPTION 'Campanha nacional precisa de abrangência nacional'; END IF;
  UPDATE public.banners SET campaign_kind=_kind WHERE id=_id;
 ELSIF _source='store' THEN
  IF _kind='regional' AND NOT EXISTS(SELECT 1 FROM public.store_contracts c JOIN public.store_banners b ON b.contract_id=c.id WHERE b.id=_id AND (cardinality(c.states)>0 OR cardinality(c.cities)>0 OR cardinality(b.states)>0 OR cardinality(b.cities)>0)) THEN RAISE EXCEPTION 'Configure as regiões autorizadas primeiro'; END IF;
  IF _kind='global' AND EXISTS(SELECT 1 FROM public.store_contracts c JOIN public.store_banners b ON b.contract_id=c.id WHERE b.id=_id AND (cardinality(c.states)>0 OR cardinality(c.cities)>0 OR cardinality(b.states)>0 OR cardinality(b.cities)>0)) THEN RAISE EXCEPTION 'Contrato/banner ainda possui restrições regionais'; END IF;
  UPDATE public.store_contracts SET campaign_kind=_kind WHERE id=(SELECT contract_id FROM public.store_banners WHERE id=_id);
  UPDATE public.store_banners SET paused=_paused WHERE id=_id;
 ELSE RAISE EXCEPTION 'Origem inválida'; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Campanha não encontrada'; END IF;
END $$;
CREATE FUNCTION public.advertising_delivery_save(_enabled boolean,_fallback text,_banner uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.store_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF _fallback='institutional' AND NOT EXISTS(SELECT 1 FROM public.banners WHERE id=_banner AND campaign_kind='institutional' AND ativo AND NOT coalesce(exibir_abertura,false) AND banner_format='horizontal') THEN RAISE EXCEPTION 'Escolha um banner institucional horizontal ativo'; END IF;
 UPDATE public.banner_delivery_settings SET enabled=_enabled,fallback=_fallback,fallback_banner=CASE WHEN _fallback='institutional' THEN _banner END WHERE id;
 INSERT INTO public.advertising_audit(entity,actor_id,action,after_data) VALUES('delivery',auth.uid(),'UPDATE',jsonb_build_object('enabled',_enabled,'fallback',_fallback,'banner',_banner));
END $$;
REVOKE ALL ON FUNCTION public.advertising_configure(text,uuid,text,boolean),public.advertising_delivery_save(boolean,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.advertising_configure(text,uuid,text,boolean),public.advertising_delivery_save(boolean,text,uuid) TO authenticated;

-- Preserve the approved image while a replacement is uploaded/reviewed.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.store_reserve_banner(uuid,integer,uuid,text)'::regprocedure) INTO def;
 EXECUTE replace(def,'FUNCTION public.store_reserve_banner(', 'FUNCTION public.store_reserve_banner_previous(');
 SELECT pg_get_functiondef('public.store_review_banner(uuid,jsonb)'::regprocedure) INTO def;
 EXECUTE replace(def,'FUNCTION public.store_review_banner(', 'FUNCTION public.store_review_banner_previous(');
 SELECT pg_get_functiondef('public.store_file_access(text,boolean)'::regprocedure) INTO def;
 EXECUTE replace(def,'FUNCTION public.store_file_access(', 'FUNCTION public.store_file_access_previous(');
END $$;
REVOKE ALL ON FUNCTION public.store_reserve_banner_previous(uuid,integer,uuid,text), public.store_review_banner_previous(uuid,jsonb),public.store_file_access_previous(text,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.store_reserve_banner(_contract uuid,_week integer,_banner uuid DEFAULT NULL,_extension text DEFAULT 'jpg') RETURNS public.store_banners LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old public.store_banners; result public.store_banners; snapshot jsonb;
BEGIN
 SELECT * INTO old FROM public.store_banners WHERE id=_banner FOR UPDATE;
 snapshot:=CASE WHEN old.approval='approved' THEN to_jsonb(old)-'published_version' ELSE old.published_version END;
 SELECT * INTO result FROM public.store_reserve_banner_previous(_contract,_week,_banner,_extension);
 UPDATE public.store_banners SET published_version=snapshot WHERE id=result.id RETURNING * INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.store_review_banner(_banner uuid,_data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.store_review_banner_previous(_banner,_data);
 IF _data->>'approval'='approved' THEN
  UPDATE public.store_banners SET published_version=NULL WHERE id=_banner;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.store_banner_live(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.store_banners current
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.store_banners,coalesce(current.published_version,to_jsonb(current))) b
 JOIN public.store_contracts c ON c.id=b.contract_id AND c.store_id=b.store_id JOIN public.banner_empresas s ON s.id=b.store_id
 WHERE current.id=_id AND NOT current.paused AND s.status='active' AND b.approval='approved' AND b.submitted AND c.status='enabled'
 AND public.store_today() BETWEEN c.start_date AND c.end_date AND public.store_today() BETWEEN b.start_date AND b.end_date
 AND b.start_date >= c.start_date+(b.week_number-1)*7 AND b.end_date <= least(c.end_date,c.start_date+b.week_number*7-1))
$$;
CREATE OR REPLACE FUNCTION public.store_file_access(_name text,_write boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN _write THEN public.store_file_access_previous(_name,true)
 ELSE EXISTS(SELECT 1 FROM public.store_banners b WHERE b.published_version->>'image_path'=_name AND public.store_banner_live(b.id))
 OR (public.store_file_access_previous(_name,false) AND NOT EXISTS(SELECT 1 FROM public.store_banners b WHERE b.image_path=_name AND b.published_version IS NOT NULL AND NOT public.store_can_access(b.store_id))) END
$$;
CREATE OR REPLACE FUNCTION public.store_live_banners() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'store_banner',true,'titulo',NULL,'subtitulo',NULL,'imagem_url','store-media:'||b.image_path,
 'data_inicio',to_char(b.start_date::timestamp AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'data_fim',to_char((b.end_date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'link',b.destination_url,'botao_texto',CASE WHEN b.destination_url<>'' THEN 'Saiba mais' ELSE NULL END,
 'duracao_segundos',10,'banner_format',b.format,'exibir_abertura',b.format='vertical','target_scope','all','planos_alvo',ARRAY['free'],
 'campaign_kind',CASE WHEN c.campaign_kind<>'legacy' THEN c.campaign_kind WHEN cardinality(c.states)+cardinality(c.cities)+cardinality(b.states)+cardinality(b.cities)>0 THEN 'regional' ELSE 'global' END)), '[]')
 FROM public.store_banners current
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.store_banners,coalesce(current.published_version,to_jsonb(current))) b
 JOIN public.store_contracts c ON c.id=b.contract_id
 WHERE public.store_banner_live(current.id)
 AND (cardinality(c.states)=0 AND cardinality(c.cities)=0 OR EXISTS(SELECT 1 FROM public.empresas e WHERE e.owner_id=auth.uid() AND
 (upper(e.estado)=ANY(c.states) OR EXISTS(SELECT 1 FROM unnest(c.cities) x WHERE public.store_city_key(e.cidade||'/'||e.estado)=public.store_city_key(x)))))
 AND (cardinality(b.states)=0 AND cardinality(b.cities)=0 OR EXISTS(SELECT 1 FROM public.empresas e WHERE e.owner_id=auth.uid() AND
 (upper(e.estado)=ANY(b.states) OR EXISTS(SELECT 1 FROM unnest(b.cities) x WHERE public.store_city_key(e.cidade||'/'||e.estado)=public.store_city_key(x)))))
$$;

CREATE OR REPLACE FUNCTION public.store_banner_event(_banner uuid,_click boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE b public.store_banners; metric text:=CASE WHEN _click THEN 'clicks' ELSE 'views' END;
BEGIN
 SELECT * INTO b FROM public.store_banners WHERE id=_banner FOR UPDATE;
 IF NOT public.store_banner_live(_banner) THEN RETURN; END IF;
 IF b.published_version IS NOT NULL THEN
  UPDATE public.store_banners SET published_version=jsonb_set(published_version,ARRAY[metric],to_jsonb(coalesce((published_version->>metric)::bigint,0)+1)) WHERE id=_banner;
  UPDATE public.store_banner_history SET snapshot=jsonb_set(snapshot,ARRAY[metric],to_jsonb(coalesce((b.published_version->>metric)::bigint,0)+1))
  WHERE banner_id=_banner AND action='replacement' AND snapshot->>'image_path'=b.published_version->>'image_path';
 ELSE UPDATE public.store_banners SET views=views+CASE WHEN _click THEN 0 ELSE 1 END,clicks=clicks+CASE WHEN _click THEN 1 ELSE 0 END WHERE id=_banner;
 END IF;
END $$;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.store_snapshot(uuid)'::regprocedure) INTO def;
 EXECUTE replace(def, 'CASE WHEN b.end_date<', 'CASE WHEN b.paused THEN ''paused'' WHEN b.end_date<');
END $$;
CREATE FUNCTION public.advertising_admin_list() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.store_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(row ORDER BY row->>'start_date' DESC),'[]') FROM (
 SELECT jsonb_build_object('source','legacy','id',b.id,'store_id',b.anunciante_id,'name',coalesce(s.nome,'Sem empresa'),'title',b.titulo,
 'image',b.imagem_url,'kind',CASE WHEN b.campaign_kind<>'legacy' THEN b.campaign_kind WHEN b.target_scope IN ('state','city') THEN 'regional' ELSE 'global' END,
 'region',concat_ws(' · ',b.target_scope,b.target_uf,b.target_city),'start_date',b.data_inicio,'end_date',b.data_fim,
 'status',CASE WHEN NOT b.ativo THEN 'paused' WHEN b.data_fim<now() THEN 'expired' WHEN b.data_inicio>now() THEN 'scheduled' ELSE 'published' END,
 'paused',NOT b.ativo,'format',b.banner_format,'views',b.views,'clicks',b.clicks) row
 FROM public.banners b LEFT JOIN public.banner_empresas s ON s.id=b.anunciante_id
 UNION ALL
 SELECT jsonb_build_object('source','store','id',b.id,'store_id',s.id,'name',s.nome,'title',c.name,
 'image','store-media:'||b.image_path,'kind',CASE WHEN c.campaign_kind<>'legacy' THEN c.campaign_kind WHEN cardinality(c.states)+cardinality(c.cities)+cardinality(b.states)+cardinality(b.cities)>0 THEN 'regional' ELSE 'global' END,
 'region',concat_ws(' · ',c.region,array_to_string(c.states,', '),array_to_string(c.cities,', '),array_to_string(b.states,', '),array_to_string(b.cities,', ')),
 'start_date',b.start_date,'end_date',b.end_date,'status',CASE WHEN b.paused OR c.status<>'enabled' OR s.status<>'active' THEN 'paused' WHEN b.end_date<public.store_today() THEN 'expired' WHEN NOT b.submitted THEN 'draft' WHEN b.approval='pending' THEN 'pending' WHEN b.approval='rejected' THEN 'rejected' WHEN public.store_banner_live(b.id) THEN 'published' ELSE 'scheduled' END,
 'paused',b.paused,'format',b.format,'views',b.views,'clicks',b.clicks)
 FROM public.store_banners b JOIN public.store_contracts c ON c.id=b.contract_id JOIN public.banner_empresas s ON s.id=b.store_id
 ) rows);
END $$;
REVOKE ALL ON FUNCTION public.advertising_admin_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.advertising_admin_list() TO authenticated;

CREATE INDEX advertising_requests_store_created ON public.advertising_requests(store_id,created_at DESC);
CREATE INDEX advertising_audit_created ON public.advertising_audit(created_at DESC);
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.store_save_contract(uuid,jsonb)'::regprocedure) INTO def;
 EXECUTE replace(def,'FUNCTION public.store_save_contract(', 'FUNCTION public.store_save_contract_previous(');
END $$;
REVOKE ALL ON FUNCTION public.store_save_contract_previous(uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.store_save_contract(_store uuid,_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cid uuid; kind text; c public.store_contracts;
BEGIN
 cid:=public.store_save_contract_previous(_store,_data);
 SELECT * INTO c FROM public.store_contracts WHERE id=cid;
 kind:=coalesce(_data->>'campaign_kind',c.campaign_kind);
 IF kind NOT IN ('legacy','regional','global') THEN RAISE EXCEPTION 'Tipo de campanha inválido'; END IF;
 IF kind='regional' AND cardinality(c.states)+cardinality(c.cities)=0 THEN RAISE EXCEPTION 'Informe as regiões autorizadas'; END IF;
 IF kind='global' AND (cardinality(c.states)+cardinality(c.cities)>0 OR EXISTS(SELECT 1 FROM public.store_banners WHERE contract_id=cid AND cardinality(states)+cardinality(cities)>0)) THEN RAISE EXCEPTION 'Contrato nacional não pode manter restrições regionais'; END IF;
 UPDATE public.store_contracts SET campaign_kind=kind WHERE id=cid;
 RETURN cid;
END $$;
COMMIT;
