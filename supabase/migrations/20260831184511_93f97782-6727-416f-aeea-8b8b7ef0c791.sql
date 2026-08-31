-- 1. Withdrawal amount server-side validation
CREATE OR REPLACE FUNCTION public.guard_withdrawal_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_available NUMERIC;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Montant de retrait invalide';
  END IF;

  -- Admins may create requests on behalf of users (validated manually).
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Lock pending/processing rows of this user to avoid concurrent over-withdrawal.
  PERFORM 1 FROM public.withdrawal_requests
   WHERE user_id = NEW.user_id FOR UPDATE;

  SELECT available INTO v_available FROM public.get_referral_balance(NEW.user_id);

  -- Pending / non-counted requests also consume the balance.
  v_available := COALESCE(v_available, 0) - COALESCE((
    SELECT SUM(amount) FROM public.withdrawal_requests
     WHERE user_id = NEW.user_id AND status = 'pending'
  ), 0);

  IF NEW.amount > v_available THEN
    RAISE EXCEPTION 'Montant demandé supérieur au solde disponible';
  END IF;

  NEW.status := 'pending';
  NEW.processed_by := NULL;
  NEW.processed_at := NULL;
  NEW.validated_by := NULL;
  NEW.validated_at := NULL;
  NEW.paid_at := NULL;
  NEW.rejection_reason := NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_withdrawal_request_insert() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_withdrawal_request_insert ON public.withdrawal_requests;
CREATE TRIGGER trg_guard_withdrawal_request_insert
BEFORE INSERT ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawal_request_insert();

-- 2. Referent application insert hardening
CREATE OR REPLACE FUNCTION public.guard_referent_application_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_commercial BOOLEAN;
  v_is_referent BOOLEAN;
BEGIN
  IF public.has_role(v_uid, 'super_admin'::app_role)
     OR public.has_role(v_uid, 'admin'::app_role)
     OR public.has_role(v_uid, 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL OR NEW.submitted_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  v_is_commercial := public.has_role(v_uid, 'commercial'::app_role);
  v_is_referent := public.has_role(v_uid, 'referent'::app_role);

  IF NOT (v_is_commercial OR v_is_referent) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Server decides the workflow fields; client values are ignored.
  IF v_is_commercial THEN
    NEW.submitted_role := 'commercial';
    NEW.sponsor_referent_id := NULL;
    NEW.assigned_commercial_id := v_uid;
    NEW.status := 'submitted';
  ELSE
    NEW.submitted_role := 'referent';
    NEW.sponsor_referent_id := v_uid;
    NEW.assigned_commercial_id := CASE
      WHEN NEW.zone_id IS NOT NULL THEN public.pick_available_commercial(NEW.zone_id)
      ELSE NULL
    END;
    NEW.status := 'pending';
  END IF;

  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.created_user_id := NULL;
  NEW.rejection_reason := NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_referent_application_insert() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_referent_application_insert ON public.referent_applications;
CREATE TRIGGER trg_guard_referent_application_insert
BEFORE INSERT ON public.referent_applications
FOR EACH ROW EXECUTE FUNCTION public.guard_referent_application_insert();

-- 3. Restrict internal permission matrix reads
DROP POLICY IF EXISTS "Authenticated staff read role permissions" ON public.role_permissions;
CREATE POLICY "Admins read role permissions"
ON public.role_permissions
FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR public.has_role((SELECT auth.uid()), 'admin'::app_role)
  OR public.has_role((SELECT auth.uid()), 'moderator'::app_role)
);