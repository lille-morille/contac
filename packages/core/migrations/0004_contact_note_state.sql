ALTER TABLE public.contacts ADD COLUMN shared_note_saved_at timestamptz;

-- Teams that predate contact workflows receive the same initial person tags.
INSERT INTO public.person_tags (org_id, name, normalized_name)
SELECT o.id, seed.name, lower(seed.name)
FROM public.organizations o
CROSS JOIN (VALUES ('Portvokter'), ('Ildsjel'), ('Bruker'), ('Beslutningstaker')) AS seed(name)
ON CONFLICT (org_id, normalized_name) DO NOTHING;
