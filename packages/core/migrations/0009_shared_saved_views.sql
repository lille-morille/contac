-- A saved view is a team publication. Rename same-name personal views from
-- different members before enforcing one name per team.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY org_id, name ORDER BY created_at, id) AS position
  FROM public.saved_contact_views
)
UPDATE public.saved_contact_views AS target
SET name = left(target.name, 38) || ' [' || target.id::text || ']'
FROM ranked
WHERE target.id = ranked.id AND ranked.position > 1;

ALTER TABLE public.saved_contact_views
  DROP CONSTRAINT saved_contact_views_org_id_user_id_name_key;
ALTER TABLE public.saved_contact_views
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX saved_views_org_name_unique
  ON public.saved_contact_views(org_id, name);

DROP POLICY saved_views_owner_select ON public.saved_contact_views;
CREATE POLICY saved_views_team_select ON public.saved_contact_views
  FOR SELECT TO authenticated USING (public.can_read_team(org_id));
