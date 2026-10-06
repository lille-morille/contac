-- Null expiry marks newly issued reusable links. Existing links keep their limits.
ALTER TABLE public.invitations ALTER COLUMN expires_at DROP NOT NULL;
