-- Completa o catalogo Duratex com os padroes conferidos no PDF
-- "Duratex - Cores de MDF por Linha" (julho/2026).
-- Os nomes repetidos entre linhas sao mantidos como um unico padrao no aplicativo.

DO $$
DECLARE
  v_fabricante_id uuid;
  v_proxima_ordem integer;
  v_grupo jsonb;
  v_padrao text;
  v_dados jsonb := $catalogo$[
    {
      "categoria": "Linha Conceito",
      "itens": [
        "Arenito",
        "Basalto",
        "Eclipse",
        "Gobi",
        "Hong Kong",
        "Lana",
        "Lunar",
        "Tramato"
      ]
    },
    {
      "categoria": "Linha Cristallo",
      "itens": [
        "Branco Diamante",
        "Cinza Sagrado",
        "Croma",
        "Gianduia",
        "Noturno",
        "Opala",
        "Pau Ferro Natural",
        "Preto",
        "Titânio",
        "Ultramarino"
      ]
    },
    {
      "categoria": "Linha Trama",
      "itens": [
        "Aurora",
        "Branco Ártico",
        "Branco Diamante",
        "Carbono",
        "Gianduia",
        "Grafite",
        "Nobile",
        "Preto",
        "Sirena",
        "Titânio"
      ]
    },
    {
      "categoria": "Linha Design",
      "itens": [
        "Absoluto",
        "Brise",
        "Carvalho Avelã",
        "Carvalho Berlin",
        "Carvalho Hanover",
        "Carvalho Malva",
        "Carvalho Munique",
        "Ibiza",
        "Maranta",
        "Metrópole",
        "Nogueira Caiena",
        "Nogueira Thar",
        "Trancoso"
      ]
    },
    {
      "categoria": "Linha Essencial Wood",
      "itens": [
        "Álamo",
        "Carvalho Batur",
        "Carvalho Eterno",
        "Carvalho Luar",
        "Cumaru Raiz",
        "Freijó Puro",
        "Inhotim",
        "Itapuã",
        "Jequitibá Rosa",
        "Pau Ferro Natural",
        "Rovere Marsala"
      ]
    },
    {
      "categoria": "Linha Essencial",
      "itens": [
        "Artesanal",
        "Azul Secreto",
        "Branco Diamante",
        "Cinza Sagrado",
        "Mint",
        "Noce Amêndoa",
        "Noce Califórnia",
        "Noce Mare",
        "Pérola Urbana",
        "Pinole",
        "Portoro",
        "Prata",
        "Quartzo Bienna",
        "Rock",
        "Rosa Glamour",
        "Rosa Infinito",
        "Rovere Sereno",
        "Steel",
        "Thassos",
        "Verde Real"
      ]
    },
    {
      "categoria": "Linha Prisma",
      "itens": [
        "Amêndola Rústica",
        "Carvalho Évora",
        "Larnaca",
        "Lineo Têxtil",
        "Nogueira Cadiz",
        "Riviera"
      ]
    },
    {
      "categoria": "Linha Quadratta",
      "itens": [
        "Renda",
        "Fibra Nativa",
        "Ouro Pálido",
        "Sépia"
      ]
    },
    {
      "categoria": "Linha Velluto",
      "itens": [
        "Azul Astral",
        "Verde Floresta",
        "Ocre Solar",
        "Bolero",
        "Oásis",
        "Riga",
        "Rocha Rara",
        "Palha",
        "Cinza Fóssil",
        "Off-White Suave",
        "Moss",
        "Nazca",
        "Carvalho Dian",
        "Carvalho Malva",
        "Branco Diamante"
      ]
    },
    {
      "categoria": "Linha Original",
      "itens": [
        "Branco Ártico",
        "Preto"
      ]
    },
    {
      "categoria": "Duratex You",
      "itens": [
        "Rock",
        "Bossa",
        "Calacata Gold",
        "Camadas Brasileiras",
        "Canelado",
        "Chevron",
        "Cosmos",
        "Delicate",
        "Encontros",
        "Galáxia",
        "Ginga com Tapioca",
        "Lago",
        "Legno",
        "NexGeo",
        "Partitura",
        "Tribus",
        "Tramas",
        "Zen",
        "Rascunho"
      ]
    },
    {
      "categoria": "Linha Sense",
      "itens": [
        "Off-White Suave",
        "Gianduia Puro",
        "Fusion",
        "Downtown",
        "Linho Belga",
        "Zinco"
      ]
    },
    {
      "categoria": "Linha Thera",
      "itens": [
        "Rovere Braga",
        "Teka Soho",
        "Bétula"
      ]
    },
    {
      "categoria": "Linha Acetinatta",
      "itens": [
        "Preto",
        "Grafite",
        "Tartufo",
        "Branco Diamante",
        "Azul Astral",
        "Gianduia",
        "Moss"
      ]
    },
    {
      "categoria": "Linha Singular",
      "itens": [
        "Lago",
        "Vitra",
        "Ária",
        "Giardino",
        "Greige",
        "Carvalho Avenna"
      ]
    }
  ]$catalogo$::jsonb;
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

  FOR v_grupo IN SELECT * FROM jsonb_array_elements(v_dados) LOOP
    FOR v_padrao IN SELECT jsonb_array_elements_text(v_grupo->'itens') LOOP
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
      ON CONFLICT (fabricante_id, nome) DO UPDATE
      SET
        categoria = EXCLUDED.categoria,
        ativo = true;
    END LOOP;
  END LOOP;

  -- Sense e o nome da linha, nao um padrao de MDF.
  UPDATE public.padroes
  SET ativo = false
  WHERE fabricante_id = v_fabricante_id
    AND nome = 'Sense';

  -- Evita exibir uma segunda opcao para o mesmo Branco Diamante.
  UPDATE public.padroes
  SET ativo = false
  WHERE fabricante_id = v_fabricante_id
    AND nome = 'Branco Diamante - Linha Cristallo';

  -- Corrige o nome sem acento criado por uma carga complementar anterior.
  IF EXISTS (
    SELECT 1
    FROM public.padroes
    WHERE fabricante_id = v_fabricante_id
      AND nome = 'Cinza Fóssil'
  ) THEN
    UPDATE public.padroes
    SET ativo = false
    WHERE fabricante_id = v_fabricante_id
      AND nome = 'Cinza Fossil';
  ELSE
    UPDATE public.padroes
    SET
      nome = 'Cinza Fóssil',
      categoria = 'Linha Velluto',
      ativo = true
    WHERE fabricante_id = v_fabricante_id
      AND nome = 'Cinza Fossil';
  END IF;

  UPDATE public.padroes
  SET
    categoria = 'Linha Sense',
    ativo = true
  WHERE fabricante_id = v_fabricante_id
    AND nome IN ('Off-White Suave', 'Gianduia Puro');
END $$;
