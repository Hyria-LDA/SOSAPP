
-- Banners gerenciados via admin
CREATE TABLE public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  subtitulo text,
  imagem_url text NOT NULL,
  link text,
  botao_texto text,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  data_inicio timestamptz,
  data_fim timestamptz,
  views integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.banners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.banners TO authenticated;
GRANT ALL ON public.banners TO service_role;

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- Leitura pública apenas dos banners ativos e dentro da janela
CREATE POLICY "Banners ativos são públicos"
  ON public.banners FOR SELECT
  TO anon, authenticated
  USING (
    ativo = true
    AND (data_inicio IS NULL OR data_inicio <= now())
    AND (data_fim IS NULL OR data_fim >= now())
  );

-- Admins podem ler tudo (inclusive inativos)
CREATE POLICY "Admins leem todos os banners"
  ON public.banners FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Apenas admins podem criar / editar / remover
CREATE POLICY "Admins inserem banners"
  ON public.banners FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins atualizam banners"
  ON public.banners FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins removem banners"
  ON public.banners FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_banners_updated_at
  BEFORE UPDATE ON public.banners
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_banners_ordem ON public.banners(ordem) WHERE ativo = true;

-- RPCs para incremento de métricas (SECURITY DEFINER, qualquer um pode chamar)
CREATE OR REPLACE FUNCTION public.increment_banner_view(_banner_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.banners SET views = views + 1 WHERE id = _banner_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_banner_click(_banner_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.banners SET clicks = clicks + 1 WHERE id = _banner_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_banner_view(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_banner_click(uuid) TO anon, authenticated;
