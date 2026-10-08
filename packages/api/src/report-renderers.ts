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

export function reportEntryParts(entry: ReportEntry): {
  heading: string;
  body: string;
  before: string[];
  summary: string | null;
  after: string[];
} {
  const activity = entry.activity;
  const heading = `${displayDate(activity.occurredAt)} · ${kindLabels[activity.kind]}`;
  if (entry.kind === "reference") {
    const body = `Se oppføringen under K-${entry.owner.number} (${entry.owner.name}).`;
    return {
      heading,
      body,
      before: [],
      summary: null,
      after: [],
    };
  }
  const others = entry.participants.filter((person) => person.id !== entry.owner.id);
  const before: string[] = [];
  if (others.length)
    before.push(
      `Andre deltakere: ${others.map((person) => `K-${person.number} ${person.name}`).join(", ")}`,
    );
  if (activity.missedOutcome) before.push(`Utfall: ${activity.missedOutcome}`);
  if (activity.email) {
    before.push(`Fra: ${activity.email.from}`);
    before.push(`Til: ${activity.email.to.join(", ")}`);
    if (activity.email.cc.length) before.push(`Kopi: ${activity.email.cc.join(", ")}`);
    if (activity.email.bcc.length) before.push(`Blindkopi: ${activity.email.bcc.join(", ")}`);
    before.push(`Emne: ${activity.email.subject}`);
  }
  const after: string[] = [];
  if (activity.attachments.length)
    after.push(
      `Vedlegg: ${activity.attachments
        .map((file) => `${file.name} (${file.mimeType}, ${file.sizeBytes} byte)`)
        .join(", ")}`,
    );
  return {
    heading,
    body: [...before, `Sammendrag/notater: ${activity.summary || "(ingen)"}`, ...after].join("\n"),
    before,
    summary: activity.summary,
    after,
  };
}

function entryText(entry: ReportEntry): string {
  const { heading, body } = reportEntryParts(entry);
  return `${heading}\n${body}`;
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
    values: Object.fromEntries(
      columns
        .filter((column) => column !== "log")
        .map((column) => [column, reportCell(row, column)]),
    ),
    entries: row.entries.map((entry) => {
      const { heading, body } = reportEntryParts(entry);
      return { heading, body };
    }),
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
#let navy = rgb("#16384c")
#let pale = rgb("#f1f6f9")
#let metadata-field(row, column) = [
  #text(size: 7.5pt, weight: "bold", fill: navy, report-data.labels.at(column))
  #linebreak()
  #v(1.5pt)
  #log-lines(row.values.at(column, default: ""))
]
#let log-box(row) = {
  if row.entries.len() > 0 {
    block(width: 100%, breakable: true, above: 3pt, below: 3pt,
      inset: 7pt, radius: 2pt, fill: pale)[
      #text(size: 9pt, weight: "bold", fill: navy, "Logg")
      #for (index, entry) in row.entries.enumerate() {
        block(width: 100%, breakable: true, above: 6pt, below: 0pt)[
          #if index > 0 { line(length: 100%, stroke: 0.35pt + rgb("#cbd8e0")) }
          #text(size: 8.5pt, weight: "bold", fill: navy, entry.heading)
          #linebreak()
          #v(1.5pt)
          #log-lines(entry.body)
        ]
      }
    ]
  }
}
#let detail-box(row, column) = {
  let value = row.values.at(column, default: "")
  if value != "" {
    block(width: 100%, breakable: true, above: 3pt, below: 3pt,
      inset: 7pt, radius: 2pt, fill: pale)[
      #text(size: 9pt, weight: "bold", fill: navy, report-data.labels.at(column))
      #linebreak()
      #log-lines(value)
    ]
  }
}
#let contact-card(row, columns, compact: false) = {
  let metadata = columns.filter(column =>
    column != "number" and column != "description" and
    column != "stikkord" and column != "log" and
    (column == "name" or row.values.at(column, default: "") != "")
  )
  [
    #block(width: 100%, breakable: false, above: 9pt, below: if compact { 5pt } else { 3pt })[
      #line(length: 100%, stroke: 0.5pt + rgb("#cbd8e0"))
      #v(3pt)
      #grid(
        columns: (9mm, 1fr), gutter: 3mm,
        align: top,
        [#contact-anchor(row.number)#text(size: 8pt, weight: "bold", fill: navy, str(row.number))],
        grid(columns: (1fr, 1fr), column-gutter: 6mm, row-gutter: if compact { 7pt } else { 5pt },
          ..metadata.map(column => metadata-field(row, column))),
      )
    ]
    #if compact {
      if "stikkord" in columns and row.values.at("stikkord", default: "") != "" {
        [#v(6pt)#text(size: 8pt, weight: "bold", fill: navy, "Stikkord: ")#log-lines(row.values.at("stikkord"))]
      }
    } else {
      for column in columns {
        if column == "log" { log-box(row) }
        else if column == "description" or column == "stikkord" {
          detail-box(row, column)
        }
      }
    }
  ]
}
#let render-contact-log(data, settings) = [
  #pagebreak(weak: true)
  #set page(paper: "a4", flipped: false, margin: (x: 16mm, y: 15mm))
  #set text(size: 9pt, lang: "nb", fill: rgb("#172129"))
  #set par(leading: 0.45em)
  #text(size: 16pt, weight: "bold", settings.title)
  #if settings.subtitle != "" { [#linebreak()#settings.subtitle] }
  #v(5mm)
  #for row in data.rows { contact-card(row, settings.columns) }
  #if data.compactRows.len() > 0 {
    [#v(7mm)#heading(level: 2, outlined: false)[Uten aktivitet]#v(2mm)]
    for row in data.compactRows { contact-card(row, data.compactColumns, compact: true) }
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
