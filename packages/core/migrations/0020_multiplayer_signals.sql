-- Only the API/database may emit authoritative change signals. Clients get
-- SELECT on the team channel, and INSERT only for Presence (never Broadcast).
CREATE POLICY contac_team_broadcast_receive ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    extension = 'broadcast'
    AND realtime.topic() ~ '^team:[0-9a-f-]{36}$'
    AND public.can_read_team(substring(realtime.topic() from 6)::uuid)
  );
CREATE POLICY contac_team_presence_receive ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    extension = 'presence'
    AND realtime.topic() ~ '^team:[0-9a-f-]{36}$'
    AND public.can_read_team(substring(realtime.topic() from 6)::uuid)
  );
CREATE POLICY contac_team_presence_send ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    extension = 'presence'
    AND realtime.topic() ~ '^team:[0-9a-f-]{36}$'
    AND public.can_read_team(substring(realtime.topic() from 6)::uuid)
  );

CREATE FUNCTION public.contac_team_change_signal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  row_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  team_id uuid;
  entity_id text;
BEGIN
  team_id := CASE WHEN TG_TABLE_NAME = 'organizations'
    THEN (row_data ->> 'id')::uuid ELSE (row_data ->> 'org_id')::uuid END;
  entity_id := coalesce(
    row_data ->> 'id', row_data ->> 'activity_id', row_data ->> 'contact_id',
    row_data ->> 'company_id', row_data ->> 'org_id'
  );
  IF team_id IS NOT NULL AND entity_id IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'teamId', team_id, 'entity', TG_ARGV[0], 'id', entity_id,
        'operation', lower(TG_OP),
        'revision', coalesce(row_data ->> 'revision', row_data ->> 'updated_at',
                             statement_timestamp()::text)
      ),
      'changed', 'team:' || team_id::text, true
    );
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.contac_team_change_signal() FROM PUBLIC;

DO $$
DECLARE item text;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'organizations', 'memberships', 'companies', 'departments', 'domain_tags',
    'company_domains', 'person_tags', 'contacts', 'contact_person_tags',
    'contact_activities', 'activity_contacts', 'activity_files', 'workspace_files',
    'email_activities', 'email_drafts', 'inbound_suggestions',
    'library_items', 'checkin_sessions', 'saved_contact_views',
    'lois', 'loi_versions', 'group_ai_summaries', 'ai_suggestions', 'ai_edit_log'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER contac_signal AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.contac_team_change_signal(%L)', item, item
    );
  END LOOP;
END;
$$;

-- Profile changes affect the member/avatar list of every team the user joined.
CREATE FUNCTION public.contac_profile_change_signal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE team_id uuid;
BEGIN
  FOR team_id IN SELECT org_id FROM public.memberships WHERE user_id = NEW.id LOOP
    PERFORM realtime.send(
      jsonb_build_object('teamId', team_id, 'entity', 'member', 'id', NEW.id,
                         'operation', 'update', 'revision', NEW.updated_at),
      'changed', 'team:' || team_id::text, true
    );
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.contac_profile_change_signal() FROM PUBLIC;
CREATE TRIGGER contac_profile_signal AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.contac_profile_change_signal();
