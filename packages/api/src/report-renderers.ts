import {
  reportLabels,
  reportStatusLabel,
  type ReportColumnId,
  type ReportData,
  type ReportEntry,
  type ReportRow,
} from "@contac/core";

const kindLabels = {
  phone: "Telefonsamtale",
  missed_phone: "Ubesvart anrop",
  meeting: "Møte",
  email: "E-post",
} as const;
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

export function reportCell(
  row: ReportRow,
  column: ReportColumnId,
  language: "nb" | "en" = "nb",
): string {
  const person = row.contact;
  switch (column) {
    case "number":
      return `K-${row.exportNumber}`;
    case "assignee":
      return person.assigneeName ?? "";
    case "organization":
      return person.companyName;
    case "name":
      return person.name;
    case "contactInfo":
      return [person.email, person.phone].filter(Boolean).join("\n");
    case "status":
      return reportStatusLabel(person.status, language);
    case "relevance":
      return language === "en"
        ? person.relevance === "high"
          ? "High"
          : person.relevance === "medium"
            ? "Medium"
            : person.relevance === "low"
              ? "Low"
              : "Not rated"
        : person.relevance === "high"
          ? "Høy"
          : person.relevance === "medium"
            ? "Middels"
            : person.relevance === "low"
              ? "Lav"
              : "Ikke vurdert";
    case "description":
      return person.description ?? "";
    case "sammendrag":
      return person.sammendrag ?? "";
    case "personTags":
      return person.personTags.join(", ");
    case "domains":
      return person.domains.join(", ");
    case "stikkord":
      return person.stikkord ?? "";
  }
}
export function reportLogCell(row: ReportRow): string {
  return row.entries.map(entryText).join("\n\n");
}

