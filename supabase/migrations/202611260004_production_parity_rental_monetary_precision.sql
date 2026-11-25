BEGIN;
LOCK TABLE public.rental_leases, public.rental_payments IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM public.rental_leases WHERE monthly_rent <> round(monthly_rent,2) OR abs(monthly_rent)>=10000000000) OR EXISTS (SELECT 1 FROM public.rental_payments WHERE amount <> round(amount,2) OR abs(amount)>=10000000000) THEN RAISE EXCEPTION 'Incompatible monetary precision; abort without rounding'; END IF;
END $$;
ALTER TABLE public.rental_leases ALTER COLUMN monthly_rent TYPE numeric(12,2);
ALTER TABLE public.rental_payments ALTER COLUMN amount TYPE numeric(12,2);
COMMIT;
