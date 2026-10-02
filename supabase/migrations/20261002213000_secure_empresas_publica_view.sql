BEGIN;
-- O aplicativo consulta empresa_publica(uuid), não a listagem empresas_publica.
-- Mantém a view para preservar dependências, mas fecha seu acesso direto pela API.
-- Não amplia privilégios nem políticas da tabela empresas.
DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='empresas_publica' AND c.relkind='v'
 ) THEN
   ALTER VIEW public.empresas_publica SET (security_invoker = true);
   REVOKE ALL ON public.empresas_publica FROM PUBLIC, anon, authenticated;
 END IF;
END $$;
COMMIT;
