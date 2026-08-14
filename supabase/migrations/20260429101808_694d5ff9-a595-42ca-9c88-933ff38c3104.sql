-- Create public 'avatars' storage bucket for profile pictures
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, users manage their own folder (folder = user_id)
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Audit trigger for profile updates (full_name, avatar_url, department)
CREATE OR REPLACE FUNCTION public.log_profile_update_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN
    v_changes := v_changes || jsonb_build_object('full_name', jsonb_build_object('from', OLD.full_name, 'to', NEW.full_name));
  END IF;
  IF OLD.department IS DISTINCT FROM NEW.department THEN
    v_changes := v_changes || jsonb_build_object('department', jsonb_build_object('from', OLD.department, 'to', NEW.department));
  END IF;
  IF OLD.avatar_url IS DISTINCT FROM NEW.avatar_url THEN
    v_changes := v_changes || jsonb_build_object('avatar_url', jsonb_build_object('from', OLD.avatar_url, 'to', NEW.avatar_url));
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    PERFORM public.log_system_audit(
      auth.uid(),
      'profile_updated',
      'data_modification',
      'profile',
      NEW.id,
      jsonb_build_object(
        'target_user_id', NEW.user_id,
        'target_email', NEW.email,
        'changes', v_changes
      ),
      'low'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_profile_update_audit ON public.profiles;
CREATE TRIGGER trg_log_profile_update_audit
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_profile_update_audit();

-- RPC for users to log their own password change events to system_audit_logs
CREATE OR REPLACE FUNCTION public.log_password_change_event()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_user;
  v_id := public.log_system_audit(
    v_user,
    'password_changed',
    'authentication',
    'profile',
    NULL,
    jsonb_build_object('email', v_email, 'self_service', true),
    'medium'
  );
  RETURN v_id;
END;
$$;