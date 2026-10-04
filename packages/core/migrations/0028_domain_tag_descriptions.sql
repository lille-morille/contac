ALTER TABLE public.domain_tags
  ADD COLUMN IF NOT EXISTS description text;
