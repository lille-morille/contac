ALTER TABLE public.organizations ADD COLUMN new_contacts_allow_external_ai boolean NOT NULL DEFAULT true;
ALTER TABLE public.contacts ADD COLUMN stikkord_source_version text;
ALTER TABLE public.contacts ADD COLUMN stikkord_generated_at timestamptz;
ALTER TABLE public.checkin_ai_settings ADD COLUMN modes jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.checkin_ai_settings ADD COLUMN low_model text NOT NULL DEFAULT 'openai/gpt-4.1-nano';
UPDATE public.checkin_ai_settings SET modes = jsonb_build_object(
  'checkin_summary', CASE WHEN enabled THEN 'manual' ELSE 'off' END,
  'email_draft', CASE WHEN email_draft_enabled THEN 'manual' ELSE 'off' END
);

CREATE TABLE public.search_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.contact_activities(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('contact', 'activity', 'note')),
  source_key text NOT NULL UNIQUE,
  source_version text NOT NULL,
  body text NOT NULL,
  embedding jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_chunks_org_idx ON public.search_chunks(org_id);
CREATE TABLE public.ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  feature text NOT NULL,
  source_version text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_suggestions_contact_idx ON public.ai_suggestions(org_id,contact_id,created_at DESC);
CREATE TABLE public.ai_edit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  feature text NOT NULL,
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  applied_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz
);
CREATE INDEX ai_edit_log_contact_idx ON public.ai_edit_log(org_id,contact_id,created_at DESC);
CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer,
  completion_tokens integer,
  cost_usd text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_org_idx ON public.ai_usage(org_id,created_at DESC);
CREATE TABLE public.group_ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('company','domain')),
  target_id uuid NOT NULL,
  summary text NOT NULL,
  source_version text NOT NULL,
  excluded_count integer NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id,target_kind,target_id)
);

ALTER TABLE public.search_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_edit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_ai_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY search_chunks_team_select ON public.search_chunks FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY ai_suggestions_team_select ON public.ai_suggestions FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY ai_edit_log_team_select ON public.ai_edit_log FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY ai_usage_team_select ON public.ai_usage FOR SELECT TO authenticated USING (public.can_read_team(org_id));
CREATE POLICY group_ai_summaries_team_select ON public.group_ai_summaries FOR SELECT TO authenticated USING (public.can_read_team(org_id));
GRANT SELECT ON public.search_chunks, public.ai_suggestions, public.ai_edit_log, public.ai_usage, public.group_ai_summaries TO authenticated;
