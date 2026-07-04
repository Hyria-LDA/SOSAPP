
-- 1) Estender planos
ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS cor text DEFAULT 'gray',
  ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_anuncios integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_buscas integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS max_alertas integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_fotos integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS recursos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS planos_slug_uniq ON public.planos(slug) WHERE slug IS NOT NULL;

DROP TRIGGER IF EXISTS trg_planos_updated_at ON public.planos;
CREATE TRIGGER trg_planos_updated_at
  BEFORE UPDATE ON public.planos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Limpar planos antigos e seed dos 4 novos
DELETE FROM public.planos;

INSERT INTO public.planos (slug, nome, preco, duracao_dias, ativo, cor, ordem, descricao, max_anuncios, max_buscas, max_alertas, max_fotos, recursos) VALUES
('free',     'Free',     0.00,  36500, true, 'gray',   1, 'Ideal para conhecer a plataforma', 10,  20, 3,  3,
  '["Suporte básico"]'::jsonb),
('plus',     'Plus',     29.90, 30,    true, 'blue',   2, 'Ideal para pequenas marcenarias',  20,  50, 10, 3,
  '["Painel de estatísticas"]'::jsonb),
('standard', 'Standard', 59.90, 30,    true, 'orange', 3, 'Ideal para marcenarias que anunciam regularmente', 50, 150, 30, 3,
  '["Painel de desempenho completo","Histórico de vendas"]'::jsonb),
('premium',  'Premium',  99.90, 30,    true, 'purple', 4, 'Ideal para empresas com alto volume', 100, -1, -1, 3,
  '["Buscas ilimitadas","Alertas ilimitados","Painel completo","Relatórios avançados","Prioridade em suporte"]'::jsonb);

-- 3) Vincular empresas a planos via FK
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS plano_id uuid REFERENCES public.planos(id);

-- Migra valor textual existente (se houver) e default para free
UPDATE public.empresas e
  SET plano_id = COALESCE(
    (SELECT id FROM public.planos WHERE lower(slug) = lower(COALESCE(e.plano, 'free'))),
    (SELECT id FROM public.planos WHERE slug = 'free')
  )
  WHERE plano_id IS NULL;

-- Garante plano_inicio para quem já tem
UPDATE public.empresas SET plano_inicio = COALESCE(plano_inicio, created_at) WHERE plano_id IS NOT NULL AND plano_inicio IS NULL;

-- 4) Default de novas empresas: já vir com plano free
CREATE OR REPLACE FUNCTION public.set_default_plano()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plano_id IS NULL THEN
    SELECT id INTO NEW.plano_id FROM public.planos WHERE slug = 'free' LIMIT 1;
  END IF;
  IF NEW.plano_inicio IS NULL THEN NEW.plano_inicio = now(); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_empresas_default_plano ON public.empresas;
CREATE TRIGGER trg_empresas_default_plano
  BEFORE INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.set_default_plano();

-- 5) Permissões de leitura dos planos (catálogo público)
GRANT SELECT ON public.planos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.planos TO authenticated;
GRANT ALL ON public.planos TO service_role;

DROP POLICY IF EXISTS "Planos: leitura pública" ON public.planos;
DROP POLICY IF EXISTS "Planos: admin gerencia" ON public.planos;
CREATE POLICY "Planos: leitura pública"
  ON public.planos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Planos: admin insere"
  ON public.planos FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Planos: admin atualiza"
  ON public.planos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Planos: admin remove"
  ON public.planos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;

-- 6) Função: vencimento aplicado dinamicamente (se vencido, considera FREE)
CREATE OR REPLACE FUNCTION public.get_user_plan_status(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp RECORD;
  pl  RECORD;
  freep RECORD;
  vencido boolean;
  ini timestamptz;
  fim timestamptz;
  uso_anuncios int;
  uso_alertas  int;
  uso_buscas   int;
BEGIN
  SELECT * INTO emp FROM public.empresas WHERE owner_id = _user_id LIMIT 1;
  SELECT * INTO freep FROM public.planos WHERE slug = 'free' LIMIT 1;

  IF emp IS NULL THEN
    pl := freep;
    vencido := false;
  ELSE
    SELECT * INTO pl FROM public.planos WHERE id = emp.plano_id;
    IF pl IS NULL THEN pl := freep; END IF;

    -- Se for plano pago e estiver vencido → cai para free dinamicamente
    vencido := (pl.slug <> 'free' AND emp.plano_vencimento IS NOT NULL AND emp.plano_vencimento < now());
    IF vencido THEN pl := freep; END IF;
  END IF;

  -- Uso do mês corrente (anúncios ativos contam totais; buscas/alertas mensal)
  SELECT count(*) INTO uso_anuncios
    FROM public.materiais m
    JOIN public.empresas e ON e.id = m.empresa_id
    WHERE e.owner_id = _user_id AND m.status = 'ativo';

  SELECT count(*) INTO uso_alertas
    FROM public.alertas WHERE user_id = _user_id AND ativo = true;

  SELECT count(*) INTO uso_buscas
    FROM public.pedidos_material
    WHERE user_id = _user_id
      AND created_at >= date_trunc('month', now());

  ini := emp.plano_inicio;
  fim := emp.plano_vencimento;

  RETURN jsonb_build_object(
    'plano', jsonb_build_object(
      'id', pl.id, 'slug', pl.slug, 'nome', pl.nome, 'cor', pl.cor,
      'preco', pl.preco, 'descricao', pl.descricao, 'recursos', pl.recursos,
      'max_anuncios', pl.max_anuncios, 'max_buscas', pl.max_buscas,
      'max_alertas', pl.max_alertas, 'max_fotos', pl.max_fotos
    ),
    'vencido', vencido,
    'plano_inicio', ini,
    'plano_vencimento', fim,
    'uso', jsonb_build_object(
      'anuncios', uso_anuncios,
      'alertas',  uso_alertas,
      'buscas',   uso_buscas
    )
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_user_plan_status(uuid) TO authenticated;

-- 7) Função para checar limite antes de criar recurso
CREATE OR REPLACE FUNCTION public.check_plan_limit(_user_id uuid, _resource text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st jsonb;
  limite int;
  atual int;
BEGIN
  st := public.get_user_plan_status(_user_id);

  IF _resource = 'anuncios' THEN
    limite := (st->'plano'->>'max_anuncios')::int;
    atual  := (st->'uso'->>'anuncios')::int;
  ELSIF _resource = 'alertas' THEN
    limite := (st->'plano'->>'max_alertas')::int;
    atual  := (st->'uso'->>'alertas')::int;
  ELSIF _resource = 'buscas' THEN
    limite := (st->'plano'->>'max_buscas')::int;
    atual  := (st->'uso'->>'buscas')::int;
  ELSE
    RETURN jsonb_build_object('allowed', true, 'unlimited', true);
  END IF;

  IF limite = -1 THEN
    RETURN jsonb_build_object('allowed', true, 'unlimited', true, 'atual', atual);
  END IF;

  RETURN jsonb_build_object(
    'allowed', atual < limite,
    'unlimited', false,
    'atual', atual,
    'limite', limite,
    'plano', st->'plano'->>'nome'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit(uuid, text) TO authenticated;
