// Requires Typst 0.15.1+ for PDF appendices.
#import "dependencies/helpers.typ": guidance, placeholder, cite-contact
#let project = yaml("project.yaml")
#set page(paper: "a4", margin: 25mm)
#set text(lang: "en", font: "Libertinus Serif", size: 12pt)
#set par(leading: 0.69em, justify: true)
#show figure: set block(breakable: true)
#show figure.where(kind: table): set figure.caption(position: top)
#include "title-page.typ"
#pagebreak()
#align(center + horizon)[
  #outline(title: [Table of Contents], target: heading.where(supplement: [Report]))
  #v(28pt)
  Reader tip: Click contact citations to jump to the relevant entry in the appendix.
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
#guidance[You must make your own assessments of which aspects are most important to address. The report must not exceed 8 pages, excluding the front page, table of contents, references and appendices. The contact log is a mandatory appendix.]
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
  bibliography("bibliography.yml", title: [References])
} else {
  heading([References])
  placeholder[Add sources to `bibliography.yml` and cite them using `@source-key`.]
}
#pagebreak()
#outline(target: heading.where(supplement: [Appendices]), title: [Appendices])
#pagebreak()
#set heading(numbering: "A", supplement: [Appendices])
#counter(heading).update(0)
#set text(size: 11pt)
= Contact Log (Mandatory Appendix)
#guidance[Thorough documentation is essential so that a team can later understand and use the information without having taken part in the feasibility study. Sort the contact log into relevant categories, with the most important information first. Contacts related to discarded cases, pivots, or information that is no longer relevant should be placed at the bottom of the contact log and clearly labelled. The contact log must be readable.]
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
