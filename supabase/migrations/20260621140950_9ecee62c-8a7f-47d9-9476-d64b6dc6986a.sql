
-- 1) Enum extensions for material_status
ALTER TYPE public.material_status ADD VALUE IF NOT EXISTS 'em_revisao';
ALTER TYPE public.material_status ADD VALUE IF NOT EXISTS 'suspenso';

-- 2) Empresas: penalty fields
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS pontos_penalidade integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspensa_ate timestamptz,
  ADD COLUMN IF NOT EXISTS advertencias integer NOT NULL DEFAULT 0;

-- 3) Denuncias table
CREATE TABLE IF NOT EXISTS public.denuncias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  denunciante_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('anuncio','empresa')),
  target_id uuid NOT NULL,
  material_id uuid REFERENCES public.materiais(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  categoria text NOT NULL,
  observacao text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','confirmada','rejeitada','descartada')),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_nota text,
  resolvida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (denunciante_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_denuncias_target ON public.denuncias(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_denuncias_status ON public.denuncias(status);
CREATE INDEX IF NOT EXISTS idx_denuncias_categoria ON public.denuncias(categoria);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.denuncias TO authenticated;
GRANT ALL ON public.denuncias TO service_role;

ALTER TABLE public.denuncias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario cria denuncia"
  ON public.denuncias FOR INSERT TO authenticated
  WITH CHECK (denunciante_id = auth.uid());

CREATE POLICY "Usuario ve suas denuncias ou admin ve tudo"
  ON public.denuncias FOR SELECT TO authenticated
  USING (denunciante_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin atualiza denuncia"
  ON public.denuncias FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin deleta denuncia"
  ON public.denuncias FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER denuncias_touch_updated_at
  BEFORE UPDATE ON public.denuncias
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) Trigger: ao inserir denuncia de anúncio, se 5+ na mesma categoria => suspende e notifica
CREATE OR REPLACE FUNCTION public.denuncia_auto_suspende_anuncio()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  qtd int;
  emp_owner uuid;
  mat_padrao text;
BEGIN
  IF NEW.target_type <> 'anuncio' OR NEW.material_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO qtd
    FROM public.denuncias
   WHERE material_id = NEW.material_id
     AND categoria = NEW.categoria
     AND status IN ('pendente','confirmada');

  IF qtd >= 5 THEN
    UPDATE public.materiais SET status = 'suspenso' WHERE id = NEW.material_id AND status <> 'suspenso';

    SELECT e.owner_id, m.padrao INTO emp_owner, mat_padrao
      FROM public.materiais m JOIN public.empresas e ON e.id = m.empresa_id
     WHERE m.id = NEW.material_id;

    IF emp_owner IS NOT NULL THEN
      INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem, material_id)
      VALUES (
        emp_owner, 'anuncio_suspenso',
        '⛔ Seu anúncio foi suspenso temporariamente',
        format('O anúncio "%s" foi suspenso após receber múltiplas denúncias e será analisado pela equipe.', coalesce(mat_padrao,'')),
        NEW.material_id
      );
    END IF;
  ELSIF qtd >= 3 THEN
    UPDATE public.materiais SET status = 'em_revisao'
      WHERE id = NEW.material_id AND status = 'ativo';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS denuncias_auto_suspende ON public.denuncias;
CREATE TRIGGER denuncias_auto_suspende
  AFTER INSERT ON public.denuncias
  FOR EACH ROW EXECUTE FUNCTION public.denuncia_auto_suspende_anuncio();

-- 5) Função admin: julgar denúncia (confirmar/rejeitar) e aplicar penalidades
CREATE OR REPLACE FUNCTION public.admin_julgar_denuncia(_denuncia_id uuid, _decisao text, _nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d RECORD;
  emp RECORD;
  novos_pontos int;
  acao text := 'nenhuma';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF _decisao NOT IN ('confirmada','rejeitada','descartada') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'decisao_invalida');
  END IF;

  SELECT * INTO d FROM public.denuncias WHERE id = _denuncia_id;
  IF d IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  UPDATE public.denuncias SET
    status = _decisao,
    admin_id = auth.uid(),
    admin_nota = _nota,
    resolvida_em = now()
  WHERE id = _denuncia_id;

  IF _decisao = 'confirmada' AND d.empresa_id IS NOT NULL THEN
    UPDATE public.empresas
       SET pontos_penalidade = pontos_penalidade + 1
     WHERE id = d.empresa_id
     RETURNING * INTO emp;

    novos_pontos := emp.pontos_penalidade;

    IF novos_pontos >= 10 THEN
      UPDATE public.empresas SET status = 'bloqueada' WHERE id = emp.id;
      UPDATE public.materiais SET status = 'suspenso' WHERE empresa_id = emp.id AND status = 'ativo';
      acao := 'bloqueada';
      INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem)
      VALUES (emp.owner_id, 'empresa_bloqueada',
              '🚫 Conta bloqueada', 'Sua empresa atingiu 10 pontos de penalidade e foi bloqueada.');
    ELSIF novos_pontos >= 5 THEN
      UPDATE public.empresas SET status = 'suspensa', suspensa_ate = now() + interval '7 days' WHERE id = emp.id;
      UPDATE public.materiais SET status = 'suspenso' WHERE empresa_id = emp.id AND status = 'ativo';
      acao := 'suspensa_7d';
      INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem)
      VALUES (emp.owner_id, 'empresa_suspensa',
              '⛔ Empresa suspensa por 7 dias', 'Sua empresa foi suspensa por 7 dias após acumular 5 pontos de penalidade.');
    ELSIF novos_pontos >= 3 THEN
      UPDATE public.empresas SET advertencias = advertencias + 1 WHERE id = emp.id;
      acao := 'advertida';
      INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem)
      VALUES (emp.owner_id, 'empresa_advertida',
              '⚠️ Advertência recebida', 'Sua empresa recebeu uma advertência por denúncias confirmadas.');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'acao', acao, 'pontos', COALESCE(novos_pontos, 0));
