# Contact-log report export

The team's **Eksport** page saves contact inclusion, section grouping, sort mode, manual order, title, subtitle, columns, and selected format. Group by activity, company status, contact status, or custom sections. Within each section, sort by relevance then contact status, by contact status then relevance, or alphabetically. Contacts can be moved manually; unassigned custom contacts appear in a final section. The contact's relevance rating describes how informative the conversation was, and can be set manually or suggested by the summary agent. The live cards let teammates edit Sammendrag and Key takeaways. Every download or copy reads current contact data. Select Typst, LaTeX, or CSV, then use `Last ned` or `Kopier til utklippstavle`. CSV can be imported into Google Sheets. `Kopier som tabell` copies an HTML table for Google Docs. Activity logs, transcripts, and internal notes stay in Contac and are omitted from report files. The Typst report template can be downloaded alongside these actions.

Download or copy the generated `kontaktlogg.typ` and replace the report's contact-log include with it. The file is self-contained. Include it where the contact log should appear, and import its citation helper in report sections:

```typst
#import "dependencies/kontaktlogg.typ": cite-contact
Et sitat #cite-contact(12).
#include "dependencies/kontaktlogg.typ"
```

The number is the contact's permanent team-scoped number, independent of display order. A cited contact omitted from the export causes a clear Typst compile error. The Typst export uses portrait A4 contact cards with distinct color bands for sections, status-colored number markers, and tinted Sammendrag and Key takeaways fields. Long summaries can continue across pages. Section headings follow the team's saved grouping and order.

## Fast PDF preview

Run `bun run export:pdf` from the repository root to compile representative sample
contacts without a database. The command writes `kontaktlogg.typ`,
`kontaktlogg.pdf`, and one PNG per page to ignored `output/export-preview/`.
Open the PDF to review the full export or the PNGs to inspect individual pages.
Use `bun run export:pdf:watch` while editing the Typst renderer or sample fixture;
it regenerates the preview after source changes. Typst must be installed.
The sample groups by company status. Use `bun run export:pdf --group custom`,
`--group contact_status`, or `--group activity` to inspect other groupings.

To preview the current local team's actual saved export settings and contacts,
run `bun run export:pdf --local`. If the local database contains several teams,
use `bun run export:pdf --team <team-uuid>`. This mode accepts only a loopback
`DATABASE_URL` and uses the team's saved title, subtitle, columns, selection,
and order. It writes to the same preview directory.

## Typst report template

The Norwegian and English templates are versioned in
[`packages/api/src/templates/syretest`](../../packages/api/src/templates/syretest).
The API builds ZIP downloads from shared `common/` and localized `nb/`/`en/`
source files. Edit, push and deploy normally; no storage upload or separate key
is required. The API image already copies the template source folder.

At the top of **Eksport**, choose the Norwegian or English template beside the contact-log download and copy actions.
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
backend's portrait contact cards. The template also supports direct imports from
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
