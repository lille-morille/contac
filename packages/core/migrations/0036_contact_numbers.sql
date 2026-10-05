-- Backfill stable team-scoped references in creation order, including duplicates.
ALTER TABLE public.organizations ADD COLUMN next_contact_number integer NOT NULL DEFAULT 1;
ALTER TABLE public.contacts ADD COLUMN contact_number integer;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY org_id ORDER BY created_at, id)::integer AS number
  FROM public.contacts
)
UPDATE public.contacts AS contact
SET contact_number = numbered.number
FROM numbered
WHERE contact.id = numbered.id;

UPDATE public.organizations AS team
SET next_contact_number = COALESCE(
  (SELECT max(contact_number) + 1 FROM public.contacts WHERE org_id = team.id),
  1
);

ALTER TABLE public.contacts ALTER COLUMN contact_number SET NOT NULL;
ALTER TABLE public.contacts ALTER COLUMN contact_number SET DEFAULT 0;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_contact_number_positive CHECK (contact_number > 0);
CREATE UNIQUE INDEX contacts_org_contact_number_unique ON public.contacts (org_id, contact_number);

CREATE FUNCTION public.assign_contact_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.contact_number IS DISTINCT FROM OLD.contact_number OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'Contact number and team cannot be changed';
    END IF;
    RETURN NEW;
  END IF;
  UPDATE public.organizations
  SET next_contact_number = next_contact_number + 1
  WHERE id = NEW.org_id
  RETURNING next_contact_number - 1 INTO NEW.contact_number;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contacts_assign_number BEFORE INSERT OR UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.assign_contact_number();
