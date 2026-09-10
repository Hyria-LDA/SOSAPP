-- A comissao do parceiro e devida por cadastro ativo, nao apenas por assinatura paga.

-- Ao definir ou alterar a comissao, aplica o novo valor aos cadastros ainda nao pagos.
UPDATE public.indicacoes i
SET comissao_valor = v.comissao_valor
FROM public.vendedores_parceiros v
WHERE v.id = i.vendedor_id AND i.paga = false;

CREATE OR REPLACE FUNCTION public.sync_partner_commission_to_unpaid_registrations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.comissao_valor IS DISTINCT FROM OLD.comissao_valor THEN
    UPDATE public.indicacoes
    SET comissao_valor = NEW.comissao_valor
    WHERE vendedor_id = NEW.id AND paga = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_partner_commission
  ON public.vendedores_parceiros;
CREATE TRIGGER trg_sync_partner_commission
AFTER UPDATE OF comissao_valor ON public.vendedores_parceiros
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_commission_to_unpaid_registrations();

CREATE OR REPLACE FUNCTION public.vendedor_metrics(_vendedor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'comissao_por_cadastro', (SELECT comissao_valor FROM public.vendedores_parceiros WHERE id = _vendedor_id),
    'cliques', (SELECT count(*) FROM public.vendedor_cliques WHERE vendedor_id = _vendedor_id),
    'acessos', (SELECT count(*) FROM public.vendedor_cliques WHERE vendedor_id = _vendedor_id),
    'instalacoes', (SELECT count(*) FROM public.vendedor_instalacoes WHERE vendedor_id = _vendedor_id),
    'instalacoes_android', (SELECT count(*) FROM public.vendedor_instalacoes WHERE vendedor_id = _vendedor_id AND plataforma = 'android'),
    'instalacoes_ios', (SELECT count(*) FROM public.vendedor_instalacoes WHERE vendedor_id = _vendedor_id AND plataforma = 'ios'),
    'cadastros', (SELECT count(*) FROM public.indicacoes WHERE vendedor_id = _vendedor_id),
    'cadastros_ativos', (
      SELECT count(*) FROM public.indicacoes i
      JOIN public.empresas e ON e.id = i.empresa_id
      WHERE i.vendedor_id = _vendedor_id AND e.status = 'ativa'
    ),
    'pagantes', (SELECT count(*) FROM public.indicacoes WHERE vendedor_id = _vendedor_id AND primeira_conversao_em IS NOT NULL),
    'aprovados', (SELECT count(*) FROM public.indicacoes WHERE vendedor_id = _vendedor_id AND primeira_conversao_em IS NOT NULL),
    'planos_pagos_ativos', (SELECT count(DISTINCT i.empresa_id) FROM public.indicacoes i WHERE i.vendedor_id = _vendedor_id AND (EXISTS (SELECT 1 FROM public.revenuecat_subscriptions r WHERE r.empresa_id = i.empresa_id AND r.status = 'active') OR EXISTS (SELECT 1 FROM public.financeiro f JOIN public.planos p ON p.id = f.plano_id WHERE f.empresa_id = i.empresa_id AND f.status = 'pago' AND f.valor > 0 AND f.vencimento > now() AND p.slug <> 'free'))),
    'premiums_ativos', (SELECT count(DISTINCT i.empresa_id) FROM public.indicacoes i WHERE i.vendedor_id = _vendedor_id AND (EXISTS (SELECT 1 FROM public.revenuecat_subscriptions r WHERE r.empresa_id = i.empresa_id AND r.status = 'active') OR EXISTS (SELECT 1 FROM public.financeiro f JOIN public.planos p ON p.id = f.plano_id WHERE f.empresa_id = i.empresa_id AND f.status = 'pago' AND f.valor > 0 AND f.vencimento > now() AND p.slug <> 'free'))),
    'valor_total', (
      SELECT coalesce(sum(i.comissao_valor), 0) FROM public.indicacoes i
      JOIN public.empresas e ON e.id = i.empresa_id
      WHERE i.vendedor_id = _vendedor_id AND e.status = 'ativa'
    ),
    'valor_pago', (
      SELECT coalesce(sum(i.comissao_valor), 0) FROM public.indicacoes i
      JOIN public.empresas e ON e.id = i.empresa_id
      WHERE i.vendedor_id = _vendedor_id AND e.status = 'ativa' AND i.paga = true
    ),
    'valor_pendente', (
      SELECT coalesce(sum(i.comissao_valor) FILTER (WHERE NOT i.paga), 0)
      FROM public.indicacoes i
      JOIN public.empresas e ON e.id = i.empresa_id
      WHERE i.vendedor_id = _vendedor_id AND e.status = 'ativa'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vendedor_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendedor_metrics(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_partner_report(
  _vendedor_id uuid,
  _from_date date,
  _to_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  from_time timestamptz;
  until_time timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF _from_date IS NULL OR _to_date IS NULL OR _from_date > _to_date THEN
    RAISE EXCEPTION 'Periodo invalido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendedores_parceiros WHERE id = _vendedor_id) THEN
    RAISE EXCEPTION 'Vendedor nao encontrado';
  END IF;

  from_time := _from_date::timestamptz;
  until_time := (_to_date + 1)::timestamptz;

  RETURN jsonb_build_object(
    'comissao_por_cadastro', (SELECT comissao_valor FROM public.vendedores_parceiros WHERE id = _vendedor_id),
    'acessos', (SELECT count(*) FROM public.vendedor_cliques WHERE vendedor_id = _vendedor_id AND created_at >= from_time AND created_at < until_time),
    'instalacoes', (SELECT count(*) FROM public.vendedor_instalacoes WHERE vendedor_id = _vendedor_id AND created_at >= from_time AND created_at < until_time),
    'instalacoes_android', (SELECT count(*) FROM public.vendedor_instalacoes WHERE vendedor_id = _vendedor_id AND plataforma = 'android' AND created_at >= from_time AND created_at < until_time),
    'instalacoes_ios', (SELECT count(*) FROM public.vendedor_instalacoes WHERE vendedor_id = _vendedor_id AND plataforma = 'ios' AND created_at >= from_time AND created_at < until_time),
    'cadastros', (SELECT count(*) FROM public.indicacoes WHERE vendedor_id = _vendedor_id AND created_at >= from_time AND created_at < until_time),
    'cadastros_ativos', (
      SELECT count(*) FROM public.indicacoes i
      JOIN public.empresas e ON e.id = i.empresa_id
      WHERE i.vendedor_id = _vendedor_id AND e.status = 'ativa'
        AND i.created_at >= from_time AND i.created_at < until_time
    ),
    'pagantes', (SELECT count(*) FROM public.indicacoes WHERE vendedor_id = _vendedor_id AND primeira_conversao_em >= from_time AND primeira_conversao_em < until_time),
    'valor_total', (
      SELECT coalesce(sum(i.comissao_valor), 0) FROM public.indicacoes i
      JOIN public.empresas e ON e.id = i.empresa_id
      WHERE i.vendedor_id = _vendedor_id AND e.status = 'ativa'
        AND i.created_at >= from_time AND i.created_at < until_time
    ),
    'valor_pago', (
      SELECT coalesce(sum(i.comissao_valor), 0) FROM public.indicacoes i
      JOIN public.empresas e ON e.id = i.empresa_id
      WHERE i.vendedor_id = _vendedor_id AND e.status = 'ativa' AND i.paga = true
        AND i.created_at >= from_time AND i.created_at < until_time
    ),
    'valor_pendente', (
      SELECT coalesce(sum(i.comissao_valor) FILTER (WHERE NOT i.paga), 0)
      FROM public.indicacoes i
      JOIN public.empresas e ON e.id = i.empresa_id
      WHERE i.vendedor_id = _vendedor_id AND e.status = 'ativa'
        AND i.created_at >= from_time AND i.created_at < until_time
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_partner_report(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_partner_report(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_all_partners_report(_from_date date, _to_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  from_time timestamptz;
  until_time timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF _from_date IS NULL OR _to_date IS NULL OR _from_date > _to_date THEN
    RAISE EXCEPTION 'Periodo invalido';
  END IF;
  from_time := _from_date::timestamptz;
  until_time := (_to_date + 1)::timestamptz;

  RETURN (
    WITH metricas AS (
      SELECT v.id, v.nome, v.codigo, v.ativo, v.comissao_valor AS comissao_por_cadastro,
        (SELECT count(*) FROM public.vendedor_cliques c WHERE c.vendedor_id = v.id AND c.created_at >= from_time AND c.created_at < until_time) AS acessos,
        (SELECT count(*) FROM public.vendedor_instalacoes x WHERE x.vendedor_id = v.id AND x.created_at >= from_time AND x.created_at < until_time) AS instalacoes,
        (SELECT count(*) FROM public.vendedor_instalacoes x WHERE x.vendedor_id = v.id AND x.plataforma = 'android' AND x.created_at >= from_time AND x.created_at < until_time) AS instalacoes_android,
        (SELECT count(*) FROM public.vendedor_instalacoes x WHERE x.vendedor_id = v.id AND x.plataforma = 'ios' AND x.created_at >= from_time AND x.created_at < until_time) AS instalacoes_ios,
        (SELECT count(*) FROM public.indicacoes i WHERE i.vendedor_id = v.id AND i.created_at >= from_time AND i.created_at < until_time) AS cadastros,
        (SELECT count(*) FROM public.indicacoes i JOIN public.empresas e ON e.id = i.empresa_id WHERE i.vendedor_id = v.id AND e.status = 'ativa' AND i.created_at >= from_time AND i.created_at < until_time) AS cadastros_ativos,
        (SELECT count(*) FROM public.indicacoes i WHERE i.vendedor_id = v.id AND i.primeira_conversao_em >= from_time AND i.primeira_conversao_em < until_time) AS pagantes,
        (SELECT coalesce(sum(i.comissao_valor), 0) FROM public.indicacoes i JOIN public.empresas e ON e.id = i.empresa_id WHERE i.vendedor_id = v.id AND e.status = 'ativa' AND i.created_at >= from_time AND i.created_at < until_time) AS valor_total,
        (SELECT coalesce(sum(i.comissao_valor), 0) FROM public.indicacoes i JOIN public.empresas e ON e.id = i.empresa_id WHERE i.vendedor_id = v.id AND e.status = 'ativa' AND i.paga = true AND i.created_at >= from_time AND i.created_at < until_time) AS valor_pago
      FROM public.vendedores_parceiros v
    )
    SELECT jsonb_build_object(
      'acessos', coalesce(sum(acessos), 0),
      'instalacoes', coalesce(sum(instalacoes), 0),
      'instalacoes_android', coalesce(sum(instalacoes_android), 0),
      'instalacoes_ios', coalesce(sum(instalacoes_ios), 0),
      'cadastros', coalesce(sum(cadastros), 0),
      'cadastros_ativos', coalesce(sum(cadastros_ativos), 0),
      'pagantes', coalesce(sum(pagantes), 0),
      'valor_total', coalesce(sum(valor_total), 0),
      'valor_pago', coalesce(sum(valor_pago), 0),
      'valor_pendente', coalesce(sum(valor_total - valor_pago), 0),
      'vendedores', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'nome', nome, 'codigo', codigo, 'ativo', ativo,
        'comissao_por_cadastro', comissao_por_cadastro,
        'acessos', acessos, 'instalacoes', instalacoes,
        'instalacoes_android', instalacoes_android, 'instalacoes_ios', instalacoes_ios,
        'cadastros', cadastros, 'cadastros_ativos', cadastros_ativos, 'pagantes', pagantes,
        'valor_total', valor_total, 'valor_pago', valor_pago,
        'valor_pendente', valor_total - valor_pago
      ) ORDER BY nome), '[]'::jsonb)
    ) FROM metricas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_all_partners_report(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_all_partners_report(date, date) TO authenticated;
