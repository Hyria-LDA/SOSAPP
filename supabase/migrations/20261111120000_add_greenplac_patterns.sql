-- Executar o conteúdo inteiro no SQL Editor do Supabase.
-- Acrescenta somente os três padrões solicitados; preserva IDs existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE
  fabricante uuid;
  padrao text;
  proxima_ordem integer;
BEGIN
  SELECT id INTO STRICT fabricante FROM public.fabricantes
  WHERE lower(btrim(nome)) = 'greenplac' FOR UPDATE;

  SELECT coalesce(max(ordem), 0) INTO proxima_ordem
  FROM public.padroes WHERE fabricante_id = fabricante;

  FOREACH padrao IN ARRAY ARRAY['Jade Legno', 'Azuro', 'Freijó Amazonas'] LOOP
    -- Reutiliza inclusive uma grafia sem acento ou com espaços extras.
    UPDATE public.padroes SET ativo = true
    WHERE fabricante_id = fabricante
      AND translate(lower(regexp_replace(btrim(nome), '\s+', ' ', 'g')),
        'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
        = translate(lower(padrao), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
    IF NOT FOUND THEN
      proxima_ordem := proxima_ordem + 1;
      INSERT INTO public.padroes(fabricante_id, nome, categoria, ordem, ativo)
      VALUES(fabricante, padrao, 'Geral', proxima_ordem, true);
    END IF;
  END LOOP;
END $$;
COMMIT;
