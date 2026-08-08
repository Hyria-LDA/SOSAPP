-- Amplia o catalogo de padroes MDF/BP usado em Anunciar Sobra,
-- Buscar Material e Avisos Automaticos.
-- Fontes consultadas em julho/2026: catalogos digitais/paginas oficiais
-- Arauco Melamina, Guararapes MDF Revestido, Berneck Catalogo BP,
-- Duratex Produtos e Flora/Floraplac.

DO $$
DECLARE
  v_fab uuid;
  v_ord integer;
  grp jsonb;
  item text;
  data jsonb := $j$[
    {
      "fab": "Duratex",
      "cat": "Catalogo oficial",
      "items": [
        "Branco Diamante - Linha Cristallo",
        "Carvalho Dian",
        "Cinza Fossil",
        "Off-White Suave"
      ]
    },
    {
      "fab": "Arauco",
      "cat": "Madeiras",
      "items": [
        "Acacia Carmel",
        "Ameixa Negra",
        "Amendoeira",
        "Areal",
        "Atlantica",
        "Autentic",
        "Bossa Nova",
        "Canela",
        "Carvalho",
        "Carvalho Americano",
        "Carvalho Mel",
        "Castanho",
        "Cerrado",
        "Ciliegio",
        "Escarlate",
        "Madeiral",
        "Marau",
        "Noce Naturale",
        "Nogal Terracota",
        "Nogueira Pecan",
        "Nogueira Persa",
        "Petar",
        "Samba",
        "Sertanejo",
        "Tabaco",
        "Teka Artico"
      ]
    },
    {
      "fab": "Arauco",
      "cat": "Madeiras Brasileiras",
      "items": [
        "Cumaru",
        "Ipe Real",
        "Jatoba Brasileiro",
        "Jequitiba",
        "Louro Freijo",
        "Nova Imbuia",
        "Pau-Ferro",
        "Tauari Classico"
      ]
    },
    {
      "fab": "Arauco",
      "cat": "Cores",
      "items": [
        "Anis",
        "Azul Sereno",
        "Beige",
        "Beton",
        "Blues",
        "Branco Supremo",
        "Cacao",
        "Cafelatte",
        "Canela",
        "Cinza Cristal",
        "Cinza Puro",
        "Connect",
        "Cravo",
        "Cristalina",
        "Damasco",
        "Ebano",
        "Frape",
        "Frevo",
        "Ginger",
        "Grafito",
        "Gris",
        "Jalapao",
        "Jazz",
        "Kashmir",
        "Lavanda",
        "Lord",
        "Maragogi",
        "Moscada",
        "Oceano",
        "Pimenta Rosa",
        "Sal Rosa",
        "Salvia",
        "Verde Jade"
      ]
    },
    {
      "fab": "Arauco",
      "cat": "Pedras, metais e tecidos",
      "items": [
        "Atenna",
        "Camelo",
        "Concreto Decor",
        "Linho",
        "Lino",
        "Lino Piombo",
        "Orla",
        "Orvalho",
        "Reali",
        "Silicio"
      ]
    },
    {
      "fab": "Guararapes",
      "cat": "Madeiras do Brasil",
      "items": [
        "Araucaria",
        "Curupixa",
        "Freijo",
        "Imbuia",
        "Pau-Ferro",
        "Peroba",
        "RUC Freijo",
        "RUC Tauari",
        "Tauari"
      ]
    },
    {
      "fab": "Guararapes",
      "cat": "Madeiras do Mundo",
      "items": [
        "Alabama",
        "Antiqua",
        "Antuerpia",
        "Baviera",
        "Caribe",
        "Carvalho Natural",
        "Carvalho Nordico",
        "Fresno Acores",
        "Fresno Aveiro",
        "Fresno Coimbra",
        "Fresno Douro",
        "Fresno Madeira",
        "Nero",
        "Nogal Champagne",
        "Nogueira Ambar",
        "Nogueira Rubi",
        "RUC Carvalho Natural",
        "RUC Savana",
        "Salerno",
        "Savana",
        "Sonora"
      ]
    },
    {
      "fab": "Guararapes",
      "cat": "Cores",
      "items": [
        "Alecrim",
        "Areia",
        "Azul Ardosia",
        "Azul Petroleo",
        "Brisa",
        "Capuccino",
        "Cinza Perfeito",
        "Cinza Urban",
        "Doce de Leite",
        "Erva Mate",
        "Grafite",
        "Lume",
        "Mangue",
        "Marrom Sepia",
        "Marsala",
        "Maxi Branco",
        "Nuvem",
        "Rosa Milkshake",
        "RUC Areia",
        "RUC Brisa",
        "RUC Grafite",
        "RUC Lume",
        "RUC Nuvem",
        "Tijolo",
        "Verde Oliva"
      ]
    },
    {
      "fab": "Guararapes",
      "cat": "Aris",
      "items": [
        "Ametista",
        "Azul Marinho",
        "Neblina",
        "Noite"
      ]
    },
    {
      "fab": "Guararapes",
      "cat": "Flex",
      "items": [
        "Bilbao",
        "Branco Iceland",
        "Cipres",
        "Fendi",
        "Lisboa",
        "Nogal Sevilha",
        "Teka Bianco",
        "Terrino"
      ]
    },
    {
      "fab": "Guararapes",
      "cat": "Magma, Metalic e Comfort",
      "items": [
        "Bronze",
        "Cobre",
        "Corten",
        "Cosmos",
        "Cromio",
        "Fontana",
        "Marmo",
        "Metal Champagne",
        "Niquel",
        "Onix",
        "Petra",
        "Quartzo",
        "Santorini",
        "Tear",
        "Tecno",
        "Tela"
      ]
    },
    {
      "fab": "Guararapes",
      "cat": "Madeiras Geometricas",
      "items": [
        "Carvalho Capri",
        "Mageo Carvalho",
        "Mageo Imbuia",
        "Mageo Mel"
      ]
    },
    {
      "fab": "Guararapes",
      "cat": "Outros",
      "items": [
        "Floresta",
        "Sao Paulo"
      ]
    },
    {
      "fab": "Berneck",
      "cat": "Colecao Legado",
      "items": [
        "Cerejeira Clara",
        "Cerejeira Natural",
        "Freijo Nativo",
        "Jequitiba Brasil",
        "Mogno Imperial"
      ]
    },
    {
      "fab": "Berneck",
      "cat": "Colecao Horizontes",
      "items": [
        "Dust",
        "Falesia",
        "Gold",
        "Latte",
        "Parquet",
        "Plomo",
        "Tabasco",
        "Tangara",
        "Veneer"
      ]
    },
    {
      "fab": "Berneck",
      "cat": "Linha Smart",
      "items": [
        "Cromio",
        "Desert",
        "Gelo",
        "Pecan"
      ]
    },
    {
      "fab": "Berneck",
      "cat": "Unicolores e especiais",
      "items": [
        "Argento Rust",
        "Azul Galeno",
        "Azul TX",
        "Azul Vel",
        "Baru",
        "Basalto Rust",
        "Bege TX",
        "Cacau",
        "Castaine",
        "Ceramik",
        "Chumbo",
        "Cinza Argila TX",
        "Cinza Cobalto TX",
        "Cinza Cobalto Vel",
        "Cinza Cristal TX",
        "Italian Noce",
        "Lana",
        "Linen Grigio",
        "Louro Preto",
        "Metallic Suede TX",
        "Millennial",
        "Mostrato",
        "Nero Rust",
        "Nogal Malaga",
        "Nude",
        "Opera",
        "Preto Design",
        "Preto TX",
        "Ruggine TX",
        "Sky",
        "Solanum",
        "Taupe",
        "Terrazza",
        "Verti",
        "Volakas"
      ]
    }
  ]$j$::jsonb;
BEGIN
  FOR grp IN SELECT * FROM jsonb_array_elements(data) LOOP
    SELECT id INTO v_fab FROM public.fabricantes WHERE nome = grp->>'fab';
    IF v_fab IS NULL THEN
      CONTINUE;
    END IF;

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
