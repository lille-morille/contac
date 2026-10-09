ALTER TABLE public.contacts
  ADD COLUMN sammendrag text,
  ADD COLUMN sammendrag_source_version text,
  ADD COLUMN sammendrag_generated_at timestamptz;

-- Preserve every former agent/referral entry in the single internal note.
WITH merged AS (
  SELECT info.contact_id,
    string_agg(
      CASE
        WHEN info.source = 'referral' THEN 'Henvisning fra ' || coalesce(source_contact.name, 'kildekontakt')
        ELSE 'Lagt til av agent'
      END || E':\n' || info.markdown,
      E'\n\n'
      ORDER BY info.created_at, info.id
    ) AS text
  FROM public.contact_additional_info info
  LEFT JOIN public.contacts source_contact ON source_contact.id = info.source_contact_id
  GROUP BY info.contact_id
)
UPDATE public.contacts contact
SET shared_note = concat_ws(E'\n\n', nullif(contact.shared_note, ''), merged.text),
    shared_note_saved_at = now(),
    updated_at = now()
FROM merged
WHERE contact.id = merged.contact_id;

-- Keep the source rows for rollback/audit. Application reads and writes the unified note only.
