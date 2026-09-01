-- Fecha definitivamente a elegibilidade quando uma assinatura validada e criada.
-- A confirmacao vem da sincronizacao segura com o RevenueCat, nunca do cliente.

CREATE OR REPLACE FUNCTION public.mark_partner_store_trial_redeemed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active'
    AND NEW.empresa_id IS NOT NULL
    AND NEW.product_id IS NOT NULL THEN
    UPDATE public.partner_store_trial_eligibility
    SET redeemed_at = COALESCE(redeemed_at, now()),
        store_product_id = COALESCE(store_product_id, NEW.product_id),
        updated_at = now()
    WHERE empresa_id = NEW.empresa_id
      AND redeemed_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_partner_store_trial_redeemed
  ON public.revenuecat_subscriptions;
CREATE TRIGGER trg_mark_partner_store_trial_redeemed
AFTER INSERT OR UPDATE OF status, product_id
ON public.revenuecat_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.mark_partner_store_trial_redeemed();

REVOKE ALL ON FUNCTION public.mark_partner_store_trial_redeemed()
  FROM PUBLIC, anon, authenticated;

