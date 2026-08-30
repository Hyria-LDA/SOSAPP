-- Exibe claramente os padroes da Linha Cristallo nos seletores usados para
-- anunciar sobras e procurar materiais. O sufixo evita confundir acabamentos
-- de mesmo nome existentes em outras linhas da Duratex.

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
    'Branco Diamante - Cristallo',
    'Cinza Sagrado - Cristallo',
    'Croma - Cristallo',
    'Gianduia - Cristallo',
    'Noturno - Cristallo',
    'Opala - Cristallo',
    'Pau Ferro Natural - Cristallo',
    'Preto - Cristallo',
    'Titânio - Cristallo',
    'Ultramarino - Cristallo'
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
      'Linha Cristallo',
      v_proxima_ordem,
      true
    )
    ON CONFLICT (fabricante_id, nome) DO UPDATE
    SET categoria = EXCLUDED.categoria,
        ativo = true;
  END LOOP;
END;
$$;

