-- Adiciona padroes Duratex solicitados para os seletores de materiais.
-- Pode ser executada novamente sem criar registros duplicados.

DO $$
DECLARE
  v_fabricante_id uuid;
  v_proxima_ordem integer;
  v_padrao text;
BEGIN
  SELECT id
    INTO v_fabricante_id
  FROM public.fabricantes
  WHERE lower(nome) = lower('Duratex')
  LIMIT 1;

  IF v_fabricante_id IS NULL THEN
    RAISE EXCEPTION 'Fabricante Duratex nao encontrada';
  END IF;

  SELECT COALESCE(MAX(ordem), 0)
    INTO v_proxima_ordem
  FROM public.padroes
  WHERE fabricante_id = v_fabricante_id;

  FOREACH v_padrao IN ARRAY ARRAY[
    'Gianduia Puro',
    'Sense'
  ] LOOP
    v_proxima_ordem := v_proxima_ordem + 1;

    INSERT INTO public.padroes (
      fabricante_id,
      nome,
      categoria,
      ordem,
      ativo
    )
    VALUES (
      v_fabricante_id,
      v_padrao,
      'Madeirados',
      v_proxima_ordem,
      true
    )
    ON CONFLICT (fabricante_id, nome) DO UPDATE
    SET
      categoria = EXCLUDED.categoria,
      ativo = true;
  END LOOP;
END $$;
