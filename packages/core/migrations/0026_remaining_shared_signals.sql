-- Background indexing and AI usage can change without a contact/activity row
-- changing in the same transaction. Signal those team-visible results as well.
DO $$
DECLARE item text;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'search_chunks', 'ai_usage', 'checkin_ai_settings', 'loi_settings'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER contac_signal AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.contac_team_change_signal(%L)', item, item
    );
  END LOOP;
END;
$$;
