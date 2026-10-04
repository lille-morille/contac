CREATE TABLE public.favorite_contacts (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, contact_id),
  FOREIGN KEY (org_id, contact_id) REFERENCES public.contacts(org_id, id) ON DELETE CASCADE
);
CREATE INDEX favorite_contacts_org_user_idx ON public.favorite_contacts(org_id, user_id, created_at);

ALTER TABLE public.favorite_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY favorite_contacts_owner_select ON public.favorite_contacts FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.can_read_team(org_id));
GRANT SELECT ON public.favorite_contacts TO authenticated;
