ALTER TYPE public.contact_activity_kind ADD VALUE IF NOT EXISTS 'email';

ALTER TABLE public.organizations
  ADD COLUMN inbound_key text DEFAULT md5(gen_random_uuid()::text),
  ADD COLUMN auto_share_logs boolean NOT NULL DEFAULT false;
UPDATE public.organizations SET inbound_key = md5(gen_random_uuid()::text) WHERE inbound_key IS NULL;
ALTER TABLE public.organizations ALTER COLUMN inbound_key SET NOT NULL;
CREATE UNIQUE INDEX organizations_inbound_key_unique ON public.organizations(inbound_key);

CREATE TABLE public.sender_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  normalized_email text NOT NULL UNIQUE,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sender_addresses_user_idx ON public.sender_addresses(user_id);
CREATE UNIQUE INDEX sender_addresses_one_default_idx ON public.sender_addresses(user_id) WHERE is_default;
INSERT INTO public.sender_addresses(user_id, email, normalized_email, is_default)
SELECT id, profile_email, lower(trim(profile_email)), true
FROM public.profiles WHERE profile_email IS NOT NULL;

CREATE TABLE public.email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  from_email text NOT NULL,
  to_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  opened_at timestamptz,
  marked_sent_at timestamptz,
  activity_id uuid REFERENCES public.contact_activities(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_drafts_org_contact_idx ON public.email_drafts(org_id, contact_id);

CREATE TABLE public.inbound_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.class_spaces(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL UNIQUE,
  from_email text NOT NULL,
  to_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL,
  sender_user_id uuid REFERENCES auth.users(id),
  admin_resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.inbound_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_id uuid NOT NULL REFERENCES public.inbound_emails(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('email', 'alert')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  activity_id uuid REFERENCES public.contact_activities(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inbound_id, org_id)
);
CREATE TABLE public.email_activities (
  activity_id uuid PRIMARY KEY REFERENCES public.contact_activities(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  inbound_id uuid REFERENCES public.inbound_emails(id),
  from_email text NOT NULL,
  to_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '',
  UNIQUE (org_id, inbound_id)
);
CREATE TABLE public.log_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  UNIQUE (requester_org_id, owner_contact_id),
  CHECK (requester_org_id <> owner_org_id)
);
CREATE INDEX log_access_owner_pending_idx ON public.log_access_requests(owner_org_id, status);

ALTER TABLE public.sender_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_access_requests ENABLE ROW LEVEL SECURITY;
