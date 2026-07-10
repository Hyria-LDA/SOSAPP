-- Adiciona o novo beneficio comercial ao plano Brilhante.

UPDATE public.planos
SET recursos = (
  SELECT jsonb_agg(item)
  FROM (
    SELECT item
    FROM jsonb_array_elements_text(
      CASE
        WHEN recursos @> '["Sorteio de brindes exclusivos"]'::jsonb
          THEN recursos
        ELSE recursos || '["Sorteio de brindes exclusivos"]'::jsonb
      END
    ) AS item
  ) AS recursos_atualizados
)
WHERE slug = 'premium';
