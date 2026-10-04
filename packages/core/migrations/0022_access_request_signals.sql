-- An access request has two team IDs. Signal each side separately, without
-- exposing the other team's contact or request contents in the payload.
CREATE FUNCTION public.contac_access_request_signal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
target_team uuid;
BEGIN
  FOR target_team IN SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(
    jsonb_build_array(row_data ->> 'owner_org_id', row_data ->> 'requester_org_id')
  ) AS value LOOP
    PERFORM realtime.send(
      jsonb_build_object('teamId', target_team, 'entity', 'log_access_requests',
        'id', row_data ->> 'id', 'operation', lower(TG_OP),
        'revision', statement_timestamp()::text),
      'changed', 'team:' || target_team::text, true
    );
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.contac_access_request_signal() FROM PUBLIC;
CREATE TRIGGER contac_access_request_signal AFTER INSERT OR UPDATE OR DELETE
  ON public.log_access_requests FOR EACH ROW
  EXECUTE FUNCTION public.contac_access_request_signal();
