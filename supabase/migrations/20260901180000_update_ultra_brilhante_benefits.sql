-- Mantém os recursos atuais e acrescenta os novos benefícios sem duplicá-los.
UPDATE public.planos
SET recursos = COALESCE(recursos, '[]'::jsonb) || '["Sorteio de brindes exclusivos"]'::jsonb
WHERE slug = 'ultra'
  AND NOT COALESCE(recursos, '[]'::jsonb) @> '["Sorteio de brindes exclusivos"]'::jsonb;

UPDATE public.planos
SET recursos = COALESCE(recursos, '[]'::jsonb) || '["Prioridade nos avisos automáticos"]'::jsonb
WHERE slug = 'premium'
  AND NOT COALESCE(recursos, '[]'::jsonb) @> '["Prioridade nos avisos automáticos"]'::jsonb;
