-- Stable section IDs let a paragraph keep its collaborative document when
-- titles change or sections are reordered.
UPDATE public.lois AS loi SET sections = COALESCE((
  SELECT jsonb_agg(section.value || jsonb_build_object('id', gen_random_uuid())
                   ORDER BY section.ordinality)
  FROM jsonb_array_elements(loi.sections) WITH ORDINALITY AS section(value, ordinality)
), '[]'::jsonb)
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(loi.sections) AS section
              WHERE NOT section ? 'id');

ALTER TABLE public.collab_documents DROP CONSTRAINT collab_documents_kind_check;
ALTER TABLE public.collab_documents ADD CONSTRAINT collab_documents_kind_check
  CHECK (kind IN ('note', 'summary', 'transcript', 'loi-section', 'loi-signature'));
DROP POLICY contac_document_broadcast_receive ON realtime.messages;
CREATE POLICY contac_document_broadcast_receive ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    extension = 'broadcast'
    AND realtime.topic() ~ '^doc:[0-9a-f-]{36}:(note|summary|transcript|loi-section|loi-signature):[0-9a-f-]{36}$'
    AND public.can_read_team(split_part(realtime.topic(), ':', 2)::uuid)
  );
