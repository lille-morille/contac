ALTER TABLE public.companies ADD COLUMN domains_revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.domain_tags ADD COLUMN revision integer NOT NULL DEFAULT 0;
