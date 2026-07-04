
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE public.material_status AS ENUM ('ativo', 'vendido', 'pausado');
CREATE TYPE public.empresa_status AS ENUM ('pendente', 'ativa', 'suspensa', 'bloqueada', 'vencida');
CREATE TYPE public.financeiro_status AS ENUM ('pago', 'pendente', 'atrasado', 'cancelado');

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ EMPRESAS ============
CREATE TABLE public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_empresa TEXT,
  responsavel TEXT,
  telefone TEXT,
  whatsapp TEXT,
  email TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  logo_url TEXT,
  status public.empresa_status NOT NULL DEFAULT 'pendente',
  plano TEXT DEFAULT 'free',
  plano_inicio TIMESTAMPTZ,
  plano_vencimento TIMESTAMPTZ,
  avaliacao NUMERIC(3,2) DEFAULT 0,
  total_negociacoes INTEGER NOT NULL DEFAULT 0,
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas TO authenticated;
GRANT ALL ON public.empresas TO service_role;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresas visíveis a logados" ON public.empresas FOR SELECT TO authenticated
  USING (status IN ('ativa','pendente') OR owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Owner insere própria empresa" ON public.empresas FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner edita própria empresa" ON public.empresas FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin deleta empresa" ON public.empresas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_empresas_updated_at BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-criação de empresa vazia ao cadastrar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.empresas (owner_id, email, responsavel, nome_empresa)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), '')
  ON CONFLICT (owner_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ PADRÕES (catálogo) ============
CREATE TABLE public.padroes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  destaque BOOLEAN NOT NULL DEFAULT false,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.padroes TO authenticated, anon;
GRANT ALL ON public.padroes TO service_role;
ALTER TABLE public.padroes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Padrões públicos" ON public.padroes FOR SELECT USING (true);
CREATE POLICY "Admin gerencia padrões" ON public.padroes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.padroes (nome, destaque, ordem) VALUES
  ('Carvalho Hanover', true, 1),
  ('Freijó', true, 2),
  ('Branco TX', true, 3),
  ('Grafite', true, 4),
  ('Preto TX', true, 5),
  ('Nogueira', true, 6),
  ('Cinza Cristal', false, 7),
  ('Amêndoa', false, 8),
  ('Carvalho Mel', false, 9),
  ('Eucalipto', false, 10);

-- ============ MATERIAIS ============
CREATE TABLE public.materiais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  padrao TEXT NOT NULL,
  fabricante TEXT,
  espessura_mm NUMERIC(6,2) NOT NULL,
  comprimento_cm NUMERIC(8,2) NOT NULL,
  largura_cm NUMERIC(8,2) NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  preco NUMERIC(10,2) NOT NULL,
  observacoes TEXT,
  status public.material_status NOT NULL DEFAULT 'ativo',
  area_m2 NUMERIC(10,4) GENERATED ALWAYS AS ((comprimento_cm * largura_cm * quantidade) / 10000.0) STORED,
  valor_m2 NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN (comprimento_cm * largura_cm * quantidade) > 0
      THEN preco / ((comprimento_cm * largura_cm * quantidade) / 10000.0)
      ELSE 0 END
  ) STORED,
  cidade TEXT,
  estado TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  views INTEGER NOT NULL DEFAULT 0,
  contatos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_materiais_status ON public.materiais (status);
CREATE INDEX idx_materiais_padrao ON public.materiais (padrao);
CREATE INDEX idx_materiais_empresa ON public.materiais (empresa_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materiais TO authenticated;
GRANT ALL ON public.materiais TO service_role;
ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Materiais ativos visíveis" ON public.materiais FOR SELECT TO authenticated
  USING (
    status = 'ativo'
    OR EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid())
    OR public.has_role(auth.uid(),'admin')
  );
CREATE POLICY "Empresa cria material" ON public.materiais FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid()));
CREATE POLICY "Empresa edita material" ON public.materiais FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Empresa deleta material" ON public.materiais FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_materiais_updated_at BEFORE UPDATE ON public.materiais
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ FOTOS ============
CREATE TABLE public.fotos_materiais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fotos_material ON public.fotos_materiais (material_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fotos_materiais TO authenticated;
GRANT ALL ON public.fotos_materiais TO service_role;
ALTER TABLE public.fotos_materiais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fotos visíveis com material" ON public.fotos_materiais FOR SELECT TO authenticated USING (true);
CREATE POLICY "Empresa gerencia fotos" ON public.fotos_materiais FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.materiais m JOIN public.empresas e ON e.id = m.empresa_id WHERE m.id = material_id AND e.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.materiais m JOIN public.empresas e ON e.id = m.empresa_id WHERE m.id = material_id AND e.owner_id = auth.uid()));

