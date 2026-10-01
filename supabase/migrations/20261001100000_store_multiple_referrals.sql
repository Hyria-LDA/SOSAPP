BEGIN;
-- Links adicionais; o link principal existente continua em banner_empresas.partner_id.
CREATE TABLE public.store_referral_links (
 partner_id uuid PRIMARY KEY REFERENCES public.vendedores_parceiros(id),
 store_id uuid NOT NULL REFERENCES public.banner_empresas(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX store_referral_links_store_idx ON public.store_referral_links(store_id);
ALTER TABLE public.store_referral_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_referral_links FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.store_referral_links TO authenticated;
GRANT ALL ON public.store_referral_links TO service_role;
CREATE POLICY store_referral_read ON public.store_referral_links FOR SELECT TO authenticated USING(public.store_can_access(store_id));

CREATE FUNCTION public.store_link_referral(_store uuid,_code text,_remove boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pid uuid; owner_id uuid;
BEGIN
 IF NOT public.store_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.banner_empresas WHERE id=_store AND user_id IS NOT NULL) THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
 SELECT id INTO pid FROM public.vendedores_parceiros WHERE upper(codigo)=upper(btrim(_code)) FOR UPDATE;
 IF pid IS NULL THEN RAISE EXCEPTION 'Código não encontrado. Use o código de um link já cadastrado em Vendedores Parceiros.'; END IF;
 SELECT id INTO owner_id FROM public.banner_empresas WHERE partner_id=pid;
 IF owner_id IS NOT NULL THEN
   IF owner_id<>_store THEN RAISE EXCEPTION 'Este link já pertence a outra loja'; END IF;
   IF _remove THEN RAISE EXCEPTION 'O link principal não pode ser desvinculado'; END IF;
   RETURN;
 END IF;
 IF _remove THEN DELETE FROM public.store_referral_links WHERE store_id=_store AND partner_id=pid; RETURN; END IF;
 SELECT store_id INTO owner_id FROM public.store_referral_links WHERE partner_id=pid;
 IF owner_id IS NOT NULL AND owner_id<>_store THEN RAISE EXCEPTION 'Este link já pertence a outra loja'; END IF;
 INSERT INTO public.store_referral_links(store_id,partner_id) VALUES(_store,pid) ON CONFLICT(partner_id) DO NOTHING;
END $$;

CREATE FUNCTION public.store_referrals(_store uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.store_can_access(_store) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'code',p.codigo,'name',p.nome,'primary',p.id=s.partner_id) ORDER BY (p.id=s.partner_id) DESC,p.codigo)
 FROM public.banner_empresas s JOIN public.vendedores_parceiros p ON p.id=s.partner_id OR EXISTS(SELECT 1 FROM public.store_referral_links l WHERE l.store_id=s.id AND l.partner_id=p.id)
 WHERE s.id=_store),'[]');
END $$;

CREATE OR REPLACE FUNCTION public.store_referral_metrics(_store uuid,_partner uuid DEFAULT NULL,_from date DEFAULT NULL,_to date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pids uuid[]; result jsonb;
BEGIN
 IF NOT public.store_can_access(_store) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT array_agg(id) INTO pids FROM (
   SELECT partner_id AS id FROM public.banner_empresas WHERE id=_store AND partner_id IS NOT NULL
   UNION SELECT partner_id FROM public.store_referral_links WHERE store_id=_store
 ) links;
 IF _partner IS NOT NULL THEN
   IF NOT coalesce(_partner=ANY(pids),false) THEN RAISE EXCEPTION 'Link não pertence a esta loja'; END IF;
   pids:=ARRAY[_partner];
 END IF;
 WITH origins AS (
  SELECT empresa_id,min(created_at) AS created_at FROM (
   SELECT empresa_id,created_at FROM public.cadastro_origens WHERE vendedor_id=ANY(pids)
   UNION ALL SELECT empresa_id,created_at FROM public.indicacoes WHERE vendedor_id=ANY(pids)
  ) a GROUP BY empresa_id
 ), registrations AS (
  SELECT o.*,e.onboarded FROM origins o JOIN public.empresas e ON e.id=o.empresa_id
  WHERE (_from IS NULL OR (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date>=_from) AND (_to IS NULL OR (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date<=_to)
 ), clicks AS (
  SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day FROM public.vendedor_cliques
  WHERE vendedor_id=ANY(pids) AND (_from IS NULL OR (created_at AT TIME ZONE 'America/Sao_Paulo')::date>=_from) AND (_to IS NULL OR (created_at AT TIME ZONE 'America/Sao_Paulo')::date<=_to)
 )
 SELECT jsonb_build_object(
 'clicks',(SELECT count(*) FROM clicks),'today',(SELECT count(*) FROM clicks WHERE day=public.store_today()),
 'last7',(SELECT count(*) FROM clicks WHERE day>=public.store_today()-6),'last30',(SELECT count(*) FROM clicks WHERE day>=public.store_today()-29),
 'registrations',(SELECT count(*) FROM registrations),'completed',(SELECT count(*) FROM registrations WHERE onboarded),
 'publishers',(SELECT count(*) FROM registrations r WHERE EXISTS(SELECT 1 FROM public.materiais m WHERE m.empresa_id=r.empresa_id)),
 'subscriptions',(SELECT count(DISTINCT i.empresa_id) FROM public.indicacoes i WHERE i.vendedor_id=ANY(pids) AND i.primeira_conversao_em IS NOT NULL AND (_from IS NULL OR (i.primeira_conversao_em AT TIME ZONE 'America/Sao_Paulo')::date>=_from) AND (_to IS NULL OR (i.primeira_conversao_em AT TIME ZONE 'America/Sao_Paulo')::date<=_to)),
 'daily',(SELECT jsonb_agg(jsonb_build_object('date',d::date,'clicks',(SELECT count(*) FROM clicks WHERE day=d::date),'registrations',(SELECT count(*) FROM registrations WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date=d::date)) ORDER BY d) FROM generate_series(public.store_today()-29,public.store_today(),interval '1 day') d)
 ) INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.store_metrics(_store uuid,_from date DEFAULT NULL,_to date DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.store_referral_metrics(_store,NULL,_from,_to)
$$;
REVOKE ALL ON FUNCTION public.store_link_referral(uuid,text,boolean),public.store_referrals(uuid),public.store_referral_metrics(uuid,uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_link_referral(uuid,text,boolean),public.store_referrals(uuid),public.store_referral_metrics(uuid,uuid,date,date) TO authenticated;
COMMIT;
