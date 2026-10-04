ALTER TABLE public.person_tags
  ADD COLUMN IF NOT EXISTS description text;
