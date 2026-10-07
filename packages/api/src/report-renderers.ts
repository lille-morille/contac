import {
  reportColumnLabels,
  type ReportColumnId,
  type ReportData,
  type ReportEntry,
  type ReportRow,
} from "@contac/core";

const statusLabels: Record<string, string> = {
  ikke_kontaktet: "Ikke kontaktet",
  avsluttet: "Avsluttet",
  kan_kontaktes_igjen: "Kan kontaktes igjen",
  skal_ringe: "Skal ringe",
  venter_pa_svar: "Venter på svar",
  follow_up: "Follow up / Ring igjen",
  ikke_kontakt_igjen: "Ikke kontakt igjen",
};
const kindLabels = {
  phone: "Telefonsamtale",
  missed_phone: "Ubesvart anrop",
  meeting: "Møte",
  email: "E-post",
} as const;
const compactCandidates: ReportColumnId[] = [
  "number",
  "name",
  "organization",
  "contactInfo",
  "status",
  "stikkord",
];

function displayDate(value: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Oslo",
  }).format(new Date(value));
}

function entryText(entry: ReportEntry): string {
  const activity = entry.activity;
  const heading = `${displayDate(activity.occurredAt)} · ${kindLabels[activity.kind]}`;
  if (entry.kind === "reference")
    return `${heading}\nSe oppføringen under K-${entry.owner.number} (${entry.owner.name}).`;
  const others = entry.participants.filter((person) => person.id !== entry.owner.id);
  const parts = [heading];
  if (others.length)
    parts.push(
      `Andre deltakere: ${others.map((person) => `K-${person.number} ${person.name}`).join(", ")}`,
    );
  if (activity.missedOutcome) parts.push(`Utfall: ${activity.missedOutcome}`);
  if (activity.email) {
    parts.push(`Fra: ${activity.email.from}`);
    parts.push(`Til: ${activity.email.to.join(", ")}`);
    if (activity.email.cc.length) parts.push(`Kopi: ${activity.email.cc.join(", ")}`);
    if (activity.email.bcc.length) parts.push(`Blindkopi: ${activity.email.bcc.join(", ")}`);
    parts.push(`Emne: ${activity.email.subject}`);
  }
  parts.push(`Sammendrag/notater: ${activity.summary || "(ingen)"}`);
  if (activity.transcript) parts.push(`Transkripsjon: ${activity.transcript}`);
  if (activity.attachments.length)
    parts.push(
      `Vedlegg: ${activity.attachments
        .map((file) => `${file.name} (${file.mimeType}, ${file.sizeBytes} byte)`)
        .join(", ")}`,
    );
  return parts.join("\n");
}

export function reportCell(row: ReportRow, column: ReportColumnId): string {
  const person = row.contact;
  switch (column) {
    case "number":
      return `K-${person.contactNumber}`;
    case "assignee":
      return person.assigneeName ?? "";
    case "organization":
      return person.companyName;
    case "name":
      return person.name;
    case "contactInfo":
      return [person.email, person.phone].filter(Boolean).join("\n");
    case "status":
      return statusLabels[person.status] ?? person.status;
    case "description":
      return person.description ?? "";
    case "personTags":
      return person.personTags.join(", ");
    case "domains":
      return person.domains.join(", ");
    case "stikkord":
      return person.stikkord ?? "";
    case "log":
      return row.entries.map(entryText).join("\n\n");
  }
}

export function compactColumns(report: ReportData): ReportColumnId[] {
  return compactCandidates.filter((column) => report.settings.columns.includes(column));
}

