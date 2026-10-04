#let data = json("data.json")
#let project-name = if data.project_name == "" { data.team_business_name } else { data.project_name }
#let project-owner = data.our_signer_name
#let project-role = data.our_signer_role
#let partner-name = data.organization_name
#let partner-contact = data.counterparty_signer_name
#let partner-role = data.counterparty_signer_role
#let document-date = data.document_date

#set page(
  paper: "a4",
  margin: (x: 19mm, top: 16mm, bottom: 15mm),
  fill: rgb("#FCFCFA"),
)
#set text(
  font: ("Avenir Next", "Arial", "Liberation Sans"),
  size: 9.2pt,
  fill: rgb("#18211D"),
  lang: "nb",
)
#set par(leading: 0.63em, justify: false)
#set heading(numbering: none)

#let green = rgb("#174D3A")
#let pale-green = rgb("#E8F0EB")
#let warm-gray = rgb("#6A716D")
#let rule = rgb("#CFD7D2")

#let section(title, body) = {
  block(above: 11pt, below: 3pt)[
    #text(size: 8.2pt, weight: "bold", fill: green)[#upper(title)]
    #v(-3pt)
    #body
  ]
}

#let item(body) = {
  grid(
    columns: (7pt, 1fr),
    column-gutter: 4pt,
    [#text(fill: green, weight: "bold")[•]], [#body],
  )
  v(1.8pt)
}

#let body-content(body) = {
  for line in body.split("\n") {
    if line.starts-with("• ") {
      item(line.slice(4))
    } else if line != "" {
      par(line)
    }
  }
}

#align(right)[
  #text(size: 7.8pt, fill: warm-gray, tracking: 0.04em)[#document-date]
]

#v(-2pt)
#text(size: 21pt, weight: "bold", fill: green, tracking: -0.02em)[#data.document_title]
#v(1pt)
#text(size: 9.5pt, fill: warm-gray)[#data.subtitle]

#v(7pt)
#line(length: 100%, stroke: 1pt + green)
#v(6pt)

#grid(
  columns: (1fr, 1fr),
  column-gutter: 18pt,
  [
    #if data.team_logo != none { image(data.team_logo, height: 12mm) }
    #text(size: 7.8pt, fill: warm-gray, weight: "bold")[PROSJEKTET]
    #v(2pt)
    #text(weight: "bold")[#project-name]
    #linebreak()
    #text(size: 8.3pt, fill: warm-gray)[#project-owner · #project-role]
  ],
  [
    #if data.counterparty_logo != none { image(data.counterparty_logo, height: 12mm) }
    #text(size: 7.8pt, fill: warm-gray, weight: "bold")[INTERESSENT]
    #v(2pt)
    #text(weight: "bold")[#partner-name]
    #linebreak()
    #text(size: 8.3pt, fill: warm-gray)[#partner-contact · #partner-role]
  ],
)

#v(7pt)
#if data.sections.len() > 0 {
  block(
    fill: pale-green,
    inset: (x: 10pt, y: 8pt),
    radius: 3pt,
    width: 100%,
  )[
    #text(weight: "bold", fill: green)[#data.sections.at(0).title]
    #h(5pt)
    #body-content(data.sections.at(0).body)
  ]
}

#for entry in data.sections.slice(1) {
  section(entry.title, body-content(entry.body))
}

#v(7pt)
#line(length: 100%, stroke: 0.7pt + rule)
#v(6pt)
#text(size: 8.4pt, fill: warm-gray)[#data.signature_note]

#v(11pt)
#grid(
  columns: (1fr, 1fr),
  column-gutter: 22pt,
  [
    #line(length: 100%, stroke: 0.7pt + rgb("#75807A"))
    #v(3pt)
    #text(size: 8.2pt, weight: "bold")[#project-owner]
    #linebreak()
    #text(size: 7.6pt, fill: warm-gray)[#project-role]
    #v(7pt)
    #grid(
      columns: (1fr, 1fr),
      column-gutter: 8pt,
      [#line(length: 100%, stroke: 0.5pt + rule) \
        #text(size: 7.3pt, fill: warm-gray)[Signatur]],
      [#line(length: 100%, stroke: 0.5pt + rule) \
        #text(size: 7.3pt, fill: warm-gray)[Dato]],
    )
  ],
  [
    #line(length: 100%, stroke: 0.7pt + rgb("#75807A"))
    #v(3pt)
    #text(size: 8.2pt, weight: "bold")[#partner-contact]
    #linebreak()
    #text(size: 7.6pt, fill: warm-gray)[#partner-role · #partner-name]
    #v(7pt)
    #grid(
      columns: (1fr, 1fr),
      column-gutter: 8pt,
      [#line(length: 100%, stroke: 0.5pt + rule) \
        #text(size: 7.3pt, fill: warm-gray)[Signatur]],
      [#line(length: 100%, stroke: 0.5pt + rule) \
        #text(size: 7.3pt, fill: warm-gray)[Dato]],
    )
  ],
)
