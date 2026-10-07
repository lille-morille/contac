"""Refresh the LOI manifest after manually adding/removing PDFs. Requires pypdf."""
from pathlib import Path
import json
from pypdf import PdfReader

root = Path(__file__).resolve().parent / "loi"
entries = []
for pdf in sorted(root.glob("*"), key=lambda p: p.name.casefold()):
    if not pdf.is_file() or pdf.suffix.lower() != ".pdf":
        continue
    reader = PdfReader(pdf)
    if reader.is_encrypted:
        raise ValueError(f"Password-protected PDF: {pdf.name}")
    pages = []
    for page in reader.pages:
        width, height = float(page.cropbox.width), float(page.cropbox.height)
        if page.rotation % 180:
            width, height = height, width
        pages.append({"width": width, "height": height})
    entries.append({"file": pdf.name, "title": pdf.stem, "pages": pages})
manifest = root / "manifest.json"
temporary = root / "manifest.json.tmp"
temporary.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
temporary.replace(manifest)
print(f"Included {len(entries)} PDFs, {sum(len(e['pages']) for e in entries)} pages.")
