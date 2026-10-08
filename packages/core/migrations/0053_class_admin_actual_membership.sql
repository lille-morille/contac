-- Class-wide access does not make an administrator an actual team member.
ALTER TABLE public.memberships
  ADD COLUMN is_actual_member boolean NOT NULL DEFAULT true;

-- Older admin memberships were created automatically, so their intent cannot be inferred.
UPDATE public.memberships AS m
SET is_actual_member = false
FROM public.organizations AS o, public.class_memberships AS cm
WHERE o.id = m.org_id
  AND cm.class_id = o.class_id
  AND cm.user_id = m.user_id
  AND cm.role = 'admin';

ALTER TABLE public.class_memberships
  ADD COLUMN current_team_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Inactive legacy rows must not grant access after an administrator loses that role.
CREATE OR REPLACE FUNCTION public.is_org_member(target_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = target_org AND user_id = (SELECT auth.uid()) AND is_actual_member
  ) OR EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.class_memberships cm ON cm.class_id = o.class_id
    WHERE o.id = target_org AND cm.user_id = (SELECT auth.uid()) AND cm.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_team(target_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = target_org AND user_id = (SELECT auth.uid()) AND is_actual_member
  ) OR EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.class_memberships cm ON cm.class_id = o.class_id
    WHERE o.id = target_org AND cm.user_id = (SELECT auth.uid()) AND cm.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_team(uuid) TO authenticated;
