// Replace this entire file with the Typst export from Contac.
#let cite-contact(..args) = panic("Replace kontaktlogg.typ with the current Contac Typst export before citing contacts.")
#let report-data = none
#let settings = none
#let render-contact-log(data, settings, intro: none) = [
  #heading(level: 1)[Contact Log]
  #if intro != none { intro }
  Copy the Typst export from the contact log and replace all contents of `kontaktlogg.typ`.
]
