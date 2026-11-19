BEGIN;
ALTER TABLE public.materiais ADD COLUMN IF NOT EXISTS preco_anterior numeric(10,2);
CREATE OR REPLACE FUNCTION public.material_price_history_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.preco_anterior:=NULL;
 ELSIF NEW.preco IS DISTINCT FROM OLD.preco THEN
  IF NEW.preco IS NULL OR NEW.preco::text IN ('NaN','Infinity','-Infinity') OR NEW.preco<0 THEN
   RAISE EXCEPTION 'Preço inválido.';
  END IF;
  NEW.preco_anterior:=CASE WHEN NEW.preco<OLD.preco THEN OLD.preco ELSE NULL END;
 ELSE
  NEW.preco_anterior:=OLD.preco_anterior;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.material_price_history_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS material_price_history_guard ON public.materiais;
CREATE TRIGGER material_price_history_guard BEFORE INSERT OR UPDATE ON public.materiais
FOR EACH ROW EXECUTE FUNCTION public.material_price_history_guard();
CREATE OR REPLACE FUNCTION public.update_my_material_price(_material uuid,_price numeric,_expected_price numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE changed uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para alterar o preço.' USING ERRCODE='42501'; END IF;
 IF _price IS NULL OR _price::text IN ('NaN','Infinity','-Infinity') OR _price<0 OR _price>99999999.99 OR round(_price,2)<>_price THEN
  RAISE EXCEPTION 'Informe um preço válido com até duas casas decimais.';
 END IF;
 UPDATE public.materiais m SET preco=_price
 WHERE m.id=_material AND m.preco=_expected_price AND m.status IN ('ativo','pausado','expirado')
 AND EXISTS(SELECT 1 FROM public.empresas e WHERE e.id=m.empresa_id AND e.owner_id=auth.uid())
 RETURNING m.id INTO changed;
 IF changed IS NULL THEN RAISE EXCEPTION 'Anúncio indisponível ou preço alterado. Atualize o estoque e tente novamente.'; END IF;
 RETURN changed;
END; $$;
REVOKE ALL ON FUNCTION public.update_my_material_price(uuid,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_my_material_price(uuid,numeric,numeric) TO authenticated;
COMMIT;
