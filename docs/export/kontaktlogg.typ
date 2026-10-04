// Place this file beside the downloaded kontaktlogg.yaml and run:
// typst compile kontaktlogg.typ kontaktlogg.pdf
#let data = yaml("kontaktlogg.yaml")
#set page(paper: "a4", margin: 15mm)
#set text(size: 8pt, lang: "nb")

#let name-for(id) = {
  let person = data.contacts.find(contact => contact.id == id)
  if person == none { id } else { person.name }
}
#let detail(activity) = {
  let text = activity.summary
  if activity.transcript != "" {
    text = text + "\nTranskripsjon: " + activity.transcript
  }
  if activity.email != none {
    text = text + "\nFra: " + activity.email.from + "\nTil: " + activity.email.to.join(", ")
    text = text + "\nEmne: " + activity.email.subject
  }
  if activity.attachments.len() > 0 {
    text = text + "\nVedlegg: " + activity.attachments.map(file => file.name).join(", ")
  }
  text
}

= Kontaktlogg
#data.team.name

#table(
  columns: (24mm, 35mm, 25mm, 1fr),
  inset: 4pt,
  table.header([Tid], [Eksporteier], [Type], [Innhold]),
  ..data.activities.map(activity => (
    [#activity.occurredAt],
    [#name-for(activity.exportOwnerContactId)],
    [#activity.kind],
    [#detail(activity)],
  )).flatten(),
)
