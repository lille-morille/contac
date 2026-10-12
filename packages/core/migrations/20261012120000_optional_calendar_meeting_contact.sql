ALTER TABLE public.calendar_events DROP CONSTRAINT calendar_event_shape;

ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_event_shape CHECK (
  (kind = 'meeting' AND date IS NULL AND start_at IS NOT NULL AND end_at > start_at)
  OR (kind = 'deadline' AND contact_id IS NULL AND date IS NOT NULL AND end_at IS NULL)
);
