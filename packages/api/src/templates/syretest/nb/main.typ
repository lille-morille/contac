// Requires Typst 0.15.1+ for PDF appendices.
#import "dependencies/helpers.typ": guidance, placeholder, cite-contact
#let project = yaml("project.yaml")
#set page(paper: "a4", margin: 25mm)
#set text(lang: "nb", font: "Libertinus Serif", size: 12pt)
#set par(leading: 0.69em, justify: true)
#show figure: set block(breakable: true)
#show figure.where(kind: table): set figure.caption(position: top)
#include "title-page.typ"
#pagebreak()
#align(center + horizon)[
  #outline(title: [Innholdsfortegnelse], target: heading.where(supplement: [Report]))
  #v(28pt)
  Tips til leseren: Trykk på kildehenvisninger til kontaktloggen for å hoppe til riktig sted i vedlegget.
]
#pagebreak()
#set heading(numbering: "1.1", supplement: [Report])
#counter(heading).update(0)
#set page(footer: context {
  let start = counter(page).at(<report-start>).first()
  let end = counter(page).at(<report-end>).first()
  align(center, numbering("1 | 1", counter(page).get().first() - start + 1, end - start + 1))
})
#metadata("body-start") <report-start>
#guidance[Dere må gjøre selvstendige vurderinger om hvilke aspekter som er mest sentrale å belyse. Rapporten skal ikke være lenger enn 8 sider eksklusiv forside, innholdsregister, kilder og vedlegg. Kontaktlogg er obligatorisk som vedlegg.]
#include "sections/case-change.typ"
#include "sections/summary.typ"
#include "sections/problem-and-solution.typ"
#include "sections/market-and-industry.typ"
#include "sections/business-model.typ"
#include "sections/financials.typ"
#include "sections/sustainability.typ"
#include "sections/background-and-organisation.typ"
#include "sections/group-assessment.typ"
#metadata("body-end") <report-end>
#pagebreak()
#set page(footer: none)
#set heading(numbering: none, supplement: [References])
#if yaml("bibliography.yml").len() > 0 {
  bibliography("bibliography.yml", title: [Referanser])
} else {
  heading([Referanser])
  placeholder[Legg kilder i `bibliography.yml` og siter dem med `@kildenøkkel`.]
}
#pagebreak()
#outline(target: heading.where(supplement: [Vedlegg]), title: [Vedlegg])
#pagebreak()
#set heading(numbering: "A", supplement: [Vedlegg])
#counter(heading).update(0)
#set text(size: 11pt)
= Kontaktlogg (Obligatorisk vedlegg)
#guidance[Utfyllende dokumentasjon er essensielt for at et team senere skal kunne forstå og anvende informasjonen uten å ha deltatt i syretesten. Sorter kontaktloggen i relevante kategorier, med den viktigste informasjonen først. Kontakter relatert til drepte caser/pivotering eller informasjon som ikke er relevant, legges nederst i kontaktloggen med tydelig merking. Kontaktloggen må være lesbar.]
#include "kontaktlogg.typ"
#let loi-files = json("loi/manifest.json")
#for file in loi-files {
  for (index, size) in file.pages.enumerate() {
    page(width: size.width * 1pt, height: size.height * 1pt, margin: 0pt, header: none, footer: none)[
      #if index == 0 {
        place(top + left, hide(heading([LOI: #file.title])))
      }
      #place(top + left, image("loi/" + file.file, page: index + 1, width: 100%, height: 100%, fit: "contain", alt: file.title))
    ]
  }
}
