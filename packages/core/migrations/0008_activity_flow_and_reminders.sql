ALTER TABLE public.contact_activities
  ADD COLUMN transcript text NOT NULL DEFAULT '',
  ADD COLUMN missed_outcome text;

ALTER TABLE public.contact_activities
  ADD CONSTRAINT contact_activities_missed_outcome_check
  CHECK (
    missed_outcome IS NULL OR
    (kind = 'missed_phone' AND missed_outcome IN (
      'voicemail', 'busy', 'call_later', 'no_answer', 'no_signal'
    ))
  );

CREATE TABLE public.contact_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  due_at timestamptz NOT NULL,
  message text NOT NULL DEFAULT '',
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, contact_id) REFERENCES public.contacts(org_id, id) ON DELETE CASCADE
);
CREATE INDEX contact_reminders_owner_due_idx
  ON public.contact_reminders(org_id, user_id, due_at)
  WHERE dismissed_at IS NULL;

ALTER TABLE public.contact_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_reminders_owner_select ON public.contact_reminders
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.can_read_team(org_id));
GRANT SELECT ON public.contact_reminders TO authenticated;
