-- Número da sorte único, estável e gerado pelo banco para empresas antigas e novas.
CREATE SEQUENCE IF NOT EXISTS public.empresa_numero_sorte_seq
  AS bigint
  START WITH 100000
  INCREMENT BY 1;

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS numero_sorte bigint;

ALTER TABLE public.empresas
  ALTER COLUMN numero_sorte SET DEFAULT nextval('public.empresa_numero_sorte_seq');

UPDATE public.empresas
SET numero_sorte = nextval('public.empresa_numero_sorte_seq')
WHERE numero_sorte IS NULL;

ALTER TABLE public.empresas
  ALTER COLUMN numero_sorte SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.empresas'::regclass
      AND conname = 'empresas_numero_sorte_key'
  ) THEN
    ALTER TABLE public.empresas
      ADD CONSTRAINT empresas_numero_sorte_key UNIQUE (numero_sorte);
  END IF;
END
$$;

GRANT USAGE, SELECT ON SEQUENCE public.empresa_numero_sorte_seq TO service_role;
