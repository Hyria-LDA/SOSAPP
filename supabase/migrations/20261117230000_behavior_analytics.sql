BEGIN;
CREATE TABLE IF NOT EXISTS public.behavior_events (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL, event text NOT NULL CHECK(event IN ('app_open','page_view','action','notification_open','publish_success','signup_complete','search_result')),
 screen text NOT NULL, action text NOT NULL DEFAULT '', platform text NOT NULL,
 estado text NOT NULL DEFAULT '', cidade text NOT NULL DEFAULT '',
 occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS behavior_date ON public.behavior_events(occurred_at);
CREATE INDEX IF NOT EXISTS behavior_region_date ON public.behavior_events(estado,cidade,occurred_at);
CREATE INDEX IF NOT EXISTS behavior_user_received ON public.behavior_events(user_id,received_at);
ALTER TABLE public.behavior_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.behavior_events FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_behavior_events(_events jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); item jsonb; uf text; city text; total integer:=0; affected integer; stamp timestamptz;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 -- Administrative activity must not inflate customer demand.
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=uid AND role::text IN ('admin','vendedor','store_partner')) THEN RETURN 0; END IF;
 IF jsonb_typeof(_events)<>'array' OR jsonb_array_length(_events)>30 THEN RAISE EXCEPTION 'invalid_batch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 794));
 IF (SELECT count(*) FROM public.behavior_events WHERE user_id=uid AND received_at>now()-interval '1 minute') + jsonb_array_length(_events)>120 THEN RETURN 0; END IF;
 SELECT upper(trim(coalesce(estado,''))),trim(coalesce(cidade,'')) INTO uf,city FROM public.empresas WHERE owner_id=uid LIMIT 1;
 FOR item IN SELECT value FROM jsonb_array_elements(_events) LOOP
  IF coalesce(item->>'event','') NOT IN ('app_open','page_view','action','notification_open','publish_success','signup_complete','search_result')
   OR coalesce(item->>'screen','') NOT IN ('inicio','buscar','anunciar','material','pedidos','estoque','perfil','notificacoes','cadastro','outros')
   OR coalesce(item->>'action','') NOT IN ('','buscar_material','anunciar_sobra','filtrar','contato','salvar','notificacoes','push','inbox','toast','com_resultados','sem_resultados')
   OR coalesce(item->>'platform','') NOT IN ('web','ios','android') THEN CONTINUE; END IF;
  BEGIN
   stamp:=(item->>'at')::timestamptz;
   IF stamp IS NULL OR stamp<now()-interval '1 day' OR stamp>now()+interval '5 minutes' THEN CONTINUE; END IF;
   INSERT INTO public.behavior_events(id,user_id,session_id,event,screen,action,platform,estado,cidade,occurred_at)
   VALUES((item->>'id')::uuid,uid,(item->>'session')::uuid,item->>'event',item->>'screen',coalesce(item->>'action',''),item->>'platform',coalesce(uf,''),coalesce(city,''),stamp)
   ON CONFLICT(id) DO NOTHING;
   GET DIAGNOSTICS affected=ROW_COUNT; total:=total+affected;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN CONTINUE;
  END;
 END LOOP;
 RETURN total;
END; $$;
REVOKE ALL ON FUNCTION public.record_behavior_events(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_behavior_events(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_behavior_report(_days integer DEFAULT 30,_state text DEFAULT '',_city text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
 WITH filtered AS (
 SELECT * FROM public.behavior_events WHERE occurred_at>=now()-make_interval(days=>greatest(1,least(coalesce(_days,30),90)))
 AND (coalesce(_state,'')='' OR estado=_state) AND (coalesce(_city,'')='' OR cidade=_city)
 )
 SELECT jsonb_build_object(
 'users',(SELECT count(DISTINCT user_id) FROM filtered),
 'sessions',(SELECT count(DISTINCT (user_id,session_id)) FROM filtered),
 'opens',(SELECT count(*) FROM filtered WHERE event='app_open'),
 'notification_opens',(SELECT count(*) FROM filtered WHERE event='notification_open'),
 'notification_users',(SELECT count(DISTINCT user_id) FROM filtered WHERE event='notification_open'),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT event,screen,action,count(*) AS total,count(DISTINCT user_id) AS users FROM filtered GROUP BY event,screen,action ORDER BY count(*) DESC LIMIT 100)t),'[]'::jsonb),
 'hours',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY hour) FROM (SELECT extract(hour FROM occurred_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,count(*) AS total FROM filtered WHERE event='app_open' GROUP BY 1)t),'[]'::jsonb),
 'daily',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY day) FROM (SELECT (occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,count(DISTINCT user_id) AS users FROM filtered GROUP BY 1)t),'[]'::jsonb),
 'regions',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT estado,cidade,count(DISTINCT user_id) AS users,count(*) FILTER(WHERE event='notification_open') AS notification_opens FROM filtered GROUP BY estado,cidade ORDER BY count(DISTINCT user_id) DESC LIMIT 500)t),'[]'::jsonb),
 'options',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT DISTINCT estado,cidade FROM public.behavior_events WHERE occurred_at>=now()-interval '90 days' ORDER BY estado,cidade)t),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.admin_behavior_report(integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_behavior_report(integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_behavior_events() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 DELETE FROM public.behavior_events WHERE occurred_at<now()-interval '90 days';
$$;
REVOKE ALL ON FUNCTION public.purge_behavior_events() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purge_behavior_events() TO service_role;
-- Retention scheduler (required in production).
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  RAISE EXCEPTION 'Ative a extensao pg_cron no Supabase antes de executar este SQL (limpeza diaria das metricas).';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='purge-behavior-events') THEN
   PERFORM cron.schedule('purge-behavior-events','15 3 * * *','SELECT public.purge_behavior_events()');
  END IF;
 END IF;
END $$;
COMMIT;
