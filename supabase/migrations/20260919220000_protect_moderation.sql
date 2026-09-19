-- ETAPA 3: executar o arquivo inteiro no SQL Editor do Supabase.
-- Alterações aditivas e transacionais; não apagam anúncios, fotos ou contas.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Interrompe sem alterações se a estrutura mínima não estiver disponível.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.fotos_materiais'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'storage.objects'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'RLS precisa estar habilitada em fotos_materiais e storage.objects.';
  END IF;
  PERFORM id, empresa_id, status FROM public.materiais LIMIT 0;
  PERFORM id, owner_id, status, pontos_penalidade, advertencias, suspensa_ate
    FROM public.empresas LIMIT 0;
  PERFORM id, material_id, empresa_id, url, thumbnail_url, ai_status, ai_score,
    ai_reason, ai_provider, ai_category, reviewed_at, reviewed_by, needs_ai_analysis
    FROM public.fotos_materiais LIMIT 0;
  PERFORM public.has_role(auth.uid(), 'admin');
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'materiais' AND public = false) THEN
    RAISE EXCEPTION 'O bucket materiais precisa existir e ser privado. Validar a configuração antes de aplicar esta etapa.';
  END IF;
END;
$$;

-- Consulta somente o papel do solicitante. Não amplia a permissão da função
-- has_role para visitantes, que pode estar explicitamente revogada no projeto.
CREATE OR REPLACE FUNCTION public.sos_moderation_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT COALESCE(public.has_role(auth.uid(), 'admin'), false); $$;
REVOKE ALL ON FUNCTION public.sos_moderation_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sos_moderation_is_admin() TO authenticated, anon, service_role;

-- SECURITY INVOKER é intencional: o contexto privilegiado de RPCs/triggers
-- internos é preservado, mas uma gravação direta de authenticated não é elevada.
CREATE OR REPLACE FUNCTION public.sos_guard_material_moderation()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $$
DECLARE
  is_admin boolean := public.sos_moderation_is_admin();
  trusted_execution boolean := current_user IN ('postgres', 'service_role', 'supabase_admin');
  company_status public.empresa_status;
BEGIN
  -- A renovação oficial é SECURITY DEFINER: ainda deve respeitar o bloqueio
  -- da empresa quando é solicitada por um usuário comum.
  IF auth.uid() IS NOT NULL AND NOT is_admin AND NEW.status = 'ativo' THEN
    SELECT status INTO company_status FROM public.empresas WHERE id = NEW.empresa_id;
    IF company_status IN ('suspensa', 'bloqueada') THEN
      RAISE EXCEPTION 'Empresa suspensa ou bloqueada não pode publicar ou reativar anúncios.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF trusted_execution OR is_admin THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
      RAISE EXCEPTION 'Não é permitido transferir a identidade do anúncio.' USING ERRCODE = '42501';
    END IF;
    IF OLD.status IN ('suspenso', 'em_revisao') THEN
      RAISE EXCEPTION 'Anúncio sob moderação: solicite a revisão da administração.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status IN ('suspenso', 'em_revisao') THEN
    RAISE EXCEPTION 'Somente a administração pode definir o estado de moderação.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sos_guard_company_moderation()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR public.sos_moderation_is_admin() THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.pontos_penalidade := 0;
    NEW.advertencias := 0;
    NEW.suspensa_ate := NULL;
    IF NEW.status IN ('suspensa', 'bloqueada') THEN
      RAISE EXCEPTION 'Estado de moderação reservado à administração.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'Não é permitido transferir a identidade da empresa.' USING ERRCODE = '42501';
    END IF;
    IF (NEW.status IS DISTINCT FROM OLD.status AND
        (OLD.status IN ('suspensa', 'bloqueada') OR NEW.status IN ('suspensa', 'bloqueada')))
       OR NEW.pontos_penalidade IS DISTINCT FROM OLD.pontos_penalidade
       OR NEW.advertencias IS DISTINCT FROM OLD.advertencias
       OR NEW.suspensa_ate IS DISTINCT FROM OLD.suspensa_ate THEN
      RAISE EXCEPTION 'Somente a administração pode alterar as penalidades da empresa.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sos_guard_photo_moderation()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $$
