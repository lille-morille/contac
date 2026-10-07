CREATE TABLE public.contact_overlap_dismissals (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  other_contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, contact_id, other_contact_id),
  CHECK (contact_id <> other_contact_id)
);
ALTER TABLE public.contact_overlap_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_overlap_dismissals FROM anon, authenticated;
