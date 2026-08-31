-- 1. internal_messages: prevent tampering with sent content
CREATE OR REPLACE FUNCTION public.guard_internal_message_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.content IS DISTINCT FROM OLD.content
     OR NEW.subject IS DISTINCT FROM OLD.subject
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Message content cannot be modified after sending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_internal_message_update ON public.internal_messages;
CREATE TRIGGER guard_internal_message_update
BEFORE UPDATE ON public.internal_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_internal_message_update();

DROP POLICY IF EXISTS "Users can update their own messages" ON public.internal_messages;
CREATE POLICY "Participants can mark messages read"
ON public.internal_messages
FOR UPDATE
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id)
WITH CHECK (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- 2. referent_applications: applicants cannot rewrite routing/assignment fields
CREATE OR REPLACE FUNCTION public.guard_referent_application_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'super_admin')
     OR public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'moderator')
     OR OLD.assigned_commercial_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_commercial_id IS DISTINCT FROM OLD.assigned_commercial_id
     OR NEW.sponsor_referent_id IS DISTINCT FROM OLD.sponsor_referent_id
     OR NEW.zone_id IS DISTINCT FROM OLD.zone_id
     OR NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
     OR NEW.submitted_role IS DISTINCT FROM OLD.submitted_role
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.created_user_id IS DISTINCT FROM OLD.created_user_id
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only staff can modify assignment or status fields on an application';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_referent_application_update ON public.referent_applications;
CREATE TRIGGER guard_referent_application_update
BEFORE UPDATE ON public.referent_applications
FOR EACH ROW EXECUTE FUNCTION public.guard_referent_application_update();

-- 3. Tighten EXECUTE on SECURITY DEFINER helpers not meant for anonymous callers
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_internal_message_update() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_referent_application_update() FROM anon, authenticated;