-- ============ ALERTAS ============
CREATE TABLE public.alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  padrao TEXT,
  fabricante TEXT,
  espessura_mm NUMERIC(6,2),
  largura_min_cm NUMERIC(8,2),
  comprimento_min_cm NUMERIC(8,2),
  raio_km INTEGER DEFAULT 50,
  preco_max NUMERIC(10,2),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alertas TO authenticated;
GRANT ALL ON public.alertas TO service_role;
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário gerencia próprios alertas" ON public.alertas FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ FAVORITOS ============
CREATE TABLE public.favoritos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, material_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favoritos TO authenticated;
GRANT ALL ON public.favoritos TO service_role;
ALTER TABLE public.favoritos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário gerencia próprios favoritos" ON public.favoritos FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ MATERIAL VIEWS / CONTATOS ============
CREATE TABLE public.material_views (
  id BIGSERIAL PRIMARY KEY,
  material_id UUID NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.material_views TO authenticated;
GRANT USAGE ON SEQUENCE public.material_views_id_seq TO authenticated;
GRANT ALL ON public.material_views TO service_role;
ALTER TABLE public.material_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone logged can register view" ON public.material_views FOR INSERT TO authenticated
  WITH CHECK (viewer_id = auth.uid() OR viewer_id IS NULL);
CREATE POLICY "Owner reads views" ON public.material_views FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.materiais m JOIN public.empresas e ON e.id = m.empresa_id WHERE m.id = material_id AND e.owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.material_contatos (
  id BIGSERIAL PRIMARY KEY,
  material_id UUID NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.material_contatos TO authenticated;
GRANT USAGE ON SEQUENCE public.material_contatos_id_seq TO authenticated;
GRANT ALL ON public.material_contatos TO service_role;
ALTER TABLE public.material_contatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone logged can register contato" ON public.material_contatos FOR INSERT TO authenticated
  WITH CHECK (viewer_id = auth.uid() OR viewer_id IS NULL);
CREATE POLICY "Owner reads contatos" ON public.material_contatos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.materiais m JOIN public.empresas e ON e.id = m.empresa_id WHERE m.id = material_id AND e.owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));

-- ============ PLANOS / FINANCEIRO ============
CREATE TABLE public.planos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  preco NUMERIC(10,2) NOT NULL,
  duracao_dias INTEGER NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.planos TO authenticated, anon;
GRANT ALL ON public.planos TO service_role;
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Planos públicos" ON public.planos FOR SELECT USING (true);
CREATE POLICY "Admin gerencia planos" ON public.planos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.planos (nome, preco, duracao_dias) VALUES
  ('Free', 0, 36500),
  ('Mensal', 49.90, 30),
  ('Trimestral', 129.90, 90),
  ('Anual', 449.90, 365);

CREATE TABLE public.financeiro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  plano_id UUID REFERENCES public.planos(id) ON DELETE SET NULL,
  valor NUMERIC(10,2) NOT NULL,
  pagamento TIMESTAMPTZ,
  vencimento TIMESTAMPTZ NOT NULL,
  status public.financeiro_status NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro TO authenticated;
GRANT ALL ON public.financeiro TO service_role;
ALTER TABLE public.financeiro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Empresa lê próprio financeiro" ON public.financeiro FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin gerencia financeiro" ON public.financeiro FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ STORAGE POLICIES (bucket materiais) ============
CREATE POLICY "Materiais bucket público leitura" ON storage.objects FOR SELECT
  USING (bucket_id = 'materiais');
CREATE POLICY "Auth upload materiais" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'materiais' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Auth update próprias fotos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'materiais' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Auth delete próprias fotos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'materiais' AND (storage.foldername(name))[1] = auth.uid()::text);
