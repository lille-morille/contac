ALTER TABLE public.organizations
  ADD COLUMN sessions_enabled boolean NOT NULL DEFAULT false;
