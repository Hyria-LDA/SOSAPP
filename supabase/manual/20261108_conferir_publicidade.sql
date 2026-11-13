-- Somente leitura: executar ANTES da migração e guardar o resultado.
-- Não inclui senhas, tokens, imagens ou dados pessoais dos anunciantes.
SELECT jsonb_build_object(
 'anunciantes',(SELECT count(*) FROM public.banner_empresas),
 'logins_vinculados',(SELECT count(*) FROM public.banner_empresas WHERE user_id IS NOT NULL),
 'banners_antigos',(SELECT count(*) FROM public.banners),
 'contratos',(SELECT count(*) FROM public.store_contracts),
 'banners_portal',(SELECT count(*) FROM public.store_banners),
 'historico',(SELECT count(*) FROM public.store_banner_history),
 'buckets',(SELECT jsonb_agg(jsonb_build_object('id',id,'public',public,'limite',file_size_limit,'formatos',allowed_mime_types)) FROM storage.buckets WHERE id IN ('banners','store-media')),
 'politicas',(SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT schemaname,tablename,policyname,cmd,qual,with_check FROM pg_policies WHERE (schemaname='public' AND tablename IN ('banners','banner_empresas','store_banners','store_contracts','store_banner_history')) OR (schemaname='storage' AND tablename='objects')) p),
 'funcoes',(SELECT jsonb_agg(jsonb_build_object('nome',p.oid::regprocedure::text,'definicao',pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('store_reserve_banner','store_review_banner','store_file_access','store_banner_live','store_live_banners','store_snapshot','store_banner_event','store_save_contract'))
) AS conferencia;
