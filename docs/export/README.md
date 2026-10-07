# YAML contact-log contract (v1)

Copy the complete YAML from **Eksport → Rapportverktøy** with `Kopier fullstendig YAML`, then paste it into `kontaktlogg.yaml` beside the report template. It contains one team, a list of non-duplicate contacts, and a chronological list of activities. Each activity occurs exactly once. `exportOwnerContactId` is one of its `linkedContactIds`; all linked contacts remain listed even when the activity is printed under one owner.

The top-level keys are `schemaVersion`, `team`, `contacts`, and `activities`. `team` has `id` and `name`. Each contact carries its immutable team-scoped `contactNumber`, identifying fields, organization, status, assignee ID, person tags, and organization domains. Each activity carries its kind and timestamps, creator ID, export owner, all linked IDs, complete summary and transcript, missed-call outcome, AI override, email headers when present, and attachment metadata (`id`, name, MIME type, size). Binary attachment bytes are not embedded in YAML. Shared research notes and confirmed duplicate contacts are excluded.

[`kontaktlogg.typ`](kontaktlogg.typ) is a minimal example of importing the YAML and constructing a table. Put it beside the exported file and run `typst compile kontaktlogg.typ kontaktlogg.pdf`. Adapt its columns and layout for the university's final document.

## Saved report export

The team's **Eksport** page saves contact inclusion, manual relevance order, title, subtitle, columns, and selected format. Every download or copy reads current contact data. Select Typst, LaTeX, or CSV, then use `Last ned` or `Kopier til utklippstavle`. CSV can be imported into Google Sheets. `Kopier som tabell` copies an HTML table for Google Docs.

The generated `kontaktlogg.typ` is self-contained; it does not read CSV or YAML. Replace the report's contact-log include with this file. Include it where the table should appear, and import its citation helper in report sections:

```typst
#import "dependencies/kontaktlogg.typ": cite-contact
Et sitat #cite-contact(12).
#include "dependencies/kontaktlogg.typ"
```

The number is the contact's permanent team-scoped number, independent of display order. A cited contact omitted from the export causes a clear Typst compile error. One contact row may span pages. A shared activity is printed in full once, under its creation contact when available; other linked contacts point to that person's `K-nummer`. The compact `Uten aktivitet` section comes last.

# Typst report template

Upload the version 1 report ZIP to the private Supabase Storage bucket
`workspace-files` with the exact object key
`report-templates/contac-report-v1.zip`. The team settings download button
uses this path. Until the object exists, it reports that the template has not
been uploaded. Contact citations use `#cite-contact(1, 2, ...)`, where each
number is permanent within its team.
