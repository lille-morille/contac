CREATE TYPE public.contact_relevance AS ENUM ('low', 'medium', 'high');

ALTER TABLE public.contacts
  ADD COLUMN relevance public.contact_relevance,
  ADD COLUMN relevance_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN relevance_source_version text;