function csvCell(value: string): string {
  // Quoting does not stop spreadsheets from evaluating a cell as a formula.
  const safe = /^\s*[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function renderReportCsv(report: ReportData): string {
  const columns = report.settings.columns;
  const includeSection = report.settings.sectionMode !== "activity";
  const lines = [
    [
      ...columns.map((column) => csvCell(reportLabels(report.settings.language)[column])),
      ...(includeSection
        ? [csvCell(report.settings.language === "en" ? "Section" : "Seksjon")]
        : []),
    ].join(","),
  ];
  for (const section of report.sections)
    for (const row of section.rows)
      lines.push(
        [
          ...columns.map((column) => csvCell(reportCell(row, column, report.settings.language))),
          ...(includeSection ? [csvCell(section.title)] : []),
        ].join(","),
      );
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
function reportTitle(report: ReportData) {
  return report.settings.language === "en" && report.settings.title === "Kontaktlogg"
    ? "Contact log"
    : report.settings.title;
}

export function renderReportHtml(report: ReportData): string {
  const table = (rows: ReportRow[], columns: ReportColumnId[]) =>
    `<table style="border-collapse:collapse;width:100%"><thead><tr>${columns
      .map(
        (column) =>
          `<th style="border:1px solid #cbd5dc;background:#16384c;color:#fff;padding:5px;text-align:left">${htmlEscape(reportLabels(report.settings.language)[column])}</th>`,
      )
      .join("")}</tr></thead><tbody>${rows
      .map(
        (row) =>
          `<tr>${columns.map((column) => `<td style="border:1px solid #cbd5dc;padding:5px;vertical-align:top;white-space:pre-wrap">${htmlEscape(reportCell(row, column, report.settings.language))}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody></table>`;
  return `<div><h1>${htmlEscape(reportTitle(report))}</h1>${
    report.settings.subtitle ? `<p>${htmlEscape(report.settings.subtitle)}</p>` : ""
  }${report.sections.map((section) => `<h2>${htmlEscape(section.title)}</h2>${table(section.rows, report.settings.columns)}`).join("")}</div>`;
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

function typstRows(rows: ReportRow[], columns: ReportColumnId[], language: "nb" | "en") {
  return rows.map((row) => ({
    number: row.contact.contactNumber,
    exportNumber: row.exportNumber,
    status: row.contact.status,
    values: Object.fromEntries(
      columns.map((column) => [
        column,
        column === "contactInfo"
          ? reportCell(row, column, language).replaceAll(/([@._-])/gu, "$1\u200b")
          : reportCell(row, column, language),
      ]),
    ),
  }));
}

const sectionColors: Record<string, readonly [string, string]> = {
  "company:kunde": ["#3d6580", "#edf3f6"],
  "company:ekspert": ["#477367", "#eef4f1"],
  "company:samarbeidspartner": ["#6e6281", "#f2f0f5"],
  "company:konkurrent": ["#956451", "#f7f1ee"],
  "company:ingen": ["#65717a", "#f1f3f4"],
  "status:kan_kontaktes_igjen": ["#3d6580", "#edf3f6"],
  "status:avsluttet": ["#65717a", "#f1f3f4"],
  "status:follow_up": ["#8a6a3f", "#f6f2eb"],
  "status:venter_pa_svar": ["#6e6281", "#f2f0f5"],
  "status:skal_ringe": ["#477367", "#eef4f1"],
  "status:ikke_kontaktet": ["#65717a", "#f1f3f4"],
  "status:ikke_kontakt_igjen": ["#956451", "#f7f1ee"],
};
const fallbackSectionColors = [
  ["#3d6580", "#edf3f6"],
  ["#8a6a3f", "#f6f2eb"],
  ["#477367", "#eef4f1"],
  ["#6e6281", "#f2f0f5"],
] as const;

export function renderReportTypst(report: ReportData): string {
  const payload = {
    labels: reportLabels(report.settings.language),
    sections: report.sections.map((section, index) => {
      const [accent, tint] =
        sectionColors[section.id] ?? fallbackSectionColors[index % fallbackSectionColors.length]!;
      return {
        title: section.title,
        accent,
        tint,
        rows: typstRows(section.rows, report.settings.columns, report.settings.language),
      };
    }),
  };
  return (
    (report.settings.language === "en"
      ? `// Generated by Contac. You can edit these settings after export.\n`
      : `// Generert av Contac. Disse innstillingene kan redigeres etter eksport.\n`) +
    `#let settings = (\n` +
    `  title: ${typstString(reportTitle(report))},\n` +
    `  subtitle: ${typstString(report.settings.subtitle)},\n` +
    `  layout: ${typstString(report.settings.layout)},\n` +
    `  language: ${typstString(report.settings.language)},\n` +
    `  columns: (${report.settings.columns.map(typstString).join(", ")},),\n` +
    `)\n` +
    `#let report-data = json(bytes(${typstString(JSON.stringify(payload))}))\n` +
    String.raw`
#let contact-index = {
  let result = (:)
  for section in report-data.sections {
    for row in section.rows { result.insert(str(row.number), row) }
  }
  result
}
#let contact-target(number) = label("kontaktlogg-k-" + str(number))
#let contact-anchor(number) = [#metadata(number)#contact-target(number)]
#let cite-contact(..args) = {
  let numbers = args.pos()
  assert(numbers.len() > 0, message: if settings.language == "en" { "Provide at least one contact number." } else { "Oppgi minst ett kontaktnummer." })
  let links = numbers.map(number => {
    assert(type(number) == int, message: if settings.language == "en" { "Use a permanent contact number, for example #cite-contact(12)." } else { "Bruk permanent kontaktnummer, for eksempel #cite-contact(12)." })
    let person = contact-index.at(str(number), default: none)
    assert(person != none, message: if settings.language == "en" { "K-" + str(number) + " is not in the exported contact log." } else { "K-" + str(number) + " er ikke med i den eksporterte kontaktloggen." })
    link(contact-target(number), "K-" + str(person.exportNumber) + if numbers.len() == 1 { ": " + person.values.at("name") } else { "" })
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
#let ink = rgb("#172129")
#let muted = rgb("#586670")
#let label = rgb("#77838c")
#let rule = rgb("#b8c2c8")
#let section-heading(title, accent, tint, layout) = [
  #show heading: it => block(width: 100%, sticky: true,
    above: if layout == "grid" { 11mm } else { 9mm }, below: 3mm,
    inset: (x: 9pt, y: if layout == "grid" { 8pt } else { 6pt }),
    fill: tint, stroke: (left: 3pt + accent))[
    #text(size: if layout == "grid" { 18pt } else { 12pt }, weight: "bold", fill: accent, it.body)
  ]
  #heading(level: 2, numbering: none, outlined: true)[#title]
]
#let metadata-field(row, column, accent) = [
  #text(size: 7.5pt, fill: accent, report-data.labels.at(column))
  #linebreak()
  #text(size: 9pt, fill: ink)[#log-lines(row.values.at(column, default: ""))]
]
#let detail-field(row, column) = {
  let value = row.values.at(column, default: "")
  if value != "" {
    block(width: 100%, breakable: true, above: 12pt, below: 0pt)[
      #text(size: 9pt, weight: "bold", fill: ink, report-data.labels.at(column))
      #linebreak()
      #log-lines(value)
    ]
  }
}
#let contact-card(row, columns, accent) = {
  let company = if "organization" in columns { row.values.at("organization", default: "") } else { "" }
  let description = if "description" in columns { row.values.at("description", default: "") } else { "" }
  let metadata = columns.filter(column =>
    column != "number" and column != "name" and column != "organization" and
    column != "description" and column != "sammendrag" and column != "stikkord" and
    row.values.at(column, default: "") != ""
  )
  block(width: 100%, breakable: true, above: 12pt, below: 8pt)[
    #block(width: 100%, breakable: false, below: 4pt)[
      #line(length: 100%, stroke: 0.7pt + rule)
      #v(5pt)
      #grid(
        columns: (15mm, 1fr), gutter: 3mm,
        align: (center + horizon, left + horizon),
        [#contact-anchor(row.number)#text(size: 15pt, weight: "bold", fill: ink, "K-" + str(row.exportNumber))],
        [
          #text(size: 13pt, weight: "bold", fill: ink, row.values.at("name"))
          #if company != "" { [#h(7pt)#text(size: 11pt, fill: muted, company)] }
          #if description != "" {
            [
              #linebreak()
              #v(1pt)
              #text(size: 9pt, fill: ink)[#log-lines(description)]
            ]
          }
        ],
      )
      #if metadata.len() > 0 {
        [#v(4pt)#grid(columns: (1fr, 1fr, 1fr), column-gutter: 5mm, row-gutter: 6pt,
          ..metadata.map(column => metadata-field(row, column, accent)))]
      }
    ]
    #for column in ("stikkord", "sammendrag") {
      if column in columns { detail-field(row, column) }
    }
  ]
}
#let grid-table(section, columns) = {
  let visible-columns = if "name" in columns and "description" in columns {
    columns.filter(column => column != "description")
  } else { columns }
  let column-width = column => {
    if column == "number" { 16mm }
    else if column == "assignee" { 18mm }
    else if column == "organization" { 22mm }
    else if column == "name" { 1.15fr }
    else if column == "contactInfo" { 24mm }
    else if column == "status" { 19mm }
    else if column == "relevance" { 17mm }
    else if column == "stikkord" { 1.85fr }
    else if column == "sammendrag" { 3.1fr }
    else { 1fr }
  }
  let headings = visible-columns.map(column => [#text(size: 8pt, weight: "bold", fill: white, report-data.labels.at(column))])
  let cells = section.rows.map(row => visible-columns.map(column => {
    let value = row.values.at(column, default: "")
    if column == "number" {
      [#contact-anchor(row.number)#text(size: 14pt, fill: ink, str(row.exportNumber))]
    } else if column == "name" and "description" in columns {
      let description = row.values.at("description", default: "")
      [
        #text(size: 9pt, weight: "bold", fill: ink, value)
        #if description != "" { [#linebreak()#text(size: 8pt, fill: muted)[#log-lines(description)]] }
      ]
    } else {
      [#log-lines(value)]
    }
  })).flatten()
  table(
    columns: visible-columns.map(column-width),
    inset: 5pt,
    stroke: 0.4pt + rule,
    fill: (x, y) => if y == 0 { rgb(section.accent) } else if calc.odd(y) { rgb(section.tint) } else { white },
    table.header(..headings),
    ..cells,
  )
}
#let render-contact-log(data, settings, intro: none) = [
  #pagebreak(weak: true)
  #set page(paper: "a4", flipped: settings.layout == "grid", margin: (x: 12mm, y: 12mm))
  #set text(lang: settings.language)
  #heading(level: 1)[#settings.title]
  #set text(size: if settings.layout == "grid" { 8pt } else { 9pt }, fill: ink)
  #set par(leading: 0.32em)
  #if settings.subtitle != "" { [#settings.subtitle] }
  #if intro != none { intro }
  #for section in data.sections {
    section-heading(section.title, rgb(section.accent), rgb(section.tint), settings.layout)
    if settings.layout == "grid" {
      grid-table(section, settings.columns)
    } else {
      for row in section.rows { contact-card(row, settings.columns, rgb(section.accent)) }
    }
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
  const renderRow = (row: ReportRow) => {
    const columns = report.settings.columns;
    const parts: string[] = [];
    let fields: string[] = [];
    const flushFields = () => {
      if (fields.length)
        parts.push(`\\begin{description}\n${fields.join("\n")}\n\\end{description}`);
      fields = [];
    };
    for (const column of columns) {
      fields.push(
        `\\item[${latexEscape(reportLabels(report.settings.language)[column])}] ${latexParagraphs(reportCell(row, column, report.settings.language))}`,
      );
    }
    flushFields();
    return (
      `\\hypertarget{kontaktlogg-k-${row.contact.contactNumber}}{}\n` +
      `\\subsection*{K-${row.exportNumber} ${latexEscape(row.contact.name)}}\n` +
      parts.join("\n")
    );
  };
  const sections = report.sections
    .map(
      (section) =>
        `\\section*{${latexEscape(section.title)}}\n${section.rows.map(renderRow).join("\n\\medskip\n")}`,
    )
    .join("\n");
  return (
    `\\documentclass[a4paper,landscape]{article}\n` +
    `\\usepackage[T1]{fontenc}\n\\usepackage[utf8]{inputenc}\n` +
    `\\usepackage[margin=12mm]{geometry}\n\\usepackage{hyperref}\n` +
    `\\begin{document}\n\\small\n\\section*{${latexEscape(reportTitle(report))}}\n` +
    (report.settings.subtitle ? `${latexEscape(report.settings.subtitle)}\\par\n` : "") +
    `${sections}\n\\end{document}\n`
  );
}
