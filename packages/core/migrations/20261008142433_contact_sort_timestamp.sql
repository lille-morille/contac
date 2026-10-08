-- Keep concurrency/realtime revisions separate from the contact-list sorting clock.
ALTER TABLE public.contacts ADD COLUMN sort_updated_at timestamptz;
UPDATE public.contacts SET sort_updated_at = updated_at;
ALTER TABLE public.contacts ALTER COLUMN sort_updated_at SET DEFAULT now(), ALTER COLUMN sort_updated_at SET NOT NULL;

CREATE FUNCTION public.contac_contact_sort_timestamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sort_updated_at := NEW.updated_at;
  ELSIF (to_jsonb(NEW) - ARRAY['status', 'assignee_id', 'updated_at', 'sort_updated_at'])
      IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['status', 'assignee_id', 'updated_at', 'sort_updated_at'])
      OR (NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id) THEN
    -- Includes timestamp-only touches from activities, tags and additional information.
    NEW.sort_updated_at := NEW.updated_at;
  ELSE
    NEW.sort_updated_at := OLD.sort_updated_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.contac_contact_sort_timestamp() FROM PUBLIC;
CREATE TRIGGER contac_contact_sort_timestamp BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contac_contact_sort_timestamp();
CREATE INDEX contacts_sort_updated_idx ON public.contacts (org_id, sort_updated_at);
