-- Mantem o valor da comissao das indicacoes sincronizado com o parceiro.
-- A comissao so entra nos totais quando a empresa vinculada esta ativa;
-- aqui apenas garantimos que o valor unitario vigente esteja preenchido.

UPDATE public.indicacoes AS i
SET
  comissao_valor = v.comissao_valor,
  updated_at = now()
FROM public.vendedores_parceiros AS v
WHERE v.id = i.vendedor_id
  AND i.paga IS NOT TRUE
  AND i.comissao_valor IS DISTINCT FROM v.comissao_valor;

CREATE OR REPLACE FUNCTION public.sync_partner_commission_to_unpaid_registrations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.comissao_valor IS DISTINCT FROM OLD.comissao_valor THEN
    UPDATE public.indicacoes
    SET
      comissao_valor = NEW.comissao_valor,
      updated_at = now()
    WHERE vendedor_id = NEW.id
      AND paga IS NOT TRUE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_partner_commission
  ON public.vendedores_parceiros;

CREATE TRIGGER trg_sync_partner_commission
AFTER UPDATE OF comissao_valor ON public.vendedores_parceiros
FOR EACH ROW
EXECUTE FUNCTION public.sync_partner_commission_to_unpaid_registrations();

REVOKE ALL ON FUNCTION public.sync_partner_commission_to_unpaid_registrations()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_current_partner_commission_on_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_commission numeric(10, 2);
BEGIN
  IF NEW.paga IS NOT TRUE THEN
    SELECT v.comissao_valor
    INTO current_commission
    FROM public.vendedores_parceiros AS v
    WHERE v.id = NEW.vendedor_id;

    IF current_commission IS NOT NULL THEN
      NEW.comissao_valor := current_commission;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_current_partner_commission
  ON public.indicacoes;

CREATE TRIGGER trg_set_current_partner_commission
BEFORE INSERT OR UPDATE OF vendedor_id ON public.indicacoes
FOR EACH ROW
EXECUTE FUNCTION public.set_current_partner_commission_on_registration();

REVOKE ALL ON FUNCTION public.set_current_partner_commission_on_registration()
  FROM PUBLIC, anon, authenticated;
