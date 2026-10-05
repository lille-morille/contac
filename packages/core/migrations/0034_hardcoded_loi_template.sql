-- Future LOIs use the built-in source. Existing generated PDF versions are retained.
ALTER TABLE public.loi_settings DROP COLUMN template_source;
