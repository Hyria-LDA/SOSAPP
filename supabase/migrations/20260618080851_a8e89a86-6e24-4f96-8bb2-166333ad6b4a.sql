
-- 1. Add 'vendedor' role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendedor';

-- 2. Extend empresas
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS vendedor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ref_codigo_usado text,
  ADD COLUMN IF NOT EXISTS premium_trial_fim timestamptz;

CREATE INDEX IF NOT EXISTS empresas_vendedor_id_idx ON public.empresas(vendedor_id);

-- 3. vendedores_parceiros
CREATE TABLE IF NOT EXISTS public.vendedores_parceiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text NOT NULL,
  telefone text,
  codigo text NOT NULL UNIQUE,
  comissao_valor numeric(10,2) NOT NULL DEFAULT 50,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendedores_parceiros TO authenticated;
GRANT ALL ON public.vendedores_parceiros TO service_role;

ALTER TABLE public.vendedores_parceiros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia vendedores" ON public.vendedores_parceiros
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Vendedor le proprio registro" ON public.vendedores_parceiros
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER touch_vendedores_parceiros
  BEFORE UPDATE ON public.vendedores_parceiros
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. vendedor_cliques (anonymous tracking)
CREATE TABLE IF NOT EXISTS public.vendedor_cliques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  vendedor_id uuid REFERENCES public.vendedores_parceiros(id) ON DELETE CASCADE,
  referer text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendedor_cliques_vendedor_idx ON public.vendedor_cliques(vendedor_id);
CREATE INDEX IF NOT EXISTS vendedor_cliques_codigo_idx ON public.vendedor_cliques(codigo);

GRANT SELECT ON public.vendedor_cliques TO authenticated;
GRANT ALL ON public.vendedor_cliques TO service_role;

ALTER TABLE public.vendedor_cliques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin le cliques" ON public.vendedor_cliques
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Vendedor le proprios cliques" ON public.vendedor_cliques
  FOR SELECT TO authenticated
  USING (vendedor_id IN (SELECT id FROM public.vendedores_parceiros WHERE user_id = auth.uid()));

-- 5. indicacoes
DO $$ BEGIN
  CREATE TYPE public.indicacao_status AS ENUM ('cadastrada','aprovada','cancelada','expirada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.indicacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.vendedores_parceiros(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  status public.indicacao_status NOT NULL DEFAULT 'cadastrada',
  comissao_valor numeric(10,2) NOT NULL DEFAULT 0,
  premium_inicio timestamptz,
  premium_fim timestamptz,
  aprovada_em timestamptz,
  paga boolean NOT NULL DEFAULT false,
  paga_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id)
);

