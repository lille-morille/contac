CREATE TABLE public.mcp_oauth_grants (
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  token_id uuid NOT NULL REFERENCES public.team_mcp_tokens(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);
CREATE INDEX mcp_oauth_grants_token_idx ON public.mcp_oauth_grants(token_id);
ALTER TABLE public.mcp_oauth_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_oauth_grants FROM anon, authenticated;

-- Supabase Auth calls this hook when it issues or refreshes an OAuth token.
-- Ordinary Contac sessions retain aud=authenticated. OAuth tokens are bound
-- to this MCP resource and cannot be mistaken for a first-party API session.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.mcp_oauth_config (
  issuer text PRIMARY KEY,
  resource_url text NOT NULL CHECK (resource_url ~ '^https://[^/?#@]+/mcp$')
);
ALTER TABLE private.mcp_oauth_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.mcp_oauth_config FROM public, anon, authenticated;
GRANT USAGE ON SCHEMA private TO supabase_auth_admin;
GRANT SELECT ON private.mcp_oauth_config TO supabase_auth_admin;
CREATE POLICY "Auth hook reads MCP resource" ON private.mcp_oauth_config
  FOR SELECT TO supabase_auth_admin USING (true);

INSERT INTO private.mcp_oauth_config (issuer, resource_url) VALUES
  ('https://cgnxlvvckwuejjddcyyq.supabase.co/auth/v1',
   'https://api.contac.plingapp.no/mcp');

CREATE FUNCTION private.mcp_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  claims jsonb := event -> 'claims';
  client_id text := nullif(claims ->> 'client_id', '');
  resource text;
BEGIN
  IF client_id IS NOT NULL THEN
    SELECT resource_url INTO resource FROM private.mcp_oauth_config
      WHERE issuer = claims ->> 'iss';
    IF resource IS NULL THEN
      RAISE EXCEPTION 'MCP OAuth resource configuration is missing';
    END IF;
    claims := jsonb_set(claims, '{aud}', to_jsonb(resource), true);
  END IF;
  RETURN jsonb_build_object('claims', claims);
END;
$$;
REVOKE ALL ON FUNCTION private.mcp_access_token_hook(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.mcp_access_token_hook(jsonb) TO supabase_auth_admin;
