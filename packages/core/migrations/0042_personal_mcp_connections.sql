-- All old team tokens and token-bound grants are retired in this pre-production release.
DROP TABLE public.mcp_oauth_grants;
DROP TABLE public.team_mcp_tokens;
ALTER TABLE public.profiles ADD COLUMN agent_team_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE TABLE public.mcp_user_connections (
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);
ALTER TABLE public.mcp_user_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_user_connections FROM anon, authenticated;
