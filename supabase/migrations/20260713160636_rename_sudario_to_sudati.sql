-- Corrige o nome da fabricante Sudario para Sudati sem perder referencias.

UPDATE public.fabricantes
SET nome = 'Sudati'
WHERE nome = 'Sudario';
