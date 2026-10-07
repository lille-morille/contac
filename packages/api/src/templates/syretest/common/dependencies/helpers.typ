#let project = yaml("../project.yaml")
#import "../kontaktlogg.typ": cite-contact
#let guidance(body) = if project.show_guidance {
  block(fill: rgb("f7f5ef"), inset: 8pt, radius: 3pt, breakable: true)[
    #set text(size: 9pt, fill: rgb("665e52"))
    #set par(justify: false, leading: 0.5em)
    #body
  ]
}
#let placeholder(body) = if project.show_guidance {
  text(fill: rgb("777777"), style: "italic", body)
}