END $$;

-- 6) Função admin: ações diretas sobre anúncio
CREATE OR REPLACE FUNCTION public.admin_acao_anuncio(_material_id uuid, _acao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF _acao = 'reativar' THEN
    UPDATE public.materiais SET status = 'ativo' WHERE id = _material_id;
  ELSIF _acao = 'suspender' THEN
    UPDATE public.materiais SET status = 'suspenso' WHERE id = _material_id;
  ELSIF _acao = 'excluir' THEN
    DELETE FROM public.materiais WHERE id = _material_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'acao_invalida');
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;

-- 7) Função admin: ações sobre empresa
CREATE OR REPLACE FUNCTION public.admin_acao_empresa(_empresa_id uuid, _acao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  emp RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO emp FROM public.empresas WHERE id = _empresa_id;
  IF emp IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  IF _acao = 'advertir' THEN
    UPDATE public.empresas SET advertencias = advertencias + 1 WHERE id = _empresa_id;
    INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem)
    VALUES (emp.owner_id, 'empresa_advertida', '⚠️ Advertência', 'Sua empresa recebeu uma advertência da administração.');
  ELSIF _acao = 'suspender' THEN
    UPDATE public.empresas SET status = 'suspensa', suspensa_ate = now() + interval '7 days' WHERE id = _empresa_id;
    UPDATE public.materiais SET status = 'suspenso' WHERE empresa_id = _empresa_id AND status = 'ativo';
    INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem)
    VALUES (emp.owner_id, 'empresa_suspensa', '⛔ Empresa suspensa', 'Sua empresa foi suspensa por 7 dias.');
  ELSIF _acao = 'bloquear' THEN
    UPDATE public.empresas SET status = 'bloqueada' WHERE id = _empresa_id;
    UPDATE public.materiais SET status = 'suspenso' WHERE empresa_id = _empresa_id AND status = 'ativo';
    INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem)
    VALUES (emp.owner_id, 'empresa_bloqueada', '🚫 Empresa bloqueada', 'Sua empresa foi bloqueada pela administração.');
  ELSIF _acao = 'reativar' THEN
    UPDATE public.empresas SET status = 'ativa', suspensa_ate = NULL WHERE id = _empresa_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'acao_invalida');
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;