function csvCell(value: string): string {
  // Quoting does not stop spreadsheets from evaluating a cell as a formula.
  const safe = /^\s*[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function renderReportCsv(report: ReportData): string {
  const columns = report.settings.columns;
  const lines = [columns.map((column) => csvCell(reportColumnLabels[column])).join(",")];
  for (const row of [...report.rows, ...report.noActivityRows])
    lines.push(columns.map((column) => csvCell(reportCell(row, column))).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderReportHtml(report: ReportData): string {
  const table = (rows: ReportRow[], columns: ReportColumnId[]) =>
    `<table style="border-collapse:collapse;width:100%"><thead><tr>${columns
      .map(
        (column) =>
          `<th style="border:1px solid #cbd5dc;background:#16384c;color:#fff;padding:5px;text-align:left">${htmlEscape(reportColumnLabels[column])}</th>`,
      )
      .join("")}</tr></thead><tbody>${rows
      .map(
        (row) =>
          `<tr>${columns.map((column) => `<td style="border:1px solid #cbd5dc;padding:5px;vertical-align:top;white-space:pre-wrap">${htmlEscape(reportCell(row, column))}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody></table>`;
  return `<div><h1>${htmlEscape(report.settings.title)}</h1>${
    report.settings.subtitle ? `<p>${htmlEscape(report.settings.subtitle)}</p>` : ""
  }${report.rows.length ? table(report.rows, report.settings.columns) : ""}${
    report.noActivityRows.length
      ? `<h2>Uten aktivitet</h2>${table(report.noActivityRows, compactColumns(report))}`
      : ""
  }</div>`;
}

function typstString(value: string): string {
  let result = '"';
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (character === "\\") result += "\\\\";
    else if (character === '"') result += '\\"';
    else if (character === "\n") result += "\\n";
    else if (character === "\r") result += "\\r";
    else if (character === "\t") result += "\\t";
    else if (code < 32 || code === 127) result += `\\u{${code.toString(16)}}`;
    else result += character;
  }
  return result + '"';
}

function typstRows(rows: ReportRow[], columns: ReportColumnId[]) {
  return rows.map((row) => ({
    number: row.contact.contactNumber,
    values: Object.fromEntries(columns.map((column) => [column, reportCell(row, column)])),
  }));
}

export function renderReportTypst(report: ReportData): string {
  const payload = {
    labels: reportColumnLabels,
    rows: typstRows(report.rows, report.settings.columns),
    compactRows: typstRows(report.noActivityRows, compactColumns(report)),
    compactColumns: compactColumns(report),
  };
  return (
    `// Generert av Contac. Disse innstillingene kan redigeres etter eksport.\n` +
    `#let settings = (\n` +
    `  title: ${typstString(report.settings.title)},\n` +
    `  subtitle: ${typstString(report.settings.subtitle)},\n` +
    `  columns: (${report.settings.columns.map(typstString).join(", ")},),\n` +
    `)\n` +
    `#let report-data = json(bytes(${typstString(JSON.stringify(payload))}))\n` +
    String.raw`
#let contact-index = {
  let result = (:)
  for row in report-data.rows + report-data.compactRows {
    result.insert(str(row.number), row)
  }
  result
}
#let contact-target(number) = label("kontaktlogg-k-" + str(number))
#let contact-anchor(number) = [#metadata(number)#contact-target(number)]
#let cite-contact(..args) = {
  let numbers = args.pos()
  assert(numbers.len() > 0, message: "Oppgi minst ett kontaktnummer.")
  let links = numbers.map(number => {
    assert(type(number) == int, message: "Bruk permanent kontaktnummer, for eksempel #cite-contact(12).")
    let person = contact-index.at(str(number), default: none)
    assert(person != none, message: "K-" + str(number) + " er ikke med i den eksporterte kontaktloggen.")
    link(contact-target(number), "K-" + str(number) + if numbers.len() == 1 { ": " + person.values.at("name") } else { "" })
  })
  [(#links.join([; ]))]
}

#let log-lines(value) = {
  let lines = value.split("\n")
  for (index, line) in lines.enumerate() {
    text(line)
    if index < lines.len() - 1 { linebreak() }
  }
}
#let column-width(column) = {
  if column == "number" { 11mm }
  else if column == "log" { 4fr }
  else if column == "stikkord" { 1.6fr }
  else if column == "contactInfo" { 1.35fr }
  else if column == "name" or column == "organization" { 1.2fr }
  else { 1fr }
}
#let report-table(rows, columns) = {
  let cells = rows.map(row => columns.map(column => {
    let value = row.values.at(column, default: "")
    if column == "number" {
      table.cell(breakable: true)[#contact-anchor(row.number)#value]
    } else {
      table.cell(breakable: true, log-lines(value))
    }
  })).flatten()
  table(
    columns: columns.map(column-width),
    align: left + top,
    inset: (x: 3pt, y: 3pt),
    stroke: 0.35pt + rgb("#d6dee3"),
    fill: (_, y) => if y == 0 { rgb("#16384c") } else if calc.even(y) { rgb("#f4f7f8") } else { white },
    table.header(repeat: true, ..columns.map(column => text(size: 9pt, weight: "bold", fill: white, report-data.labels.at(column)))),
    ..cells,
  )
}
#let render-contact-log(data, settings) = [
  #pagebreak(weak: true)
  #set page(paper: "a4", flipped: true, margin: (x: 9mm, y: 10mm))
  #set text(size: 9pt, lang: "nb", fill: rgb("#172129"))
  #set par(leading: 0.4em)
  #text(size: 16pt, weight: "bold", settings.title)
  #if settings.subtitle != "" { [#linebreak()#settings.subtitle] }
  #v(4mm)
  #if data.rows.len() > 0 { report-table(data.rows, settings.columns) }
  #if data.compactRows.len() > 0 {
    [#v(7mm)#text(size: 13pt, weight: "bold", "Uten aktivitet")#v(3mm)]
    report-table(data.compactRows, data.compactColumns)
  }
  #pagebreak(weak: true)
]
#render-contact-log(report-data, settings)
`
  );
}

function latexEscape(value: string): string {
  const characters: Record<string, string> = {
    "\\": "\\textbackslash{}",
    "{": "\\{",
    "}": "\\}",
    $: "\\$",
    "%": "\\%",
    "&": "\\&",
    _: "\\_",
    "#": "\\#",
    "^": "\\textasciicircum{}",
    "~": "\\textasciitilde{}",
  };
  return [...value].map((character) => characters[character] ?? character).join("");
}

function latexParagraphs(value: string): string {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => latexEscape(paragraph).replaceAll("\n", "\\\\\n"))
    .join("\n\\par\n");
}

export function renderReportLatex(report: ReportData): string {
  const sections = [...report.rows, ...report.noActivityRows].map((row) => {
    const columns = row.hasActivity ? report.settings.columns : compactColumns(report);
    const parts: string[] = [];
    let fields: string[] = [];
    const flushFields = () => {
      if (fields.length)
        parts.push(`\\begin{description}\n${fields.join("\n")}\n\\end{description}`);
      fields = [];
    };
    for (const column of columns) {
      if (column === "log") {
        flushFields();
        if (row.entries.length)
          parts.push(`\\noindent\\textbf{Logg}\\par\n${latexParagraphs(reportCell(row, "log"))}`);
      } else {
        fields.push(
          `\\item[${latexEscape(reportColumnLabels[column])}] ${latexParagraphs(reportCell(row, column))}`,
        );
      }
    }
    flushFields();
    return (
      `\\hypertarget{kontaktlogg-k-${row.contact.contactNumber}}{}\n` +
      `\\subsection*{K-${row.contact.contactNumber} ${latexEscape(row.contact.name)}}\n` +
      parts.join("\n")
    );
  });
  const active = sections.slice(0, report.rows.length).join("\n\\medskip\n");
  const compact = sections.slice(report.rows.length).join("\n\\smallskip\n");
  return (
    `\\documentclass[a4paper,landscape]{article}\n` +
    `\\usepackage[T1]{fontenc}\n\\usepackage[utf8]{inputenc}\n` +
    `\\usepackage[margin=12mm]{geometry}\n\\usepackage{hyperref}\n` +
    `\\begin{document}\n\\small\n\\section*{${latexEscape(report.settings.title)}}\n` +
    (report.settings.subtitle ? `${latexEscape(report.settings.subtitle)}\\par\n` : "") +
    `${active}\n${compact ? `\\section*{Uten aktivitet}\n${compact}\n` : ""}\\end{document}\n`
  );
}
