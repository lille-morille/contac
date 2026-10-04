CREATE TABLE public.collab_documents (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('note', 'summary', 'transcript')),
  entity_id uuid NOT NULL,
  state_base64 text NOT NULL,
  materialized_text text NOT NULL,
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, kind, entity_id)
);
ALTER TABLE public.collab_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY collab_documents_team_select ON public.collab_documents
  FOR SELECT TO authenticated USING (public.can_read_team(org_id));
GRANT SELECT ON public.collab_documents TO authenticated;

CREATE POLICY contac_document_broadcast_receive ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    extension = 'broadcast'
    AND realtime.topic() ~ '^doc:[0-9a-f-]{36}:(note|summary|transcript):[0-9a-f-]{36}$'
    AND public.can_read_team(split_part(realtime.topic(), ':', 2)::uuid)
  );
