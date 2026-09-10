-- Relatorio consolidado de todos os vendedores parceiros por periodo.
-- Mantem a mesma regra de datas usada pelo relatorio individual.

CREATE INDEX IF NOT EXISTS idx_vendedor_cliques_vendedor_created
  ON public.vendedor_cliques (vendedor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vendedor_instalacoes_vendedor_created
  ON public.vendedor_instalacoes (vendedor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_indicacoes_vendedor_created
  ON public.indicacoes (vendedor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_indicacoes_vendedor_conversao
  ON public.indicacoes (vendedor_id, primeira_conversao_em);

CREATE OR REPLACE FUNCTION public.admin_all_partners_report(
  _from_date date,
  _to_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  from_time timestamptz;
  until_time timestamptz;
BEGIN
  IF caller_id IS NULL OR NOT public.has_role(caller_id, 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF _from_date IS NULL OR _to_date IS NULL OR _from_date > _to_date THEN
    RAISE EXCEPTION 'Periodo invalido';
  END IF;

  from_time := _from_date::timestamptz;
  until_time := (_to_date + 1)::timestamptz;

  RETURN (
    WITH metricas AS (
      SELECT
        v.id,
        v.nome,
        v.codigo,
        v.ativo,
        (SELECT count(*)
           FROM public.vendedor_cliques c
          WHERE c.vendedor_id = v.id
            AND c.created_at >= from_time
            AND c.created_at < until_time) AS acessos,
        (SELECT count(*)
           FROM public.vendedor_instalacoes i
          WHERE i.vendedor_id = v.id
            AND i.created_at >= from_time
            AND i.created_at < until_time) AS instalacoes,
        (SELECT count(*)
           FROM public.vendedor_instalacoes i
          WHERE i.vendedor_id = v.id
            AND i.plataforma = 'android'
            AND i.created_at >= from_time
            AND i.created_at < until_time) AS instalacoes_android,
        (SELECT count(*)
           FROM public.vendedor_instalacoes i
          WHERE i.vendedor_id = v.id
            AND i.plataforma = 'ios'
            AND i.created_at >= from_time
            AND i.created_at < until_time) AS instalacoes_ios,
        (SELECT count(*)
           FROM public.indicacoes ind
          WHERE ind.vendedor_id = v.id
            AND ind.created_at >= from_time
            AND ind.created_at < until_time) AS cadastros,
        (SELECT count(*)
           FROM public.indicacoes ind
          WHERE ind.vendedor_id = v.id
            AND ind.primeira_conversao_em >= from_time
            AND ind.primeira_conversao_em < until_time) AS pagantes,
        (SELECT coalesce(sum(ind.comissao_valor), 0)
           FROM public.indicacoes ind
          WHERE ind.vendedor_id = v.id
            AND ind.primeira_conversao_em >= from_time
            AND ind.primeira_conversao_em < until_time) AS valor_total,
        (SELECT coalesce(sum(ind.comissao_valor), 0)
           FROM public.indicacoes ind
          WHERE ind.vendedor_id = v.id
            AND ind.paga = true
            AND ind.primeira_conversao_em >= from_time
            AND ind.primeira_conversao_em < until_time) AS valor_pago
      FROM public.vendedores_parceiros v
    )
    SELECT jsonb_build_object(
      'acessos', coalesce(sum(acessos), 0),
      'instalacoes', coalesce(sum(instalacoes), 0),
      'instalacoes_android', coalesce(sum(instalacoes_android), 0),
      'instalacoes_ios', coalesce(sum(instalacoes_ios), 0),
      'cadastros', coalesce(sum(cadastros), 0),
      'pagantes', coalesce(sum(pagantes), 0),
      'valor_total', coalesce(sum(valor_total), 0),
      'valor_pago', coalesce(sum(valor_pago), 0),
      'valor_pendente', coalesce(sum(valor_total - valor_pago), 0),
      'vendedores', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'nome', nome,
            'codigo', codigo,
            'ativo', ativo,
            'acessos', acessos,
            'instalacoes', instalacoes,
            'instalacoes_android', instalacoes_android,
            'instalacoes_ios', instalacoes_ios,
            'cadastros', cadastros,
            'pagantes', pagantes,
            'valor_total', valor_total,
            'valor_pago', valor_pago,
            'valor_pendente', valor_total - valor_pago
          )
          ORDER BY nome
        ),
        '[]'::jsonb
      )
    )
    FROM metricas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_all_partners_report(date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_all_partners_report(date, date)
  TO authenticated;
