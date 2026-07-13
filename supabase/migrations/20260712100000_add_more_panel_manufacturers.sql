-- Adds Brazilian MDF/panel manufacturers requested for catalog pickers.
-- The app reads these tables in Anunciar Sobra, Buscar Material and Avisos Automaticos.

INSERT INTO public.fabricantes (nome, ordem, ativo)
VALUES
  ('Floraplac', 7, true),
  ('Sudati', 8, true),
  ('Fibraplac', 9, true),
  ('Placas do Brasil', 10, true)
ON CONFLICT (nome) DO UPDATE
SET
  ordem = EXCLUDED.ordem,
  ativo = true;

DO $$
DECLARE
  v_fab uuid;
  v_ord integer;
  grp jsonb;
  item text;
  data jsonb := $j$[
    {
      "fab": "Floraplac",
      "cat": "Geral",
      "items": [
        "Adega",
        "Almeria",
        "Alvorecer",
        "Amendoa",
        "Amago",
        "Anoitecer",
        "Asfalto",
        "Branco Aspro",
        "Branco Nordico",
        "Bruma",
        "Carbon",
        "Carvalho Amanhecer",
        "Castanea",
        "Cinza Cristal",
        "City",
        "Concrete",
        "Conves",
        "Crepusculo",
        "Durban",
        "Fendi",
        "Floresta",
        "Freijo Natural",
        "Geppetto",
        "Gouthier",
        "Jequitiba Poente",
        "Kiev",
        "Lenho",
        "Magma",
        "Milano",
        "Nogal Amendoado",
        "Nogueira Imperial",
        "Nogueira Nobre",
        "Pau-Ferro Juca",
        "Pier",
        "Pietrasanta",
        "Preto",
        "Proa",
        "Rose Gold",
        "Safira",
        "Sereno",
        "Solar",
        "Tauari Zenite",
        "Tesselati",
        "Trama",
        "Viena"
      ]
    },
    {
      "fab": "Sudati",
      "cat": "Geral",
      "items": [
        "Branco",
        "Carvalho",
        "Cinza",
        "Compensado Eucalipto",
        "Compensado Pinus",
        "Freijo",
        "MDF Cru",
        "Nogueira",
        "Preto"
      ]
    },
    {
      "fab": "Fibraplac",
      "cat": "Origens",
      "items": [
        "Amendoa Suave",
        "Aspen",
        "Cabiuna Nobre",
        "Cambara",
        "Carvalho Itapua",
        "Carvalho Latino",
        "Carvalho Tropical",
        "Freijo Natura",
        "Murano",
        "Nogueira Boreal",
        "Nogueira Nativa",
        "Serrano"
      ]
    },
    {
      "fab": "Fibraplac",
      "cat": "Sensacoes",
      "items": [
        "Ambar",
        "Azul Infinito",
        "Cafe Imperial",
        "Lavanda",
        "Moscatel",
        "Oceano",
        "Raphia",
        "Sakura"
      ]
    },
    {
      "fab": "Fibraplac",
      "cat": "Essencial",
      "items": [
        "Bariloche",
        "Cinza Calcario",
        "Duna",
        "Preto"
      ]
    },
    {
      "fab": "Fibraplac",
      "cat": "Versatil",
      "items": [
        "Mocca",
        "Panna",
        "Preto Trama",
        "Saara",
        "Urbi",
        "Versato"
      ]
    },
    {
      "fab": "Fibraplac",
      "cat": "Conceito",
      "items": [
        "Carrara",
        "Linho Fendi",
        "Linum",
        "Orion"
      ]
    },
    {
      "fab": "Fibraplac",
      "cat": "Brancos",
      "items": [
        "Branco Larissa",
        "Branco Larissa LS",
        "Branco Plus LS",
        "Branco Plus TX"
      ]
    },
    {
      "fab": "Fibraplac",
      "cat": "Fibra Mais",
      "items": [
        "Fibra Mais"
      ]
    },
    {
      "fab": "Placas do Brasil",
      "cat": "Versateis",
      "items": [
        "Alva",
        "Aurea Imperial",
        "Cupuacu",
        "Guarana",
        "Inga",
        "Luar",
        "Poente"
      ]
    },
    {
      "fab": "Placas do Brasil",
      "cat": "Hibridos",
      "items": [
        "Congo Capixaba",
        "Samba",
        "Tropicalia"
      ]
    },
    {
      "fab": "Placas do Brasil",
      "cat": "Madeiras",
      "items": [
        "Caravela",
        "Carvalho Aicana",
        "Carvalho Arandu",
        "Carvalho Caete",
        "Carvalho Tupi",
        "Elmo Aracruz",
        "Elmo Palmares",
        "Nogal Terena",
        "Nogueira Arroio",
        "Nogueira Caiapo",
        "Nogueira Carajas",
        "Nogueira Goitaca",
        "Vila Velha"
      ]
    },
    {
      "fab": "Placas do Brasil",
      "cat": "Contemporaneas",
      "items": [
        "Amazonas",
        "Rio Negro"
      ]
    },
    {
      "fab": "Placas do Brasil",
      "cat": "Madeiras Brasileiras",
      "items": [
        "Acacia",
        "Freijo",
        "Freijo Ripado",
        "Jacaranda",
        "Jequitiba Rei",
        "Macanaiba",
        "Peroba do Brasil"
      ]
    },
    {
      "fab": "Placas do Brasil",
      "cat": "Cores",
      "items": [
        "Cafe Torrado",
        "Capim Dourado",
        "Castanha do Caju",
        "Hortensia",
        "Ocre",
        "Pimenta do Reino",
        "Pitanga",
        "Selva",
        "Tapioca",
        "Terra Bronze",
        "Urucum",
        "Vitoria-Regia"
      ]
    },
    {
      "fab": "Placas do Brasil",
      "cat": "Unicolores Tradicionais",
      "items": [
        "Branco",
        "Cinza Cristal",
        "Preto",
        "Super Branco"
      ]
    }
  ]$j$::jsonb;
BEGIN
  FOR grp IN SELECT * FROM jsonb_array_elements(data) LOOP
    SELECT id INTO v_fab FROM public.fabricantes WHERE nome = grp->>'fab';
    v_ord := 0;

    FOR item IN SELECT jsonb_array_elements_text(grp->'items') LOOP
      v_ord := v_ord + 1;

      INSERT INTO public.padroes (fabricante_id, nome, categoria, ordem, ativo)
      VALUES (v_fab, item, grp->>'cat', v_ord, true)
      ON CONFLICT (fabricante_id, nome) DO UPDATE
      SET
        categoria = EXCLUDED.categoria,
        ordem = EXCLUDED.ordem,
        ativo = true;
    END LOOP;
  END LOOP;
END $$;
