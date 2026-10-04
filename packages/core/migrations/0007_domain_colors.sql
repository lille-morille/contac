ALTER TABLE public.domain_tags
  DROP CONSTRAINT IF EXISTS domain_tags_color_check;

ALTER TABLE public.domain_tags
  ADD CONSTRAINT domain_tags_color_check
  CHECK (color IN (
    'blue', 'orange', 'mint', 'pink', 'violet',
    'coral', 'yellow', 'lime', 'cyan', 'slate'
  ));
