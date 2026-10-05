-- Team roles no longer limit access. Class-admin membership remains separate.
UPDATE public.memberships SET role = 'admin' WHERE role <> 'admin';
UPDATE public.invitations SET role = 'admin' WHERE role <> 'admin';
ALTER TABLE public.memberships ALTER COLUMN role SET DEFAULT 'admin';
ALTER TABLE public.invitations ALTER COLUMN role SET DEFAULT 'admin';
