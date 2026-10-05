-- New contacts always start with external AI allowed; each contact retains its own override.
ALTER TABLE public.organizations DROP COLUMN new_contacts_allow_external_ai;
