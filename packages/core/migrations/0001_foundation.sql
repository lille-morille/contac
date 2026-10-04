-- Generic tenant and agent foundation.
CREATE TYPE public.membership_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.agent_run_status AS ENUM ('queued', 'running', 'completed', 'failed');
CREATE TYPE public.message_role AS ENUM ('user', 'assistant');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.membership_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_org_user_unique UNIQUE (org_id, user_id)
);
CREATE INDEX memberships_user_idx ON public.memberships(user_id);
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.membership_role NOT NULL DEFAULT 'member',
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitations_org_idx ON public.invitations(org_id);
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_org_id_id_unique UNIQUE (org_id, id)
);
CREATE INDEX conversations_org_idx ON public.conversations(org_id);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  role public.message_role NOT NULL,
  content text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, conversation_id) REFERENCES public.conversations(org_id, id) ON DELETE CASCADE
);
CREATE INDEX messages_conversation_idx ON public.messages(conversation_id, created_at);
CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  trigger_message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  status public.agent_run_status NOT NULL DEFAULT 'queued',
  attempt integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, conversation_id) REFERENCES public.conversations(org_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX agent_runs_one_active_per_conversation ON public.agent_runs(conversation_id) WHERE status IN ('queued', 'running');
CREATE INDEX agent_runs_claim_idx ON public.agent_runs(status, locked_until);
CREATE INDEX agent_runs_org_idx ON public.agent_runs(org_id);
CREATE TABLE public.agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_events_run_idx ON public.agent_events(run_id, created_at);

CREATE FUNCTION public.is_org_member(target_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships WHERE org_id = target_org AND user_id = (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_self_select ON public.profiles FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY organizations_member_select ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY memberships_self_select ON public.memberships FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY conversations_member_select ON public.conversations FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY messages_member_select ON public.messages FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY agent_runs_member_select ON public.agent_runs FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY agent_events_member_select ON public.agent_events FOR SELECT TO authenticated USING (public.is_org_member(org_id));
-- No direct client write policies. The API checks membership and org scope for every mutation.
GRANT SELECT ON public.profiles, public.organizations, public.memberships, public.conversations, public.messages, public.agent_runs, public.agent_events TO authenticated;
REVOKE ALL ON public.invitations FROM anon, authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations, public.messages, public.agent_runs, public.agent_events;
