ALTER TABLE public.companies
  ADD COLUMN loi_logo_file_id uuid REFERENCES public.workspace_files(id) ON DELETE SET NULL,
  ADD COLUMN loi_logo_url text;

CREATE TABLE public.loi_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_name text NOT NULL DEFAULT '',
  template_source text NOT NULL DEFAULT '',
  logo_file_id uuid REFERENCES public.workspace_files(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lois (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  our_signer_name text NOT NULL,
  counterparty_signer_name text NOT NULL DEFAULT '',
  document_date text NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_at timestamptz,
  sent_by uuid,
  sent_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lois_org_company_idx ON public.lois(org_id,company_id,created_at DESC);

CREATE TABLE public.loi_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  loi_id uuid NOT NULL REFERENCES public.lois(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.workspace_files(id),
  kind text NOT NULL CHECK (kind IN ('generated','signed')),
  label text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loi_versions_loi_idx ON public.loi_versions(loi_id,created_at DESC);
ALTER TABLE public.lois
  ADD CONSTRAINT lois_sent_version_fk FOREIGN KEY (sent_version_id)
  REFERENCES public.loi_versions(id);

ALTER TABLE public.loi_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lois ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loi_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY loi_settings_team_select ON public.loi_settings FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY lois_team_select ON public.lois FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY loi_versions_team_select ON public.loi_versions FOR SELECT TO authenticated USING (public.can_read_team(org_id));
GRANT SELECT ON public.loi_settings, public.lois, public.loi_versions TO authenticated;
