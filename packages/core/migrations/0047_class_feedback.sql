CREATE TABLE public.class_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.class_spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ny_funksjonalitet', 'justering', 'bug_feil')),
  content text NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  CONSTRAINT class_feedback_completion_check CHECK (
    (completed_at IS NULL AND completed_by IS NULL AND acknowledged_at IS NULL)
    OR (completed_at IS NOT NULL)
  )
);
CREATE INDEX class_feedback_class_created_idx ON public.class_feedback(class_id, created_at);
CREATE INDEX class_feedback_user_inbox_idx ON public.class_feedback(user_id, completed_at);
ALTER TABLE public.class_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_feedback FROM anon, authenticated;
