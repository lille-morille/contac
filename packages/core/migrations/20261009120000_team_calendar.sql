CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('meeting', 'deadline')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  contact_id uuid,
  date date,
  start_at timestamptz,
  end_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, contact_id) REFERENCES public.contacts(org_id, id) ON DELETE CASCADE,
  CONSTRAINT calendar_event_shape CHECK (
    (kind = 'meeting' AND contact_id IS NOT NULL AND date IS NULL AND start_at IS NOT NULL AND end_at > start_at)
    OR (kind = 'deadline' AND contact_id IS NULL AND date IS NOT NULL AND end_at IS NULL)
  )
);
CREATE INDEX calendar_events_org_date_idx ON public.calendar_events(org_id, date);
CREATE INDEX calendar_events_org_start_idx ON public.calendar_events(org_id, start_at);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_events_team_select ON public.calendar_events
  FOR SELECT TO authenticated USING (public.can_read_team(org_id));
GRANT SELECT ON public.calendar_events TO authenticated;

CREATE TRIGGER contac_signal AFTER INSERT OR UPDATE OR DELETE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.contac_team_change_signal('calendar_events');
