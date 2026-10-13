# Feasibility study template

1. Edit `project.yaml` and the files in `sections/`.
2. Copy Contac's Typst export into `kontaktlogg.typ`, replacing the entire file.
3. Cite permanent contact numbers with `#cite-contact(1, 2)` (import from `dependencies/helpers.typ` in each section). The rendered citations show the contacts' current export numbers. Library quote snippets use the same helper. Choose included contacts, column order and relevance order in Contac’s Eksport page before copying the Typst export.
4. Add bibliography entries to `bibliography.yml`, then cite with `@source-key`.
5. Download signed LOIs from Contac and extract the ZIP into this project's root. It supplies `loi/manifest.json` and the original PDFs. All pages appear automatically in the appendix.
6. For PDFs added manually to `loi/`, install `pypdf` with `python3 -m pip install pypdf`, then run `python3 prepare-lois.py`. Run it again after adding/removing/replacing a PDF. Typst cannot scan a directory itself. You may also edit the manifest manually.
7. Set `show_guidance: false` before submission, then compile with **Typst 0.15.1+**: `typst compile main.typ main.pdf`.

The 8-page limit applies to the body, including pivots and the summary; cover, contents, references and appendices are excluded. The body footer counts only body pages. The template's guidance is taken from the professor's 2026 English PDF. Optional external-idea guidance remains labelled as such.

The official logo is from https://www.entreprenorskolen.no/NSE.png (retrieved 2026-10-07). The initial project contains no case data, contact records, signed LOIs or other submitted attachments.
