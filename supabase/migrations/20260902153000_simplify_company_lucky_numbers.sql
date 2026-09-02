-- Simplifica os numeros existentes para 1001, 1002, 1003... e mantem
-- uma sequencia unica para os proximos cadastros.
BEGIN;

LOCK TABLE public.empresas IN SHARE ROW EXCLUSIVE MODE;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY numero_sorte, created_at, id) AS position
  FROM public.empresas
)
UPDATE public.empresas AS company
SET numero_sorte = -ordered.position
FROM ordered
WHERE company.id = ordered.id;

UPDATE public.empresas
SET numero_sorte = 1000 + abs(numero_sorte)
WHERE numero_sorte < 0;

SELECT setval(
  'public.empresa_numero_sorte_seq',
  GREATEST((SELECT coalesce(max(numero_sorte), 1000) FROM public.empresas), 1000),
  true
);

ALTER TABLE public.empresas
  ALTER COLUMN numero_sorte
  SET DEFAULT nextval('public.empresa_numero_sorte_seq');

COMMIT;

