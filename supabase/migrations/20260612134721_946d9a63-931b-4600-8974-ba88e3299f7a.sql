
-- Drop old padroes catalog (replacing with new structure)
DROP POLICY IF EXISTS "Padrões públicos" ON public.padroes;
DROP POLICY IF EXISTS "Admin gerencia padrões" ON public.padroes;
DROP TABLE IF EXISTS public.padroes CASCADE;

-- ============ FABRICANTES ============
CREATE TABLE public.fabricantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fabricantes TO authenticated, anon;
GRANT ALL ON public.fabricantes TO service_role;
ALTER TABLE public.fabricantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fabricantes públicos" ON public.fabricantes FOR SELECT USING (true);
CREATE POLICY "Admin gerencia fabricantes" ON public.fabricantes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ PADRÕES ============
CREATE TABLE public.padroes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fabricante_id UUID NOT NULL REFERENCES public.fabricantes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Geral',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fabricante_id, nome)
);
CREATE INDEX idx_padroes_fab ON public.padroes (fabricante_id);
CREATE INDEX idx_padroes_nome ON public.padroes (nome);
GRANT SELECT ON public.padroes TO authenticated, anon;
GRANT ALL ON public.padroes TO service_role;
ALTER TABLE public.padroes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Padrões públicos" ON public.padroes FOR SELECT USING (true);
CREATE POLICY "Admin gerencia padrões" ON public.padroes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ ESPESSURAS ============
CREATE TABLE public.espessuras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valor_mm NUMERIC(6,2) NOT NULL UNIQUE,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.espessuras TO authenticated, anon;
GRANT ALL ON public.espessuras TO service_role;
ALTER TABLE public.espessuras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Espessuras públicas" ON public.espessuras FOR SELECT USING (true);
CREATE POLICY "Admin gerencia espessuras" ON public.espessuras FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ Add FK columns to materiais ============
ALTER TABLE public.materiais
  ADD COLUMN IF NOT EXISTS fabricante_id UUID REFERENCES public.fabricantes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS padrao_id UUID REFERENCES public.padroes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_materiais_fab ON public.materiais (fabricante_id);
CREATE INDEX IF NOT EXISTS idx_materiais_padrao_id ON public.materiais (padrao_id);

-- ============ SEED FABRICANTES ============
INSERT INTO public.fabricantes (nome, ordem) VALUES
  ('Duratex', 1),('Arauco', 2),('Guararapes', 3),
  ('Berneck', 4),('Eucatex', 5),('Greenplac', 6);

-- ============ SEED ESPESSURAS ============
INSERT INTO public.espessuras (valor_mm, ordem) VALUES
  (3,1),(6,2),(9,3),(12,4),(15,5),(18,6),(25,7),(30,8),(36,9),(40,10);

-- ============ SEED PADRÕES ============
-- Helper macro via DO block
DO $$
DECLARE
  v_fab UUID;
  v_ord INTEGER;
  rec RECORD;
  data JSONB := $j$[
    {"fab":"Duratex","cat":"Madeirados","items":["Carvalho Hanover","Carvalho Malva","Carvalho Munique","Carvalho Berlin","Carvalho Avelã","Carvalho Batur","Carvalho Eterno","Carvalho Luar","Freijó Puro","Pau Ferro Natural","Cumaru Raiz","Itapuã","Inhotim","Jequitibá Rosa","Maranta","Ibiza","Metrópole","Álamo","Nogueira Cadiz","Absoluto","Brise","Gianduia"]},
    {"fab":"Duratex","cat":"Unicolores","items":["Branco Diamante","Branco Ártico","Preto","Grafite","Carbono","Titânio","Cinza Sagrado","Aurora","Sirena","Nobile","Croma","Opala","Noturno","Ultramarino","Azul Astral","Verde Floresta","Palha","Oásis","Ocre Solar"]},
    {"fab":"Duratex","cat":"Pedras e Especiais","items":["Arenito","Basalto","Eclipse","Gobi","Hong Kong","Lana","Lunar","Tramato","Cristal","Prata"]},
    {"fab":"Arauco","cat":"Madeirados","items":["Carvalho Hanover","Canela","Damasco","Ipê Real","Louro Freijó","Nogueira Persa","Castanheira Natural","Reali","Atenna","Maraú","Maragogi","Jalapão","Frevo"]},
    {"fab":"Arauco","cat":"Unicolores","items":["Branco Supremo","Cinza Puro","Cinza Cristal","Grafito","Azul Sereno","Verde Jade","Sálvia","Lavanda","Oceano","Sal Rosa","Frapê","Beige","Cacau"]},
    {"fab":"Arauco","cat":"Especiais","items":["Beton","Cristalina","Kashmir","Connect","Jazz","Blues","Areal"]},
    {"fab":"Guararapes","cat":"Geral","items":["Freijó","Nogueira","Carvalho","Fendi","Cashmere","Titan","Duna","Areia","Grafite","Preto","Branco","Bronze","Linho","Cimento","Concreto"]},
    {"fab":"Berneck","cat":"Geral","items":["Freijó","Louro Freijó","Nogueira","Carvalho","Hanover","Branco TX","Preto TX","Grafite TX","Cristallo","Titanium","Cimento","Concreto","Fendi","Linho","Areia"]},
    {"fab":"Eucatex","cat":"Geral","items":["Branco TX","Branco Ártico","Preto TX","Grafite","Carvalho","Freijó","Nogueira","Louro Freijó","Fendi","Titanium","Cristallo","Linho","Areia","Cimento","Concreto"]},
    {"fab":"Greenplac","cat":"Geral","items":["Freijó","Carvalho","Nogueira","Hanover","Branco","Preto","Grafite","Fendi","Titanium","Areia","Duna","Cashmere","Linho","Cimento","Concreto"]}
  ]$j$::JSONB;
  grp JSONB;
  item TEXT;
BEGIN
  FOR grp IN SELECT * FROM jsonb_array_elements(data) LOOP
    SELECT id INTO v_fab FROM public.fabricantes WHERE nome = grp->>'fab';
    v_ord := 0;
    FOR item IN SELECT jsonb_array_elements_text(grp->'items') LOOP
      v_ord := v_ord + 1;
      INSERT INTO public.padroes (fabricante_id, nome, categoria, ordem)
      VALUES (v_fab, item, grp->>'cat', v_ord)
      ON CONFLICT (fabricante_id, nome) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