DECLARE
  material_company uuid;
  material_state public.material_status;
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR public.sos_moderation_is_admin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.ai_status = 'rejected' THEN
      RAISE EXCEPTION 'Foto rejeitada: solicite revisão ou exclua o anúncio pelo aplicativo.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  SELECT empresa_id, status INTO material_company, material_state
    FROM public.materiais WHERE id = NEW.material_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anúncio indisponível.' USING ERRCODE = '42501';
  END IF;
  IF material_state IN ('suspenso', 'em_revisao') THEN
    RAISE EXCEPTION 'Não é permitido alterar fotos de um anúncio sob moderação.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Não aceitar aprovação ou identidade de empresa fornecida pelo cliente.
    NEW.empresa_id := material_company;
    NEW.ai_status := 'pending';
    NEW.ai_score := NULL;
    NEW.ai_reason := NULL;
    NEW.ai_provider := NULL;
    NEW.ai_category := NULL;
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.needs_ai_analysis := true;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.material_id IS DISTINCT FROM OLD.material_id
       OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.url IS DISTINCT FROM OLD.url
       OR NEW.thumbnail_url IS DISTINCT FROM OLD.thumbnail_url
       OR NEW.ai_status IS DISTINCT FROM OLD.ai_status
       OR NEW.ai_score IS DISTINCT FROM OLD.ai_score
       OR NEW.ai_reason IS DISTINCT FROM OLD.ai_reason
       OR NEW.ai_provider IS DISTINCT FROM OLD.ai_provider
       OR NEW.ai_category IS DISTINCT FROM OLD.ai_category
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.needs_ai_analysis IS DISTINCT FROM OLD.needs_ai_analysis THEN
      RAISE EXCEPTION 'Não é permitido alterar a decisão ou substituir o arquivo de uma foto existente.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sos_guard_material_moderation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sos_guard_company_moderation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sos_guard_photo_moderation() FROM PUBLIC;

DROP TRIGGER IF EXISTS sos_guard_material_moderation ON public.materiais;
CREATE TRIGGER sos_guard_material_moderation BEFORE INSERT OR UPDATE ON public.materiais
FOR EACH ROW EXECUTE FUNCTION public.sos_guard_material_moderation();
DROP TRIGGER IF EXISTS sos_guard_company_moderation ON public.empresas;
CREATE TRIGGER sos_guard_company_moderation BEFORE INSERT OR UPDATE ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.sos_guard_company_moderation();
DROP TRIGGER IF EXISTS sos_guard_photo_moderation ON public.fotos_materiais;
CREATE TRIGGER sos_guard_photo_moderation BEFORE INSERT OR UPDATE OR DELETE ON public.fotos_materiais
FOR EACH ROW EXECUTE FUNCTION public.sos_guard_photo_moderation();

-- Restritiva: não amplia permissões existentes, mesmo quando há uma policy FOR ALL.
-- Donos ainda veem suas fotos para acompanhamento; terceiros não veem rejeitadas.
DROP POLICY IF EXISTS "sos moderation photo visibility" ON public.fotos_materiais;
CREATE POLICY "sos moderation photo visibility" ON public.fotos_materiais
AS RESTRICTIVE FOR SELECT TO authenticated, anon
USING (
  ai_status <> 'rejected'
  OR public.sos_moderation_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.materiais m JOIN public.empresas e ON e.id = m.empresa_id
    WHERE m.id = fotos_materiais.material_id AND e.owner_id = auth.uid()
  )
);

-- A consulta precisa ver registros rejeitados apesar do RLS das fotos. Retorna
-- somente uma decisão de acesso, não metadados. Nomes são comparados literalmente.
CREATE OR REPLACE FUNCTION public.sos_moderation_allows_storage_read(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.sos_moderation_is_admin() OR NOT EXISTS (
    SELECT 1
    FROM public.fotos_materiais f
    JOIN public.materiais m ON m.id = f.material_id
    JOIN public.empresas e ON e.id = m.empresa_id
    WHERE f.ai_status = 'rejected'
      AND e.owner_id IS DISTINCT FROM auth.uid()
      AND (
        f.url = _name OR f.thumbnail_url = _name
        OR right(split_part(f.url, '?', 1), length('/materiais/' || _name)) = '/materiais/' || _name
        OR right(split_part(f.thumbnail_url, '?', 1), length('/materiais/' || _name)) = '/materiais/' || _name
      )
  );
$$;
REVOKE ALL ON FUNCTION public.sos_moderation_allows_storage_read(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sos_moderation_allows_storage_read(text) TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "sos moderation storage visibility" ON storage.objects;
CREATE POLICY "sos moderation storage visibility" ON storage.objects
AS RESTRICTIVE FOR SELECT TO authenticated, anon
USING (bucket_id <> 'materiais' OR public.sos_moderation_allows_storage_read(name));

-- A policy antiga de storage só libera material ativo ou arquivo próprio.
-- O administrador precisa inspecionar também fotos de anúncios suspensos.
DROP POLICY IF EXISTS "sos moderation admin storage read" ON storage.objects;
CREATE POLICY "sos moderation admin storage read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'materiais' AND public.sos_moderation_is_admin());

COMMIT;
