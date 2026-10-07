#let project = yaml("project.yaml")
#let submission-date = datetime.today()
#set align(center)
#v(35mm)
#image("graphics/entreprenorskolen.png", width: 70%)
#v(10mm)
#set text(size: 14pt)
*#project.course.code* - #project.course.name
#v(5mm)
#line(length: 100%)
#text(size: 20pt)[#project.case_name
#linebreak()
Feasibility Study #project.study_number - Group #project.group]
#line(length: 100%)
#v(20mm)
_Authors:_
#linebreak()
#for author in project.authors {
  text(12pt, [#author.name#if author.title != "" { [ · #emph(author.title)] }])
  linebreak()
}
#v(10mm)
#submission-date.display("[day].[month].[year]")
