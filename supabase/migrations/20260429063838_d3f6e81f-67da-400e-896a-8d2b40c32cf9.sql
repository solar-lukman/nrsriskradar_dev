-- Add updated_by tracking to forum_discussions and forum_posts; add is_locked to forum_posts
ALTER TABLE public.forum_discussions
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

-- Trigger to maintain updated_by / updated_at on edits
CREATE OR REPLACE FUNCTION public.set_forum_updated_meta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forum_discussions_updated_meta ON public.forum_discussions;
CREATE TRIGGER trg_forum_discussions_updated_meta
BEFORE UPDATE ON public.forum_discussions
FOR EACH ROW
EXECUTE FUNCTION public.set_forum_updated_meta();

DROP TRIGGER IF EXISTS trg_forum_posts_updated_meta ON public.forum_posts;
CREATE TRIGGER trg_forum_posts_updated_meta
BEFORE UPDATE ON public.forum_posts
FOR EACH ROW
EXECUTE FUNCTION public.set_forum_updated_meta();