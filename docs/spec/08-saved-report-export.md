# 08 — Saved contact-log report export

**Status:** Reviewed and assigned for implementation on 2026-10-07. Migration 0049 was applied to Contac Production on 2026-10-07 and verified in `app_migrations`.

## Team export workspace

Add `Eksport` to the team sidebar. Every control on this page is shared by teammates and autosaved: included contacts, relevance order, selected and ordered columns, title, subtitle, and format. Export reads current contact data rather than a stored snapshot. New active contacts are included by default. Selection and reordering live in the card preview, which shows complete field content and scrolls when needed. Stikkord and each activity's notes can be edited in place by clicking the text and save on blur; activity metadata is displayed separately and remains read-only.

The initial order for contacts with activity is Kan kontaktes igjen, Avsluttet, Follow up / Ring igjen, Venter på svar, Skal ringe, Ikke kontaktet, then Ikke kontakt igjen. Contacts with no linked activity are in a compact final section. Manual reordering uses arrow controls beside each row and persists; a reset action restores the initial sort. Each row also opens its contact for editing. Deletion and duplicate status remove a contact from the export.

Nr. and Kontaktperson are mandatory columns. Other available columns are Ansvarlig, Selskap, Kontaktinfo, Status, Kort beskrivelse, person tags, domains, Stikkord, and Logg. Users can include and reorder them. Logg preserves dated activity notes, email headers, participants, and attachment metadata. Transcripts, the shared research note, and additional information are excluded.

## Shared activities and citations

Keep each activity's notes once, under the contact on whom it was created. Secondary linked contacts have a short cross-reference to that contact, and the full entry lists other participants by permanent team contact number. If the original contact is deleted, a duplicate, or excluded from this report, assign the activity to the first included linked contact in saved report order. Omit it if no linked contact is included. Remove the manual `Eksporteres under` control and write endpoint; retain the stored creation owner as the normal owner. Omit transcripts from every export format.

Typst citations use immutable team contact numbers, such as `#cite-contact(12)`. Reordering never changes them. A citation to a contact omitted from the generated Typst source fails compilation.

## Formats and actions

The format selector contains Typst, LaTeX, and CSV (for upload to Google Sheets). Each offers file download and plain-text clipboard copy. A separate rich-table clipboard action supports pasting into Google Docs. One-click Google Sheets creation is out of scope.

The Typst file is self-contained: safely encoded data, editable settings, reusable renderer, portrait A4 contact cards with compact metadata, wide Stikkord and Logg sections, breakable long notes, and a citation helper. The live export preview uses the same card structure. It can replace one included file in a report. LaTeX uses A4 landscape contact headings with flowing logs so long text can cross pages. CSV remains rectangular, with one row per contact and properly quoted multiline log text. The no-activity section is compact in Typst, LaTeX, and the rich clipboard table; CSV places those rows last.

The generated `.typ` file replaces the YAML contact log. Norwegian and English Syretest template downloads sit alongside the file and clipboard actions at the top of Eksport. The templates are versioned in the API source and assembled into ZIPs at download time. A review form injects team-derived metadata into project.yaml, while Typst supplies the compilation date. Signed LOIs can be downloaded with an appendix manifest.
