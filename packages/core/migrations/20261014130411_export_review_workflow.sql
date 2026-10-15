ALTER TABLE public.contacts
  ADD COLUMN export_status text NOT NULL DEFAULT 'not_ready'
    CONSTRAINT contacts_export_status_check CHECK (export_status IN ('not_ready', 'ready', 'needs_review')),
  ADD COLUMN export_content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN export_review_reason text;

CREATE INDEX contacts_export_status_idx ON public.contacts (org_id, export_status)
  WHERE deleted_at IS NULL AND status <> 'duplicate';

CREATE FUNCTION public.contac_reset_export_on_contact_edit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.name, NEW.company_id, NEW.description, NEW.sammendrag, NEW.stikkord)
     IS DISTINCT FROM
     (OLD.name, OLD.company_id, OLD.description, OLD.sammendrag, OLD.stikkord) THEN
    NEW.export_content_revision := OLD.export_content_revision + 1;
    IF NEW.export_status IS NOT DISTINCT FROM OLD.export_status THEN
      NEW.export_status := 'not_ready';
      NEW.export_review_reason := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contac_reset_export_contact BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contac_reset_export_on_contact_edit();

CREATE FUNCTION public.contac_reset_export_for_activity(activity uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.contacts AS c SET
    export_status = 'not_ready', export_review_reason = NULL,
    export_content_revision = c.export_content_revision + 1
  FROM public.activity_contacts AS link
  WHERE link.activity_id = activity AND link.contact_id = c.id
    AND link.org_id = c.org_id;
END;
$$;

CREATE FUNCTION public.contac_reset_export_activity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
    (NEW.kind, NEW.summary, NEW.transcript, NEW.missed_outcome, NEW.occurred_at)
    IS DISTINCT FROM
    (OLD.kind, OLD.summary, OLD.transcript, OLD.missed_outcome, OLD.occurred_at) THEN
    PERFORM public.contac_reset_export_for_activity(NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER contac_reset_export_activity AFTER UPDATE ON public.contact_activities
  FOR EACH ROW EXECUTE FUNCTION public.contac_reset_export_activity();

CREATE FUNCTION public.contac_reset_export_activity_link() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE changed_contact uuid;
DECLARE changed_org uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    changed_contact := OLD.contact_id;
    changed_org := OLD.org_id;
  ELSE
    changed_contact := NEW.contact_id;
    changed_org := NEW.org_id;
  END IF;
  UPDATE public.contacts SET
    export_status = 'not_ready', export_review_reason = NULL,
    export_content_revision = export_content_revision + 1
  WHERE id = changed_contact AND org_id = changed_org;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contac_reset_export_activity_link AFTER INSERT OR DELETE ON public.activity_contacts
  FOR EACH ROW EXECUTE FUNCTION public.contac_reset_export_activity_link();

CREATE FUNCTION public.contac_reset_export_email() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.contac_reset_export_for_activity(OLD.activity_id);
    RETURN OLD;
  END IF;
  PERFORM public.contac_reset_export_for_activity(NEW.activity_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER contac_reset_export_email AFTER INSERT OR UPDATE OR DELETE ON public.email_activities
  FOR EACH ROW EXECUTE FUNCTION public.contac_reset_export_email();

CREATE FUNCTION public.contac_reset_export_company_name() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.contacts AS c SET
      export_status = 'not_ready', export_review_reason = NULL,
      export_content_revision = c.export_content_revision + 1
    WHERE c.company_id = NEW.id AND c.org_id = NEW.org_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contac_reset_export_company_name AFTER UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.contac_reset_export_company_name();

CREATE TABLE public.export_review_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  guide_version text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('included', 'all_active')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX export_review_runs_org_idx ON public.export_review_runs (org_id, created_at DESC);
CREATE UNIQUE INDEX export_review_runs_active_idx ON public.export_review_runs (org_id)
  WHERE status = 'active';

CREATE TABLE public.export_review_items (
  run_id uuid NOT NULL REFERENCES public.export_review_runs(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  position integer NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'completed')),
  claim_token uuid,
  claimed_revision bigint,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  outcome text CHECK (outcome IN ('ready', 'needs_review')),
  completed_at timestamptz,
  PRIMARY KEY (run_id, contact_id)
);
CREATE INDEX export_review_items_next_idx ON public.export_review_items (run_id, state, position, lease_until);
CREATE UNIQUE INDEX export_review_items_claim_token_idx ON public.export_review_items (claim_token)
  WHERE claim_token IS NOT NULL;

ALTER TABLE public.export_review_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_review_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.contac_reset_export_on_contact_edit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contac_reset_export_for_activity(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contac_reset_export_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contac_reset_export_activity_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contac_reset_export_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contac_reset_export_company_name() FROM PUBLIC, anon, authenticated;
