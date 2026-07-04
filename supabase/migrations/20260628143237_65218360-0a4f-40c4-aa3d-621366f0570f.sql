DROP POLICY IF EXISTS "Fotos públicas para anon" ON public.fotos_materiais;

DROP POLICY IF EXISTS "rt read public table topics" ON realtime.messages;
CREATE POLICY "rt read public table topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (topic LIKE 'realtime:public:materiais%');