BEGIN;
ALTER TABLE public.banner_empresas
 ADD COLUMN IF NOT EXISTS whatsapp_phone text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS whatsapp_intro text NOT NULL DEFAULT 'Olá vim pelo app SOS MARCENEIROS',
 ADD COLUMN IF NOT EXISTS banner_format text NOT NULL DEFAULT 'horizontal' CHECK (banner_format IN ('horizontal','vertical'));
ALTER TABLE public.store_banners ADD COLUMN IF NOT EXISTS whatsapp_message text NOT NULL DEFAULT '';
-- Preserve the advertising history when its author login is removed.
ALTER TABLE public.store_banner_history DROP CONSTRAINT IF EXISTS store_banner_history_actor_id_fkey;
ALTER TABLE public.store_banner_history ADD CONSTRAINT store_banner_history_actor_id_fkey
 FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.store_urlencode(_value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $$
DECLARE bytes bytea:=convert_to(_value,'UTF8'); result text:=''; n integer; b integer;
BEGIN
 FOR n IN 0..length(bytes)-1 LOOP
  b:=get_byte(bytes,n);
  IF (b BETWEEN 65 AND 90) OR (b BETWEEN 97 AND 122) OR (b BETWEEN 48 AND 57) OR b IN (45,46,95,126)
  THEN result:=result||chr(b); ELSE result:=result||'%'||upper(lpad(to_hex(b),2,'0')); END IF;
 END LOOP;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.store_whatsapp_base(_phone text,_intro text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT 'https://wa.me/'||_phone||'?text='||public.store_urlencode(btrim(_intro)||' ')
$$;
CREATE OR REPLACE FUNCTION public.store_save_banner_settings(_store uuid,_phone text,_intro text,_format text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.store_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF _phone IS NULL OR _phone !~ '^[1-9][0-9]{7,14}$' OR _intro IS NULL OR length(btrim(_intro)) NOT BETWEEN 1 AND 300
 OR _format IS NULL OR _format NOT IN ('horizontal','vertical') THEN RAISE EXCEPTION 'Confira o WhatsApp, a mensagem inicial e a posição'; END IF;
 UPDATE public.banner_empresas SET whatsapp_phone=_phone,whatsapp_intro=btrim(_intro),banner_format=_format WHERE id=_store;
 IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
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
  bid := b.id;
  INSERT INTO public.store_banner_history(store_id,banner_id,actor_id,action,snapshot) VALUES(c.store_id,b.id,auth.uid(),'replacement',to_jsonb(b));
 END IF;
 UPDATE public.store_banners SET image_path=c.store_id::text||'/'||c.id::text||'/'||bid::text||'/'||gen_random_uuid()::text||'.'||_extension,
 views=0,clicks=0,whatsapp_message='',destination_url='',title='',start_date=wstart,end_date=wend,approval='pending',submitted=false,approved_at=NULL,rejection_reason=NULL,updated_at=now() WHERE id=bid RETURNING * INTO b;
 RETURN b;
END $$;

CREATE OR REPLACE FUNCTION public.store_submit_banner(_banner uuid,_title text,_url text,_format text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE b public.store_banners; c public.store_contracts; s public.banner_empresas; base_url text;
BEGIN
 SELECT * INTO b FROM public.store_banners WHERE id=_banner FOR UPDATE;
 IF b.id IS NULL OR NOT public.store_can_access(b.store_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT * INTO c FROM public.store_contracts WHERE id=b.contract_id;
 IF public.store_contract_status(c)<>'active' OR b.end_date<public.store_today() OR b.approval='approved' THEN RAISE EXCEPTION 'Envio indisponível'; END IF;
 IF _title IS NULL OR _url IS NULL OR _format IS NULL OR length(btrim(_title)) NOT BETWEEN 1 AND 120 OR length(_url)>2048 OR (_url<>'' AND _url !~ '^https://[^[:space:]]+$') THEN RAISE EXCEPTION 'Informe título e link HTTPS válido'; END IF;
 SELECT * INTO s FROM public.banner_empresas WHERE id=b.store_id;
 IF NOT public.store_is_admin() THEN
  IF s.whatsapp_phone='' THEN RAISE EXCEPTION 'Solicite ao administrador a configuração do WhatsApp'; END IF;
  base_url:=public.store_whatsapp_base(s.whatsapp_phone,s.whatsapp_intro);
  IF left(_url,length(base_url)) IS DISTINCT FROM base_url OR substring(_url FROM length(base_url)+1) !~ '^[A-Za-z0-9%._~-]*$'
   OR _format IS DISTINCT FROM s.banner_format THEN RAISE EXCEPTION 'Link ou posição não autorizados'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='store-media' AND name=b.image_path) THEN RAISE EXCEPTION 'Envie a imagem antes de finalizar'; END IF;
 UPDATE public.store_banners SET title=btrim(_title),destination_url=_url,format=_format,submitted=true,approval='pending',updated_at=now() WHERE id=_banner;
 INSERT INTO public.store_banner_history(store_id,banner_id,actor_id,action,snapshot) VALUES(b.store_id,b.id,auth.uid(),'submitted',to_jsonb(b));
END $$;


CREATE OR REPLACE FUNCTION public.store_submit_simple_banner(_banner uuid,_message text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE b public.store_banners; s public.banner_empresas; destination text;
BEGIN
 SELECT * INTO b FROM public.store_banners WHERE id=_banner FOR UPDATE;
 IF b.id IS NULL OR NOT public.store_can_access(b.store_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT * INTO s FROM public.banner_empresas WHERE id=b.store_id;
 IF s.whatsapp_phone='' THEN RAISE EXCEPTION 'Solicite ao administrador a configuração do WhatsApp'; END IF;
 IF _message IS NULL OR length(_message)>300 THEN RAISE EXCEPTION 'Use até 300 caracteres na mensagem'; END IF;
 destination:=public.store_whatsapp_base(s.whatsapp_phone,s.whatsapp_intro)||public.store_urlencode(btrim(_message));
 PERFORM public.store_submit_banner(b.id,'Banner da loja',destination,s.banner_format);
 UPDATE public.store_banners SET whatsapp_message=btrim(_message) WHERE id=b.id;
END $$;

-- Serialize counters with replacement so a concurrent event cannot leak old
-- version metrics into the new version after its counters are reset.
CREATE OR REPLACE FUNCTION public.store_banner_event(_banner uuid,_click boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.store_banners WHERE id=_banner FOR UPDATE;
 IF public.store_banner_live(_banner) THEN
  UPDATE public.store_banners SET views=views+CASE WHEN _click THEN 0 ELSE 1 END,
   clicks=clicks+CASE WHEN _click THEN 1 ELSE 0 END WHERE id=_banner;
 END IF;
END $$;

-- Service-only preparation: disable access/advertising before removing the Auth user.
CREATE OR REPLACE FUNCTION public.store_prepare_user_deletion(_store uuid,_actor uuid,_confirmation text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.banner_empresas; outside_files boolean;
BEGIN
 IF NOT public.has_role(_actor,'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT * INTO s FROM public.banner_empresas WHERE id=_store FOR UPDATE;
 IF s.user_id IS NULL THEN RAISE EXCEPTION 'Usuário da loja não encontrado'; END IF;
 IF _confirmation IS DISTINCT FROM s.login THEN RAISE EXCEPTION 'Digite o login da loja para confirmar'; END IF;
 IF s.user_id=_actor OR public.has_role(s.user_id,'admin')
  OR NOT public.has_role(s.user_id,'store_partner')
  OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=s.user_id AND role::text NOT IN ('store_partner','user'))
  OR EXISTS(SELECT 1 FROM public.empresas WHERE owner_id=s.user_id)
 THEN RAISE EXCEPTION 'Só é permitido excluir uma conta exclusiva de lojista'; END IF;
 -- Auth refuses to delete owners of Storage objects. Transfer only this store's
 -- private media to the requesting administrator; do not remove historical files.
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='storage.objects'::regclass AND attname='owner_id' AND NOT attisdropped) THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM storage.objects WHERE owner_id=$1 AND (bucket_id<>''store-media'' OR split_part(name,''/'',1)<>$2))'
   INTO outside_files USING s.user_id::text,s.id::text;
  IF outside_files THEN RAISE EXCEPTION 'A conta possui arquivos fora desta loja; revise antes de excluir'; END IF;
  EXECUTE 'UPDATE storage.objects SET owner_id=$1 WHERE owner_id=$2 AND bucket_id=''store-media'' AND split_part(name,''/'',1)=$3'
   USING _actor::text,s.user_id::text,s.id::text;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='storage.objects'::regclass AND attname='owner' AND NOT attisdropped) THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM storage.objects WHERE owner=$1 AND (bucket_id<>''store-media'' OR split_part(name,''/'',1)<>$2))'
   INTO outside_files USING s.user_id,s.id::text;
  IF outside_files THEN RAISE EXCEPTION 'A conta possui arquivos fora desta loja; revise antes de excluir'; END IF;
  EXECUTE 'UPDATE storage.objects SET owner=$1 WHERE owner=$2 AND bucket_id=''store-media'' AND split_part(name,''/'',1)=$3'
   USING _actor,s.user_id,s.id::text;
 END IF;
 UPDATE public.banner_empresas SET status='inactive' WHERE id=s.id;
 RETURN s.user_id;
END $$;
REVOKE ALL ON FUNCTION public.store_prepare_user_deletion(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_prepare_user_deletion(uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.store_save_banner_settings(uuid,text,text,text),public.store_submit_simple_banner(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_save_banner_settings(uuid,text,text,text),public.store_submit_simple_banner(uuid,text) TO authenticated;
COMMIT;
