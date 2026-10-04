CREATE TABLE public.team_mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX team_mcp_tokens_org_idx ON public.team_mcp_tokens(org_id);
ALTER TABLE public.team_mcp_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_mcp_tokens FROM anon, authenticated;
