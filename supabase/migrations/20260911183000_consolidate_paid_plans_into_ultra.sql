-- Consolida os planos pagos em um único Brilhante (slug técnico ultra), preservando vencimentos.
DO $$
DECLARE
  ultra_id uuid;
BEGIN
  SELECT id INTO ultra_id FROM public.planos WHERE slug = 'ultra' LIMIT 1;
  IF ultra_id IS NULL THEN
    RAISE EXCEPTION 'Plano Brilhante (slug ultra) não encontrado.';
  END IF;

  UPDATE public.planos
  SET nome = 'Brilhante',
      preco = 29.90,
      ativo = true,
      cor = 'purple',
      descricao = 'Plano completo para empresas que querem mais alcance',
      max_anuncios = -1,
      max_buscas = -1,
      max_alertas = -1,
      recursos = '["Sem propaganda", "Anúncios ilimitados", "Buscas automáticas ilimitadas", "Destaque visual nos resultados", "Selo Premium", "Possibilidade de aparecer na Home", "Sorteio de brindes exclusivos"]'::jsonb
  WHERE id = ultra_id;

  -- O cadastro passa para Brilhante; datas de início e vencimento permanecem intactas.
  UPDATE public.empresas e
  SET plano_id = ultra_id,
      plano = 'ultra'
  WHERE e.plano_id IN (SELECT id FROM public.planos WHERE slug IN ('tx', 'premium'))
     OR lower(COALESCE(e.plano, '')) IN ('tx', 'premium', 'brilhante');

  -- Planos antigos permanecem no histórico, mas não podem receber novas adesões.
  UPDATE public.planos SET ativo = false WHERE slug IN ('tx', 'premium');

  -- Segmentações antigas passam a atingir o novo plano único.
  UPDATE public.banners
  SET planos_alvo = ARRAY(
    SELECT DISTINCT CASE WHEN item IN ('tx', 'premium') THEN 'ultra' ELSE item END
    FROM unnest(COALESCE(planos_alvo, ARRAY[]::text[])) AS item
  )
  WHERE COALESCE(planos_alvo, ARRAY[]::text[]) && ARRAY['tx', 'premium']::text[];

  UPDATE public.notification_automation_schedules
  SET audience = 'plan_ultra', updated_at = now()
  WHERE audience IN ('plan_tx', 'plan_premium');
END $$;
