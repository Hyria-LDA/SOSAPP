-- Atualiza os planos do SOS Marceneiros no Supabase em producao.
-- Rode este arquivo no SQL Editor do Supabase.

ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS cor text DEFAULT 'gray',
  ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_anuncios integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_buscas integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_alertas integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_fotos integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS recursos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS planos_slug_uniq
ON public.planos(slug)
WHERE slug IS NOT NULL;

UPDATE public.planos
SET ativo = false
WHERE slug NOT IN ('free', 'tx', 'ultra', 'premium');

INSERT INTO public.planos (
  slug,
  nome,
  preco,
  duracao_dias,
  ativo,
  cor,
  ordem,
  descricao,
  max_anuncios,
  max_buscas,
  max_alertas,
  max_fotos,
  recursos
) VALUES
  (
    'free',
    'Free',
    0.00,
    36500,
    true,
    'gray',
    1,
    'Plano gratuito',
    10,
    1,
    1,
    3,
    '["Visualização de propaganda","Até 10 anúncios ativos","1 busca automática"]'::jsonb
  ),
  (
    'tx',
    'TX',
    19.90,
    30,
    true,
    'blue',
    2,
    'Plano TX',
    25,
    3,
    3,
    3,
    '["Visualização de propaganda","Até 25 anúncios ativos","3 buscas automáticas"]'::jsonb
  ),
  (
    'ultra',
    'Ultra',
    29.90,
    30,
    true,
    'purple',
    3,
    'Plano Ultra',
    50,
    10,
    10,
    3,
    '["Sem propaganda","Até 50 anúncios ativos","10 buscas automáticas"]'::jsonb
  ),
  (
    'premium',
    'Brilhante',
    39.90,
    30,
    true,
    'yellow',
    4,
    'Plano Brilhante',
    -1,
    50,
    50,
    3,
    '["Sem propaganda","Anúncio na tela inicial","Anúncios ilimitados","50 buscas automáticas","Destaque visual nos resultados","Selo Premium","Possibilidade de aparecer na Home"]'::jsonb
  )
ON CONFLICT (slug) WHERE slug IS NOT NULL
DO UPDATE SET
  nome = EXCLUDED.nome,
  preco = EXCLUDED.preco,
  duracao_dias = EXCLUDED.duracao_dias,
  ativo = EXCLUDED.ativo,
  cor = EXCLUDED.cor,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  max_anuncios = EXCLUDED.max_anuncios,
  max_buscas = EXCLUDED.max_buscas,
  max_alertas = EXCLUDED.max_alertas,
  max_fotos = EXCLUDED.max_fotos,
  recursos = EXCLUDED.recursos,
  updated_at = now();

UPDATE public.empresas e
SET plano_id = p.id,
    plano = p.slug
FROM public.planos p
WHERE e.plano IN ('plus', 'standard')
  AND p.slug = CASE e.plano
    WHEN 'plus' THEN 'tx'
    WHEN 'standard' THEN 'ultra'
  END;
