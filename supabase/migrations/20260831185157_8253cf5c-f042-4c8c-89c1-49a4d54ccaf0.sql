CREATE OR REPLACE FUNCTION public.guard_schools_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  is_admin := public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'super_admin'::public.app_role);

  IF is_admin OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.admin_user_id := auth.uid();
    NEW.is_verified := false;
  ELSE
    NEW.admin_user_id := OLD.admin_user_id;
    NEW.is_verified := OLD.is_verified;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_schools_write() FROM anon, authenticated;

DROP TRIGGER IF EXISTS guard_schools_write_trg ON public.schools;
CREATE TRIGGER guard_schools_write_trg
BEFORE INSERT OR UPDATE ON public.schools
FOR EACH ROW EXECUTE FUNCTION public.guard_schools_write();