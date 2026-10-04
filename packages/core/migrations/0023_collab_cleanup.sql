CREATE FUNCTION public.contac_collab_cleanup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.collab_documents
  WHERE org_id = OLD.org_id AND entity_id = OLD.id
    AND ((TG_TABLE_NAME = 'contacts' AND kind = 'note')
      OR (TG_TABLE_NAME = 'contact_activities' AND kind IN ('summary', 'transcript')));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.contac_collab_cleanup() FROM PUBLIC;
CREATE TRIGGER contac_contact_collab_cleanup AFTER DELETE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contac_collab_cleanup();
CREATE TRIGGER contac_activity_collab_cleanup AFTER DELETE ON public.contact_activities
  FOR EACH ROW EXECUTE FUNCTION public.contac_collab_cleanup();
