
-- 1) Tighten storage bucket read for "materiais"
DROP POLICY IF EXISTS "Materiais bucket leitura autenticada" ON storage.objects;
CREATE POLICY "Materiais bucket read scoped"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'materiais' AND (
    owner = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.fotos_materiais fm
      JOIN public.materiais m ON m.id = fm.material_id
      WHERE m.status = 'ativo'
        AND fm.url LIKE '%' || storage.objects.name
    )
  )
);

-- 2) Realtime channel authorization
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Allow public table-change topics (postgres_changes still gated by underlying table RLS)
DROP POLICY IF EXISTS "rt read public table topics" ON realtime.messages;
CREATE POLICY "rt read public table topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  topic LIKE 'realtime:public:materiais%'
  OR topic LIKE 'realtime:public:pedidos_material%'
);

-- Allow personal notification topics only when the topic ends with the user's id
DROP POLICY IF EXISTS "rt read own user topic" ON realtime.messages;
CREATE POLICY "rt read own user topic"
ON realtime.messages FOR SELECT TO authenticated
USING (
  topic LIKE 'realtime:public:notificacoes%'
  AND topic LIKE '%' || auth.uid()::text || '%'
);

-- Broadcast / presence: only allow channels namespaced with the user's id
DROP POLICY IF EXISTS "rt read own broadcast" ON realtime.messages;
CREATE POLICY "rt read own broadcast"
ON realtime.messages FOR SELECT TO authenticated
USING (
  topic LIKE 'user:' || auth.uid()::text || ':%'
);

DROP POLICY IF EXISTS "rt write own broadcast" ON realtime.messages;
CREATE POLICY "rt write own broadcast"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  topic LIKE 'user:' || auth.uid()::text || ':%'
);
