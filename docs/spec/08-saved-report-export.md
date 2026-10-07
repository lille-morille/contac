# 08 — Saved contact-log report export

**Status:** Reviewed and assigned for implementation on 2026-10-07. The database migration is included in the implementation PR but must not be applied yet.

## Team export workspace

Add `Eksport` to the team sidebar. Every control on this page is shared by teammates and autosaved: included contacts, relevance order, selected and ordered columns, title, subtitle, and format. Export reads current contact data rather than a stored snapshot. New active contacts are included by default. The page shows a compact table preview with shortened log excerpts; source files contain the full text.

The initial order for contacts with activity is Kan kontaktes igjen, Avsluttet, Follow up / Ring igjen, Venter på svar, Skal ringe, Ikke kontaktet, then Ikke kontakt igjen. Contacts with no linked activity are in a compact final section. Manual reordering persists, and a reset action restores the initial sort. Deletion and duplicate status remove a contact from the export.

Nr. and Kontaktperson are mandatory columns. Other available columns are Ansvarlig, Selskap, Kontaktinfo, Status, Kort beskrivelse, person tags, domains, Stikkord, and Logg. Users can include and reorder them. Logg preserves dated activity summaries, transcripts, email headers, participants, and attachment metadata. The shared research note and additional information remain excluded under existing product rules.

## Shared activities and citations

Keep each activity in full once, under the contact on whom it was created. Secondary linked contacts have a short cross-reference to that contact, and the full entry lists other participants by permanent team contact number. If the original contact is deleted, a duplicate, or excluded from this report, assign the activity to the first included linked contact in saved report order. Omit it if no linked contact is included. Remove the manual `Eksporteres under` control and write endpoint; retain the stored creation owner as the normal owner. Preserve the complete YAML export and its one-activity-once contract.

Typst citations use immutable team contact numbers, such as `#cite-contact(12)`. Reordering never changes them. A citation to a contact omitted from the generated Typst source fails compilation.

## Formats and actions

The format selector contains Typst, LaTeX, and CSV (for upload to Google Sheets). Each offers file download and plain-text clipboard copy. A separate rich-table clipboard action supports pasting into Google Docs. One-click Google Sheets creation is out of scope.

The Typst file is self-contained: safely encoded data, editable settings, reusable renderer, landscape A4 table with repeated headers and breakable contact rows, and a citation helper. It can replace one included file in a report. LaTeX uses A4 landscape contact headings with flowing logs so long text can cross pages. CSV remains rectangular, with one row per contact and properly quoted multiline log text. The no-activity section is compact in Typst, LaTeX, and the rich clipboard table; CSV places those rows last.

The existing full YAML copy and report-template download live in a secondary report-tools area on Eksport. The report-template ZIP is not present in this checkout; validate integration against it after it is uploaded.
