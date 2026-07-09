-- Alinha os limites dos planos com a regra comercial exibida no app.
-- Free: 10 anúncios ativos e 1 busca/alerta automático.

UPDATE public.planos
SET
  preco = 0.00,
  max_anuncios = 10,
  max_buscas = 1,
  max_alertas = 1,
  max_fotos = 3,
  recursos = '["Visualização de propaganda", "Até 10 anúncios ativos", "1 busca automática"]'::jsonb
WHERE slug = 'free';

UPDATE public.planos
SET
  preco = 19.90,
  max_anuncios = 25,
  max_buscas = 3,
  max_alertas = 3,
  max_fotos = 3,
  recursos = '["Visualização de propaganda", "Até 25 anúncios ativos", "3 buscas automáticas"]'::jsonb
WHERE slug = 'tx';

UPDATE public.planos
SET
  preco = 29.90,
  max_anuncios = 50,
  max_buscas = 10,
  max_alertas = 10,
  max_fotos = 3,
  recursos = '["Sem propaganda", "Até 50 anúncios ativos", "10 buscas automáticas"]'::jsonb
WHERE slug = 'ultra';

UPDATE public.planos
SET
  nome = 'Brilhante',
  preco = 39.90,
  max_anuncios = -1,
  max_buscas = 50,
  max_alertas = 50,
  max_fotos = 3,
  recursos = '["Sem propaganda", "Anúncio na tela inicial", "Anúncios ilimitados", "50 buscas automáticas", "Destaque visual nos resultados", "Selo Premium", "Possibilidade de aparecer na Home"]'::jsonb
WHERE slug = 'premium';
