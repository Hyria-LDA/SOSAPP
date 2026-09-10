-- Adiciona padroes confirmados nos catalogos oficiais e ausentes no catalogo
-- exportado do Supabase em 10/09/2026.
--
-- A migracao e idempotente: nao exclui registros, nao altera IDs existentes e
-- nao duplica um nome que ja exista para o mesmo fabricante.

DO $$
DECLARE
  v_grupo jsonb;
  v_padrao text;
  v_fabricante_id uuid;
  v_proxima_ordem integer;
  v_inseridos integer := 0;
  v_total_inseridos integer := 0;
  v_dados jsonb := $catalogo$
  [
    {
      "fabricante": "Greenplac",
      "categoria": "Lancamentos 2026",
      "padroes": [
        "Ária",
        "Greige",
        "Carvalho Avenna",
        "Giardino",
        "Vitra",
        "Freijó Nacional",
        "Nogueira Romani",
        "Lago",
        "Carvalho Catedral",
        "Moccato",
        "Arenza",
        "Plié"
      ]
    },
    {
      "fabricante": "Eucatex",
      "categoria": "Origens Nativas",
      "padroes": [
        "Amêndoa Natural",
        "Nogueira Terracota",
        "Cumaru Nativo",
        "Itaparica",
        "Nevada",
        "Carvalho Tropical",
        "Madero Cinza",
        "Madero Cacau",
        "Cacau Natural",
        "Cinza Urbano",
        "Cinza Supremo",
        "Verde Mar",
        "Pétala Rosa"
      ]
    },
    {
      "fabricante": "Placas do Brasil",
      "categoria": "Colecao Botanica 2026",
      "padroes": [
        "Alocásia",
        "Tauari Solar",
        "Azul Atlântico",
        "Ipê Dourado",
        "Carvalho Angra",
        "Carvalho Costeiro"
      ]
    },
    {
      "fabricante": "Berneck",
      "categoria": "Catalogo atual",
      "padroes": [
        "Amantea",
        "Barrique",
        "Branco Vel",
        "Branco Design",
        "Carvalho Treviso",
        "Chiaro",
        "Cinamomo",
        "Faia",
        "Frassino Almendra",
        "Galiano",
        "Gengibre",
        "Griseo",
        "Nogal Sevilha",
        "Peroba",
        "Provence",
        "Roble Catedral",
        "Carvalho Japandi",
        "Branco Micro",
        "Nogal Artezzano",
        "Super White"
      ]
    },
    {
      "fabricante": "Duratex",
      "categoria": "Colecao Recanto 2026",
      "padroes": [
        "Carvalho Brun",
        "Timborana Silvestre",
        "Bege Papiro",
        "Marrom Retrô",
        "Hibisco"
      ]
    }
  ]
  $catalogo$::jsonb;
BEGIN
  FOR v_grupo IN
    SELECT value
    FROM jsonb_array_elements(v_dados)
  LOOP
    SELECT id
      INTO v_fabricante_id
    FROM public.fabricantes
    WHERE lower(nome) = lower(v_grupo->>'fabricante')
    LIMIT 1;

    IF v_fabricante_id IS NULL THEN
      RAISE EXCEPTION 'Fabricante % nao encontrado', v_grupo->>'fabricante';
    END IF;

    SELECT COALESCE(MAX(ordem), 0)
      INTO v_proxima_ordem
    FROM public.padroes
    WHERE fabricante_id = v_fabricante_id;

    FOR v_padrao IN
      SELECT value
      FROM jsonb_array_elements_text(v_grupo->'padroes')
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.padroes
        WHERE fabricante_id = v_fabricante_id
          AND lower(btrim(nome)) = lower(btrim(v_padrao))
      ) THEN
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
          v_grupo->>'categoria',
          v_proxima_ordem,
          true
        )
        ON CONFLICT (fabricante_id, nome) DO NOTHING;

        GET DIAGNOSTICS v_inseridos = ROW_COUNT;
        v_total_inseridos := v_total_inseridos + v_inseridos;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE '% novos padroes inseridos', v_total_inseridos;
END;
$$;

-- Conferencia opcional depois da execucao:
-- SELECT f.nome AS fabricante, p.categoria, count(*) AS quantidade
-- FROM public.padroes p
-- JOIN public.fabricantes f ON f.id = p.fabricante_id
-- WHERE p.categoria IN (
--   'Lancamentos 2026',
--   'Origens Nativas',
--   'Colecao Botanica 2026',
--   'Catalogo atual',
--   'Colecao Recanto 2026'
-- )
-- GROUP BY f.nome, p.categoria
-- ORDER BY f.nome, p.categoria;