CREATE INDEX IF NOT EXISTS indicacoes_vendedor_idx ON public.indicacoes(vendedor_id);
CREATE INDEX IF NOT EXISTS indicacoes_status_idx ON public.indicacoes(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.indicacoes TO authenticated;
GRANT ALL ON public.indicacoes TO service_role;

ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia indicacoes" ON public.indicacoes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Vendedor le proprias indicacoes" ON public.indicacoes
  FOR SELECT TO authenticated
  USING (vendedor_id IN (SELECT id FROM public.vendedores_parceiros WHERE user_id = auth.uid()));

CREATE TRIGGER touch_indicacoes
  BEFORE UPDATE ON public.indicacoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. RPC: registrar clique (público - anon e authenticated)
CREATE OR REPLACE FUNCTION public.registrar_clique_vendedor(_codigo text, _referer text DEFAULT NULL, _user_agent text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  click_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.vendedores_parceiros WHERE codigo = _codigo AND ativo = true;
  IF v_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.vendedor_cliques(codigo, vendedor_id, referer, user_agent)
  VALUES (_codigo, v_id, _referer, _user_agent)
  RETURNING id INTO click_id;

  RETURN click_id;
END $$;

GRANT EXECUTE ON FUNCTION public.registrar_clique_vendedor(text, text, text) TO anon, authenticated;

-- 7. RPC: aplicar código de referência (no onboarding)
CREATE OR REPLACE FUNCTION public.aplicar_ref_codigo(_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
  emp RECORD;
  premium_id uuid;
  ind_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v FROM public.vendedores_parceiros WHERE codigo = _codigo AND ativo = true;
  IF v IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'codigo_invalido');
  END IF;

  SELECT * INTO emp FROM public.empresas WHERE owner_id = auth.uid();
  IF emp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empresa_inexistente');
  END IF;

  -- Já vinculada?
  IF emp.vendedor_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ja_vinculada');
  END IF;

  SELECT id INTO premium_id FROM public.planos WHERE slug = 'premium' LIMIT 1;

  UPDATE public.empresas SET
    vendedor_id = v.user_id,
    ref_codigo_usado = _codigo,
    plano_id = premium_id,
    plano_inicio = now(),
    plano_vencimento = now() + interval '90 days',
    premium_trial_fim = now() + interval '90 days'
  WHERE id = emp.id;

  INSERT INTO public.indicacoes(vendedor_id, empresa_id, codigo, status, comissao_valor, premium_inicio, premium_fim)
  VALUES (v.id, emp.id, _codigo, 'cadastrada', v.comissao_valor, now(), now() + interval '90 days')
  ON CONFLICT (empresa_id) DO NOTHING
  RETURNING id INTO ind_id;

  RETURN jsonb_build_object('ok', true, 'indicacao_id', ind_id, 'premium_fim', now() + interval '90 days');
END $$;

GRANT EXECUTE ON FUNCTION public.aplicar_ref_codigo(text) TO authenticated;

-- 8. RPC: verificar critérios de aprovação
CREATE OR REPLACE FUNCTION public.verificar_aprovacao_indicacao(_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp RECORD;
  ind RECORD;
  qtd_anuncios int;
BEGIN
  SELECT * INTO ind FROM public.indicacoes WHERE empresa_id = _empresa_id AND status = 'cadastrada';
  IF ind IS NULL THEN RETURN; END IF;

  SELECT * INTO emp FROM public.empresas WHERE id = _empresa_id;
  IF emp IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO qtd_anuncios FROM public.materiais WHERE empresa_id = _empresa_id AND status = 'ativo';

  IF coalesce(emp.nome_empresa,'') <> ''
     AND coalesce(emp.whatsapp,'') <> ''
     AND emp.latitude IS NOT NULL
     AND emp.longitude IS NOT NULL
     AND qtd_anuncios >= 3
  THEN
    UPDATE public.indicacoes SET status = 'aprovada', aprovada_em = now() WHERE id = ind.id;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.verificar_aprovacao_indicacao(uuid) TO authenticated, service_role;

-- 9. Trigger em materiais
CREATE OR REPLACE FUNCTION public.materiais_check_indicacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.verificar_aprovacao_indicacao(NEW.empresa_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_materiais_check_indicacao ON public.materiais;
CREATE TRIGGER trg_materiais_check_indicacao
  AFTER INSERT OR UPDATE OF status ON public.materiais
  FOR EACH ROW EXECUTE FUNCTION public.materiais_check_indicacao();

-- 10. Expirar trials vencidos (chamada por cron ou admin)
CREATE OR REPLACE FUNCTION public.expirar_premiums_trial()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_id uuid;
  qtd int;
BEGIN
  SELECT id INTO free_id FROM public.planos WHERE slug = 'free' LIMIT 1;

  WITH expiradas AS (
    UPDATE public.empresas
       SET plano_id = free_id,
           plano_vencimento = NULL,
           premium_trial_fim = NULL
     WHERE premium_trial_fim IS NOT NULL
       AND premium_trial_fim < now()
     RETURNING id
  )
  SELECT count(*) INTO qtd FROM expiradas;

  UPDATE public.indicacoes
     SET status = 'expirada'
   WHERE status IN ('cadastrada')
     AND premium_fim < now();

  RETURN qtd;
END $$;

GRANT EXECUTE ON FUNCTION public.expirar_premiums_trial() TO authenticated, service_role;

-- 11. Métricas agregadas por vendedor
CREATE OR REPLACE FUNCTION public.vendedor_metrics(_vendedor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cliques int;
  cadastros int;
  aprovados int;
  premiums_ativos int;
  valor_total numeric;
  valor_pago numeric;
  valor_pendente numeric;
BEGIN
  SELECT count(*) INTO cliques FROM public.vendedor_cliques WHERE vendedor_id = _vendedor_id;
  SELECT count(*) INTO cadastros FROM public.indicacoes WHERE vendedor_id = _vendedor_id;
  SELECT count(*) INTO aprovados FROM public.indicacoes WHERE vendedor_id = _vendedor_id AND status = 'aprovada';
  SELECT count(*) INTO premiums_ativos FROM public.indicacoes i
    JOIN public.empresas e ON e.id = i.empresa_id
    WHERE i.vendedor_id = _vendedor_id AND e.premium_trial_fim IS NOT NULL AND e.premium_trial_fim > now();
  SELECT coalesce(sum(comissao_valor),0) INTO valor_total FROM public.indicacoes WHERE vendedor_id = _vendedor_id AND status = 'aprovada';
  SELECT coalesce(sum(comissao_valor),0) INTO valor_pago FROM public.indicacoes WHERE vendedor_id = _vendedor_id AND status = 'aprovada' AND paga = true;
  valor_pendente := valor_total - valor_pago;

  RETURN jsonb_build_object(
    'cliques', cliques,
    'cadastros', cadastros,
    'aprovados', aprovados,
    'premiums_ativos', premiums_ativos,
    'valor_total', valor_total,
    'valor_pago', valor_pago,
    'valor_pendente', valor_pendente
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vendedor_metrics(uuid) TO authenticated;
