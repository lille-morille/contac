ALTER TABLE public.contact_activities ADD COLUMN allow_external_ai_override boolean;

CREATE TABLE public.activity_files (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.contact_activities(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.workspace_files(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, file_id)
);
CREATE INDEX activity_files_org_idx ON public.activity_files(org_id);

CREATE TABLE public.library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  activity_id uuid,
  source_kind text NOT NULL CHECK (source_kind IN ('activity', 'note')),
  quote text NOT NULL CHECK (length(quote) BETWEEN 1 AND 10000),
  source_updated_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_kind = 'activity') = (activity_id IS NOT NULL))
);
CREATE INDEX library_items_org_created_idx ON public.library_items(org_id, created_at DESC);

CREATE TABLE public.checkin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  started_by uuid NOT NULL REFERENCES auth.users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_by uuid REFERENCES auth.users(id),
  ended_at timestamptz,
  selected_activity_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  summary_source_versions jsonb,
  summary_created_at timestamptz,
  summary_model text,
  prompt_tokens integer,
  completion_tokens integer,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX checkin_sessions_one_active_idx ON public.checkin_sessions(org_id) WHERE ended_at IS NULL;
CREATE INDEX checkin_sessions_org_started_idx ON public.checkin_sessions(org_id, started_at DESC);

CREATE TABLE public.checkin_ai_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  encrypted_token text,
  model text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_files_team_select ON public.activity_files FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY library_items_team_select ON public.library_items FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY checkin_sessions_team_select ON public.checkin_sessions FOR SELECT TO authenticated USING (public.can_read_team(org_id));
GRANT SELECT ON public.activity_files, public.library_items, public.checkin_sessions TO authenticated;
