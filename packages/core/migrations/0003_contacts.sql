-- Class, team, and contact domain. Existing organizations are tenant teams.
CREATE TABLE public.class_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX class_spaces_singleton ON public.class_spaces ((true));
CREATE TABLE public.class_memberships (
  class_id uuid NOT NULL REFERENCES public.class_spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, user_id)
);
CREATE INDEX class_memberships_user_idx ON public.class_memberships(user_id);

ALTER TABLE public.organizations ADD COLUMN class_id uuid REFERENCES public.class_spaces(id);
-- Preserve teams created with the generic scaffold in one migrated class.
INSERT INTO public.class_spaces (name)
SELECT 'Contac' WHERE EXISTS (SELECT 1 FROM public.organizations);
UPDATE public.organizations SET class_id = (SELECT id FROM public.class_spaces LIMIT 1) WHERE class_id IS NULL;
ALTER TABLE public.organizations ALTER COLUMN class_id SET NOT NULL;
CREATE INDEX organizations_class_idx ON public.organizations(class_id);
INSERT INTO public.class_memberships (class_id, user_id, role)
SELECT DISTINCT o.class_id, m.user_id,
  CASE WHEN m.user_id = (SELECT user_id FROM public.memberships WHERE role = 'owner' ORDER BY created_at LIMIT 1) THEN 'admin' ELSE 'member' END
FROM public.memberships m JOIN public.organizations o ON o.id = m.org_id
ON CONFLICT (class_id, user_id) DO UPDATE SET role =
  CASE WHEN EXCLUDED.role = 'admin' THEN 'admin' ELSE public.class_memberships.role END;
ALTER TABLE public.invitations ALTER COLUMN email DROP NOT NULL;

CREATE TYPE public.contact_status AS ENUM (
  'ikke_kontaktet', 'avsluttet', 'kan_kontaktes_igjen', 'skal_ringe',
  'venter_pa_svar', 'follow_up', 'ikke_kontakt_igjen', 'duplicate'
);
CREATE TYPE public.company_status AS ENUM (
  'ikke_relevant', 'relevant', 'potensiell_kunde', 'signert_intensjonsavtale'
);
CREATE TYPE public.contact_activity_kind AS ENUM ('phone', 'missed_phone', 'meeting');

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  status public.company_status NOT NULL DEFAULT 'relevant',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, normalized_name),
  UNIQUE (org_id, id)
);
CREATE INDEX companies_org_idx ON public.companies(org_id);
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  company_id uuid NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, company_id) REFERENCES public.companies(org_id, id) ON DELETE CASCADE,
  UNIQUE (company_id, normalized_name),
  UNIQUE (org_id, id)
);
CREATE TABLE public.domain_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  color text NOT NULL DEFAULT 'blue' CHECK (color IN ('blue','orange','mint','pink','violet')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, normalized_name),
  UNIQUE (org_id, id)
);
CREATE TABLE public.company_domains (
  org_id uuid NOT NULL,
  company_id uuid NOT NULL,
  domain_id uuid NOT NULL,
  PRIMARY KEY (company_id, domain_id),
  FOREIGN KEY (org_id, company_id) REFERENCES public.companies(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, domain_id) REFERENCES public.domain_tags(org_id, id) ON DELETE CASCADE
);
CREATE TABLE public.person_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, normalized_name),
  UNIQUE (org_id, id)
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  department_id uuid,
  name text NOT NULL,
  normalized_name text NOT NULL,
  email text,
  phone text,
  phone_normalized text,
  position text,
  description text,
  shared_note text NOT NULL DEFAULT '',
  stikkord text,
  status public.contact_status NOT NULL DEFAULT 'ikke_kontaktet',
  assignee_id uuid REFERENCES auth.users(id),
  allow_external_ai boolean NOT NULL DEFAULT true,
  duplicate_of_id uuid,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, company_id) REFERENCES public.companies(org_id, id),
  FOREIGN KEY (org_id, department_id) REFERENCES public.departments(org_id, id),
  FOREIGN KEY (duplicate_of_id) REFERENCES public.contacts(id),
  UNIQUE (org_id, id),
  CHECK ((status = 'duplicate') = (duplicate_of_id IS NOT NULL))
);
CREATE INDEX contacts_org_status_idx ON public.contacts(org_id, status);
CREATE INDEX contacts_company_idx ON public.contacts(company_id);
CREATE INDEX contacts_email_idx ON public.contacts(org_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX contacts_phone_idx ON public.contacts(org_id, phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE INDEX contacts_updated_idx ON public.contacts(org_id, updated_at DESC);
CREATE TABLE public.contact_person_tags (
  org_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  PRIMARY KEY (contact_id, tag_id),
  FOREIGN KEY (org_id, contact_id) REFERENCES public.contacts(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, tag_id) REFERENCES public.person_tags(org_id, id) ON DELETE CASCADE
);

-- Thin activity foundation makes latest-contacted and duplicate movement real in chunk 01.
CREATE TABLE public.contact_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind public.contact_activity_kind NOT NULL,
  summary text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);
CREATE TABLE public.activity_contacts (
  org_id uuid NOT NULL,
  activity_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  PRIMARY KEY (activity_id, contact_id),
  FOREIGN KEY (org_id, activity_id) REFERENCES public.contact_activities(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, contact_id) REFERENCES public.contacts(org_id, id) ON DELETE CASCADE
);
CREATE INDEX activity_contacts_contact_idx ON public.activity_contacts(contact_id);
CREATE TABLE public.saved_contact_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  layout text NOT NULL CHECK (layout IN ('board','list')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_key text NOT NULL DEFAULT 'updated',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, name)
);

CREATE FUNCTION public.can_read_team(target_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships WHERE org_id = target_org AND user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      JOIN public.class_memberships cm ON cm.class_id = o.class_id
      WHERE o.id = target_org AND cm.user_id = (SELECT auth.uid()) AND cm.role = 'admin'
    );
$$;
REVOKE ALL ON FUNCTION public.can_read_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_team(uuid) TO authenticated;

ALTER TABLE public.class_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_spaces_member_select ON public.class_spaces FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.class_memberships cm WHERE cm.class_id = id AND cm.user_id = (SELECT auth.uid())));
CREATE POLICY class_memberships_self_select ON public.class_memberships FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.class_spaces, public.class_memberships TO authenticated;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_person_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_contact_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_team_select ON public.companies FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY departments_team_select ON public.departments FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY domain_tags_team_select ON public.domain_tags FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY company_domains_team_select ON public.company_domains FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY person_tags_team_select ON public.person_tags FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY contacts_team_select ON public.contacts FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY contact_person_tags_team_select ON public.contact_person_tags FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY contact_activities_team_select ON public.contact_activities FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY activity_contacts_team_select ON public.activity_contacts FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY saved_views_owner_select ON public.saved_contact_views FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.companies, public.departments, public.domain_tags, public.company_domains,
  public.person_tags, public.contacts, public.contact_person_tags, public.contact_activities,
  public.activity_contacts, public.saved_contact_views TO authenticated;
