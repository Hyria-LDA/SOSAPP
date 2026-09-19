-- SOMENTE PARA REVERTER A ETAPA 3 SE NECESSÁRIO.
-- Não executar junto com o SQL de instalação.
-- Remove estas proteções e restaura as permissões anteriores, inclusive suas brechas.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DROP POLICY IF EXISTS "sos moderation admin storage read" ON storage.objects;
DROP POLICY IF EXISTS "sos moderation storage visibility" ON storage.objects;
DROP POLICY IF EXISTS "sos moderation photo visibility" ON public.fotos_materiais;
DROP TRIGGER IF EXISTS sos_guard_material_moderation ON public.materiais;
DROP TRIGGER IF EXISTS sos_guard_company_moderation ON public.empresas;
DROP TRIGGER IF EXISTS sos_guard_photo_moderation ON public.fotos_materiais;
DROP FUNCTION IF EXISTS public.sos_guard_material_moderation();
DROP FUNCTION IF EXISTS public.sos_guard_company_moderation();
DROP FUNCTION IF EXISTS public.sos_guard_photo_moderation();
DROP FUNCTION IF EXISTS public.sos_moderation_allows_storage_read(text);
DROP FUNCTION IF EXISTS public.sos_moderation_is_admin();
COMMIT;
