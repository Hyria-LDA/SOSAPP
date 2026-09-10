-- Diferencia o padrao Gianduia da Linha Trama das demais versoes Duratex.
-- A atualizacao preserva o mesmo ID e, portanto, os anuncios ja cadastrados.
UPDATE public.padroes AS p
SET
  nome = 'Gianduia - Trama',
  categoria = 'Linha Trama'
FROM public.fabricantes AS f
WHERE p.fabricante_id = f.id
  AND lower(f.nome) = 'duratex'
  AND p.nome = 'Gianduia';
