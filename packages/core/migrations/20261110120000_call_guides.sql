-- Per-team feature flags for staged rollouts. A row means the team has the flag.
-- Only the API and operator scripts write here; members may read their team's flags.
CREATE TABLE public.team_feature_flags (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  flag text NOT NULL CHECK (flag ~ '^[a-z][a-z0-9_]{0,62}$'),
  enabled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, flag)
);

ALTER TABLE public.team_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_feature_flags_team_select ON public.team_feature_flags
  FOR SELECT TO authenticated USING (public.can_read_team(org_id));
GRANT SELECT ON public.team_feature_flags TO authenticated;

-- Call guides are Markdown documents without a Yjs document (ADR 0001).
-- Positions are rewritten for the whole team on reorder, so uniqueness is checked
-- at commit time.
CREATE TABLE public.call_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Uten tittel' CHECK (length(title) <= 200),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 100000),
  position integer NOT NULL CHECK (position >= 0),
  revision integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_guides_org_position_unique UNIQUE (org_id, position)
    DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE public.call_guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY call_guides_team_select ON public.call_guides
  FOR SELECT TO authenticated USING (public.can_read_team(org_id));
GRANT SELECT ON public.call_guides TO authenticated;

-- The signal carries only {teamId, entity, id, operation, revision}; never title or body.
CREATE TRIGGER contac_signal AFTER INSERT OR UPDATE OR DELETE ON public.call_guides
  FOR EACH ROW EXECUTE FUNCTION public.contac_team_change_signal('call_guides');
