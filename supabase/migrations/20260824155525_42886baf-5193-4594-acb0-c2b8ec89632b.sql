DO $$
DECLARE
  r record;
  internal_only text[] := ARRAY[
    'mark_email_sent','mark_email_failed','emit_sync_signal','mp_rls_test_report',
    'enqueue_user_email','increment_email_provider_usage','is_email_unsubscribed','pick_email_provider'
  ];
  anon_allowed text[] := ARRAY['unsubscribe_by_token','verify_certificate_public'];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type t ON t.oid = p.prorettype
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND d.objid IS NULL
      AND t.typname NOT IN ('trigger','event_trigger')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);

    IF NOT (r.proname = ANY(internal_only)) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;

    IF r.proname = ANY(anon_allowed) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
    END IF;
  END LOOP;

  -- trigger functions: no API role may execute them
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type t ON t.oid = p.prorettype
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND d.objid IS NULL
      AND t.typname IN ('trigger','event_trigger')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;
