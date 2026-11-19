BEGIN;
ALTER TABLE public.material_rejections ADD COLUMN IF NOT EXISTS snapshot jsonb;
-- Capture only ad details needed by moderation before the original ad is deleted.
CREATE OR REPLACE FUNCTION public.capture_rejected_material_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 SELECT jsonb_build_object(
   'padrao',m.padrao,'fabricante',m.fabricante,'observacoes',m.observacoes,
   'comprimento_cm',m.comprimento_cm,'largura_cm',m.largura_cm,'espessura_mm',m.espessura_mm,
   'published_at',m.created_at,
   'empresa',jsonb_build_object('id',e.id,'nome_empresa',e.nome_empresa,'cidade',e.cidade,'estado',e.estado)
 ) INTO NEW.snapshot FROM public.materiais m JOIN public.empresas e ON e.id=m.empresa_id
 WHERE m.id=NEW.material_id;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.capture_rejected_material_snapshot() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS capture_rejected_material_snapshot ON public.material_rejections;
CREATE TRIGGER capture_rejected_material_snapshot BEFORE INSERT ON public.material_rejections
FOR EACH ROW EXECUTE FUNCTION public.capture_rejected_material_snapshot();
CREATE INDEX IF NOT EXISTS material_rejections_created_id_idx ON public.material_rejections(created_at DESC,material_id DESC);

CREATE OR REPLACE FUNCTION public.admin_rejected_material_history(
 _states text[] DEFAULT NULL,_cities text[] DEFAULT NULL,_company uuid DEFAULT NULL,
 _before_time timestamptz DEFAULT NULL,_before_id uuid DEFAULT NULL,_limit integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_role(auth.uid(),'admin'),false) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 WITH history AS (
  SELECT r.material_id AS id,r.empresa_id,r.created_at,r.reason,r.snapshot,
   coalesce(r.snapshot->'empresa',jsonb_build_object('id',r.empresa_id,'nome_empresa',e.nome_empresa,'cidade',e.cidade,'estado',e.estado)) AS empresa
  FROM public.material_rejections r LEFT JOIN public.empresas e ON e.id=r.empresa_id
 ), filtered AS (
  SELECT * FROM history WHERE (_company IS NULL OR empresa_id=_company)
   AND (_states IS NULL OR empresa->>'estado'=ANY(_states))
   AND (_cities IS NULL OR empresa->>'cidade'=ANY(_cities))
 ), page AS (
  SELECT * FROM filtered WHERE _before_time IS NULL OR (created_at,id)<(_before_time,_before_id)
  ORDER BY created_at DESC,id DESC LIMIT greatest(0,least(coalesce(_limit,20),21))
 ) SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),
   'rows',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id DESC) FROM page),'[]'::jsonb)) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.admin_rejected_material_history(text[],text[],uuid,timestamptz,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_rejected_material_history(text[],text[],uuid,timestamptz,uuid,integer) TO authenticated;
COMMIT;
