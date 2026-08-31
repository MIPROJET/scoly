-- 1. Prevent privilege escalation on user_roles
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  AND (role::text <> 'super_admin' OR has_role(auth.uid(), 'super_admin'))
);

CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  AND (role::text <> 'super_admin' OR has_role(auth.uid(), 'super_admin'))
)
WITH CHECK (
  has_role(auth.uid(), 'admin')
  AND (role::text <> 'super_admin' OR has_role(auth.uid(), 'super_admin'))
);

CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  AND (role::text <> 'super_admin' OR has_role(auth.uid(), 'super_admin'))
);

-- 2. Revoke EXECUTE on internal SECURITY DEFINER functions from API roles
DO $$
DECLARE r record;
BEGIN
  -- trigger / event-trigger functions are never meant to be called via the API
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND t.typname IN ('trigger', 'event_trigger')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', r.sig);
  END LOOP;
END $$;

-- internal-only helpers
REVOKE ALL ON FUNCTION public.mark_email_sent(uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_email_failed(uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.emit_sync_signal(text, text, uuid, uuid, jsonb, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mp_rls_test_report() FROM anon, authenticated;

-- admin RPCs: signed-in only (authorization enforced inside the functions)
REVOKE ALL ON FUNCTION public.admin_list_access_requests() FROM anon;
REVOKE ALL ON FUNCTION public.admin_update_access_request(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.go_is_admin(uuid) FROM anon;
