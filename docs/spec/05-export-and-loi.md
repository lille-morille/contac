# 05 — Information-preserving export and organization LOIs

**Status:** Implemented. The supplied Typst LOI is the built-in starting template; its organization-specific wording has been replaced by reusable text.

## Images for this chunk

- [LOI editor wireframe](../wireframes/loi-editor.png) — source company and sender, preview-before-copy action, sections, variables, and current PDF.
- [Previous LOI preview state](../wireframes/loi-previous-preview.png) — inspect the previously sent PDF before choosing to copy its content.

## Full log and YAML export

**Superseded:** The YAML contact log and its example Typst file were retired by [spec 08](08-saved-report-export.md). The current workflow exports a generated `.typ` file directly.

The deterministic full log orders each contact's activities by editable activity time. It preserves the complete transcript, summary, notes, and meaningful metadata, without AI paraphrasing. Shared research notes and confirmed duplicate contacts are excluded. The full text is available on the contact page and for export. Optional AI `stikkord` is a separate condensed view.

The team-wide **YAML** export appears on contact pages. A shared meeting, call, or email is one record and appears once, even when linked to multiple contacts. Its default export owner is the first contact it was created on. Members can change the owner to another linked contact. Every linked contact remains listed on the exported activity. Binary attachment bytes are omitted; attachment metadata is retained. The v1 YAML contract and a working Typst table example are in [the export documentation](../export/README.md).

## Organization letter of intent workflow

An LOI belongs to one organization. Each team sets its business name and logo and may override the built-in Typst template. The built-in [Typst source](../../packages/api/src/templates/loi-default.typ) follows the supplied green/cream A4 layout. A new LOI starts with seven filled, business-neutral [editable sections](../../packages/api/src/loi-template.ts): Felles intensjon, Formål, Tiltenkt samarbeid, Omtale av dialogen, Økonomi, Fortrolighet og rettigheter, and Oppstart og uforpliktende karakter. Prior Rana/mining names, dates, roles, and industry claims are absent. The title, subtitle, project name, signer roles, and signature note are editable variables; organization name, signers, and document date come from the form. The team-side signer defaults to the creator and supports team-member autocomplete. The counterparty name comes from the organization record, which may have an uploaded or linked PNG logo. The API compiles PDFs with the Typst CLI and stores each generated version.

When starting a new LOI, the editor suggests **Vil du bruke forrige sendte LOI som utgangspunkt?** It displays the latest sent LOI across the team, including its company and sender. **Forhåndsvis PDF** opens that sent PDF before anything is copied. Closing the preview leaves the new draft untouched. **Bruk som utgangspunkt** copies the sent version's editable sections and variables into an independent draft. The selected target organization stays selected. The counterparty signer is copied only when source and target organization match.

A member marks a generated PDF version as sent after sending it externally. That PDF and its editable content snapshot are retained; the app does not send the LOI email. Generated and signed PDFs remain separate timestamped versions. A signed PDF upload belongs to the organization and suggests changing its status to `Signert intensjonsavtale`, without applying the change automatically.

## Acceptance examples

1. A meeting linked to three contacts appears once in exported YAML under its chosen export owner, with all three links represented.
2. A research note and a confirmed duplicate do not appear in full-log export.
3. A fresh LOI has seven populated, business-neutral sections. Its team/project and counterparty fields are editable; its PDF follows the supplied design.
4. The reuse suggestion names the company and member associated with the last sent LOI. The member can preview its PDF and close it without creating a draft.
5. Choosing **Bruk som utgangspunkt** creates an independently editable LOI for the selected target organization.
6. A signed PDF upload attaches to the organization and prompts, but does not automatically apply, the signed-LOI status.

## Implementation notes

- The built-in source reads `data.json` and optional `team-logo.png` and `counterparty-logo.png`. Team admins can import or edit a custom `.typ` source; an empty setting uses the built-in source, including future fixes.
- The supplied source was compiled as one-page A4 with generic sections and visually inspected. A generated version records its source fields at compile time; marking that version sent restores those exact fields.
- All generated and signed PDFs are retained as separate versions. Signed uploads keep their original filenames as labels.
