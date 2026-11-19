BEGIN;
CREATE TABLE IF NOT EXISTS public.material_rejections (
 material_id uuid PRIMARY KEY, empresa_id uuid NOT NULL,
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reason text NOT NULL, photos jsonb NOT NULL DEFAULT '[]',
 cleanup_pending boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.material_rejections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.material_rejections FROM anon,authenticated;
GRANT ALL ON public.material_rejections TO service_role;
CREATE OR REPLACE FUNCTION public.reject_material_with_reason(_actor uuid,_material uuid,_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE mat public.materiais%ROWTYPE; owner uuid; photos jsonb; previous public.material_rejections%ROWTYPE;
BEGIN
 IF _actor IS NULL OR NOT coalesce(public.has_role(_actor,'admin'),false) THEN RAISE EXCEPTION 'forbidden'; END IF;
 _reason:=btrim(coalesce(_reason,''));
 IF char_length(_reason)<3 OR char_length(_reason)>1000 THEN RAISE EXCEPTION 'invalid_reason'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_material::text,918));
 SELECT * INTO previous FROM public.material_rejections WHERE material_id=_material;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'empresa_id',previous.empresa_id,'photos',previous.photos,'cleanup_pending',previous.cleanup_pending); END IF;
 SELECT * INTO mat FROM public.materiais WHERE id=_material FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'material_not_found'; END IF;
 SELECT owner_id INTO owner FROM public.empresas WHERE id=mat.empresa_id;
 IF owner IS NULL THEN RAISE EXCEPTION 'owner_not_found'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('url',url,'thumbnail_url',thumbnail_url)),'[]') INTO photos FROM public.fotos_materiais WHERE material_id=_material;
 INSERT INTO public.material_rejections(material_id,empresa_id,actor_id,reason,photos)
 VALUES(_material,mat.empresa_id,_actor,_reason,photos);
 DELETE FROM public.materiais WHERE id=_material;
 -- No FK to the deleted ad: the explanation must survive cascades and have no broken link.
 INSERT INTO public.notificacoes(user_id,tipo,titulo,mensagem)
 VALUES(owner,'anuncio_excluido','Seu anúncio foi excluído',
 'Seu anúncio "'||coalesce(nullif(mat.padrao,''),'Sobra anunciada')||'" foi excluído pela administração. Motivo: '||_reason);
 RETURN jsonb_build_object('ok',true,'empresa_id',mat.empresa_id,'photos',photos,'cleanup_pending',true);
END; $$;
REVOKE ALL ON FUNCTION public.reject_material_with_reason(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reject_material_with_reason(uuid,uuid,text) TO service_role;
COMMIT;
