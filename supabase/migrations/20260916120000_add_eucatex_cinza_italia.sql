-- Padrão MDF Eucatex da linha Lacca AD. Não altera anúncios existentes.
DO $$
DECLARE
  v_fabricante_id uuid;
  v_padrao_id uuid;
  v_ordem integer;
BEGIN
  SELECT id INTO v_fabricante_id
  FROM public.fabricantes
  WHERE lower(btrim(nome)) = 'eucatex'
  LIMIT 1;

  IF v_fabricante_id IS NULL THEN
    RAISE EXCEPTION 'Fabricante Eucatex não encontrado';
  END IF;

  SELECT id INTO v_padrao_id
  FROM public.padroes
  WHERE fabricante_id = v_fabricante_id
    AND lower(btrim(nome)) IN ('cinza itália', 'cinza italia')
  LIMIT 1;

  IF v_padrao_id IS NOT NULL THEN
    UPDATE public.padroes
    SET ativo = true
    WHERE id = v_padrao_id AND ativo IS DISTINCT FROM true;
  ELSE
    SELECT COALESCE(MAX(ordem), 0) + 1 INTO v_ordem
    FROM public.padroes
    WHERE fabricante_id = v_fabricante_id;

    INSERT INTO public.padroes (fabricante_id, nome, categoria, ordem, ativo)
    VALUES (v_fabricante_id, 'Cinza Itália', 'Lacca AD', v_ordem, true)
    ON CONFLICT (fabricante_id, nome) DO NOTHING;
  END IF;
END;
$$;
