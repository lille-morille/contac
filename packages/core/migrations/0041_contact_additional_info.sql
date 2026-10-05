CREATE TABLE public.contact_additional_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('agent', 'referral')),
  source_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  markdown text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_additional_info_contact_idx ON public.contact_additional_info(org_id, contact_id);
ALTER TABLE public.contact_additional_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_additional_info_team_select ON public.contact_additional_info
  FOR SELECT TO authenticated USING (public.can_read_team(org_id));
GRANT SELECT ON public.contact_additional_info TO authenticated;

ALTER TABLE public.search_chunks DROP CONSTRAINT search_chunks_source_kind_check;
ALTER TABLE public.search_chunks ADD CONSTRAINT search_chunks_source_kind_check
  CHECK (source_kind IN ('contact', 'activity', 'note', 'additional_info'));
