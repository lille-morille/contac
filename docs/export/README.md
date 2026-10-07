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

The Norwegian and English templates are versioned in
[`packages/api/src/templates/syretest`](../../packages/api/src/templates/syretest).
The API builds ZIP downloads from shared `common/` and localized `nb/`/`en/`
source files. Edit, push and deploy normally; no storage upload or separate key
is required. The API image already copies the template source folder.

In **Eksport → Rapportverktøy**, choose the Norwegian or English template.
The review form prefills case name from the team's product name (falling back
to team name), group from team name/number, and authors from members' profile
names. Edit these values, add/remove authors, optionally add their backgrounds,
and enter the syretest number. The reviewed values are POSTed to
`/v1/org/export/report-template.zip` and injected into editable `project.yaml`.
This does not modify team settings. GET downloads remain available with
`?lang=nb` (default) or `?lang=en` for blank templates.

Both versions use the course TIØ4331, Entreprenørielle muligheter og
markedsundersøkelser, from the supplied report. The cover uses
`submission-date = datetime.today()` formatted as day.month.year. There is no
date field in the form or YAML. Set `show_guidance: false` before submission;
cover, contents, references and appendices are excluded from body pagination.

Copy or download Typst from the existing saved export workspace and replace
all of the template's root `kontaktlogg.typ`. It retains the selected contacts,
columns and relevance order. Report sections import `cite-contact` through
`dependencies/helpers.typ`, which delegates to that exported file's helper.
Citations therefore use exactly the same `kontaktlogg-k-N` targets as the
backend's landscape tables. The template also supports direct imports from
`kontaktlogg.typ`. No second contact-log renderer or CSV import is involved.

**Last ned signerte LOI-er** downloads `/v1/org/export/signed-lois.zip`, containing
all signed versions for the selected team, original PDF bytes and a manifest.
Generated/unsigned versions are excluded. Stable version IDs prevent filename
collisions. Extract the archive into the report root; the appendix includes
every page, retaining page dimensions and rotation. Empty teams receive an
explicit error. Missing/unreadable/password-protected PDFs fail the complete
export instead of silently omitting signed documents. Bulk downloads are
limited to 100 MiB; individual file downloads remain available.

For PDFs manually added to `loi/`, install `pypdf` and run
`python3 prepare-lois.py` in the downloaded project, or edit the manifest.
Typst cannot enumerate folders itself. The initial templates contain no case
records, contacts, signed LOIs or submitted attachments. The official logo
comes from https://www.entreprenorskolen.no/NSE.png.

For local editing and preview, run `bun run --cwd packages/api templates:build`.
It produces standalone projects/ZIPs in ignored `output/syretest/`.
Compile `main.typ` with **Typst 0.15.1+** for PDF appendix support.
