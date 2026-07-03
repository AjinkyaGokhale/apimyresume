// Default Cover Letter (APIMyResume)
// A self-contained cover letter adapting the modernpro-coverletter aesthetic
// (MIT, Jiaxin Peng — see ./LICENSE) to the API's generic cover-letter context.
// Used as the fallback for any resume template that does not ship its own
// cover-letter.typ. The author identity comes from the resume profile; the
// addressee + body come from the per-resume cover letter (merged base + child).
// Body text is injected as data and rendered literally — never evaluated as
// Typst markup.

#let ctx = json(bytes(sys.inputs.resume))

#let author = ctx.at("author", default: "")
#let location = ctx.at("location", default: "")
#let date = ctx.at("date", default: "")
#let contacts = ctx.at("contacts", default: ())
#let addressee = ctx.at("addressee", default: (:))
#let body = ctx.at("body", default: (:))

#let primary = rgb("#222222")
#let muted = rgb("#666666")

#set document(author: author, title: author)

#set text(
  font: "New Computer Modern",
  size: 11pt,
  fill: primary,
  lang: "en",
  ligatures: false,
)

#set page(
  paper: "us-letter",
  margin: (top: 2.2cm, bottom: 1.6cm, left: 1.9cm, right: 1.9cm),
)

#show link: set text(fill: rgb("#0645AD"))

// ===== Author header =====
#align(center)[
  #block(text(weight: 700, size: 1.9em, fill: primary)[#author])
]

#let fmt-contact(c) = {
  let value = c.at("value", default: "")
  let href = c.at("href", default: "")
  if value == "" { return none }
  if href != "" { link(href)[#value] } else { value }
}
#let contact-line = contacts.map(fmt-contact).filter(x => x != none)
#if contact-line.len() > 0 {
  v(0.4em)
  align(center, text(size: 0.9em, fill: muted)[#contact-line.join("  |  ")])
}
#if location != "" {
  align(center, text(size: 0.9em, fill: muted)[#smallcaps[#location]])
}

#v(0.6em)
#line(length: 100%, stroke: 0.4pt + primary)
#v(1em)

// ===== Date (right-aligned) =====
#if date != "" {
  align(right, text(fill: muted)[#date])
  v(0.6em)
}

// ===== Addressee block =====
#let addr-line(key) = addressee.at(key, default: "")
#let csz = {
  let city = addr-line("city")
  let state = addr-line("state")
  let zip = addr-line("zip")
  let left = if state != "" { (city, state).filter(x => x != "").join(", ") } else { city }
  (left, zip).filter(x => x != "").join(" ")
}
#pad(
  bottom: 1em,
  align(left)[
    #if addr-line("name") != "" [ #strong[#addr-line("name")] \ ]
    #if addr-line("institution") != "" [ #addr-line("institution") \ ]
    #if addr-line("address") != "" [ #addr-line("address") \ ]
    #if csz != "" [ #csz \ ]
    #if addr-line("country") != "" [ #addr-line("country") ]
  ],
)

// ===== Body =====
#set par(justify: true, leading: 0.65em, spacing: 0.9em)

#let greet-name = addr-line("name")
#if greet-name != "" [ Dear #greet-name, ] else [ Dear Hiring Manager, ]

#let intro = body.at("intro", default: "")
#if intro != "" {
  parbreak()
  intro
}

#for para in body.at("paragraphs", default: ()) {
  parbreak()
  para
}

#let closing = body.at("closing", default: "")
#if closing != "" {
  parbreak()
  closing
}

// ===== Signature =====
#let signoff = body.at("signoff", default: "Sincerely")
#v(1.2em)
#signoff, \
#strong[#author]
