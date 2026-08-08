-- Complementa padroes Duratex que ficaram fora da primeira expansao.
-- Mantem INSERT idempotente: se o padrao ja existir, apenas reativa e ajusta a categoria.

DO $$
DECLARE
  v_fab uuid;
  v_ord integer := 900;
  item text;
BEGIN
  SELECT id INTO v_fab
  FROM public.fabricantes
  WHERE nome = 'Duratex';

  IF v_fab IS NULL THEN
    RETURN;
  END IF;

  FOREACH item IN ARRAY ARRAY[
    'Mint',
    'Carvalho Dian',
    'Cinza Fossil',
    'Cinza Fossil - Linha Recanto',
    'Off-White Suave',
    'Branco Diamante - Linha Cristallo'
  ] LOOP
    v_ord := v_ord + 1;

    INSERT INTO public.padroes (fabricante_id, nome, categoria, ordem, ativo)
    VALUES (v_fab, item, 'Catalogo Duratex complementar', v_ord, true)
    ON CONFLICT (fabricante_id, nome) DO UPDATE
    SET
      categoria = EXCLUDED.categoria,
      ordem = EXCLUDED.ordem,
      ativo = true;
  END LOOP;
END $$;
