ALTER TABLE public.contact_activities
  ADD COLUMN export_owner_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

-- Existing sent drafts retain the contact on which the draft was created.
UPDATE public.contact_activities activity
SET export_owner_contact_id = draft.contact_id
FROM public.email_drafts draft
WHERE draft.activity_id = activity.id;

-- Older shared calls/meetings did not persist their creation contact. Choose a
-- deterministic existing link; members can correct the owner in the timeline.
UPDATE public.contact_activities activity
SET export_owner_contact_id = (
  SELECT link.contact_id
  FROM public.activity_contacts link
  WHERE link.activity_id = activity.id
  ORDER BY link.contact_id
  LIMIT 1
)
WHERE activity.export_owner_contact_id IS NULL;

CREATE INDEX contact_activities_export_owner_idx
  ON public.contact_activities(export_owner_contact_id);
