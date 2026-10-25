-- Diagnóstico somente de leitura. Não envia mensagens nem altera registros.
-- Não retorna tokens, chaves, telefones ou conteúdo das mensagens.
SELECT jsonb_build_object(
  'fila_de_buscas', (SELECT jsonb_build_object(
    'aguardando', count(*),
    'atrasados', count(*) FILTER (WHERE deliver_at < now() - interval '5 minutes'),
    'proximo_envio', min(deliver_at)
  ) FROM public.match_notifications_queue),
  'buscas_ativas', (SELECT count(*) FROM public.pedidos_material WHERE status = 'ativo'),
  'correcao_brilhante_instalada', (SELECT position('ultra' IN
    pg_get_functiondef('public.is_brilhante_user(uuid)'::regprocedure)) > 0),
  'aparelhos', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (
    SELECT platform AS plataforma, active AS ativo, count(*) AS quantidade,
           max(last_seen_at) AS ultimo_registro
    FROM public.push_tokens GROUP BY platform, active
  ) t),
  'ultimos_envios_manuais', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (
    SELECT created_at AS data, target AS publico, total_tokens AS aparelhos,
           success_count AS aceitos_pelo_firebase, failure_count AS falhas
    FROM public.push_broadcasts ORDER BY created_at DESC LIMIT 10
  ) t),
  'notificacoes_ultimos_7_dias', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (
    SELECT tipo, count(*) AS quantidade, max(created_at) AS ultima
    FROM public.notificacoes WHERE created_at > now() - interval '7 days' GROUP BY tipo
  ) t),
  'gatilhos', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (
    SELECT c.relname AS tabela, g.tgname AS gatilho, g.tgenabled AS habilitado,
           n.nspname AS esquema_funcao, p.proname AS funcao
    FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid
    JOIN pg_proc p ON p.oid=g.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE NOT g.tgisinternal AND g.tgrelid IN
      ('public.notificacoes'::regclass, 'public.materiais'::regclass, 'public.pedidos_material'::regclass)
  ) t)
) AS diagnostico;

-- Execute esta segunda consulta separadamente para verificar o agendamento.
-- Se cron.job nao existir, o agendador ainda nao esta instalado neste projeto.
SELECT j.jobname, j.schedule, j.active,
       d.status AS ultima_execucao_status, d.start_time AS ultima_execucao,
       d.end_time AS termino
FROM cron.job j
LEFT JOIN LATERAL (
  SELECT status, start_time, end_time FROM cron.job_run_details
  WHERE jobid = j.jobid ORDER BY start_time DESC LIMIT 1
) d ON true
WHERE j.jobname = 'release-delayed-match-notifications';
