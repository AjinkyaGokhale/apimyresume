// Clickworthy Cover Letter Template
// Adapted from the upstream `clickworthy-resume` package (MIT, see LICENSE) — the
// cover-letter layout is inlined here and driven by a cover-letter context from
// sys.inputs.resume (the generic document-context input). The author
// identity comes from the resume profile; the addressee + body come from the
// per-resume cover letter. Body text is injected as data and rendered literally
// (never evaluated as Typst markup).

#let ctx = json(bytes(sys.inputs.resume))

#let author = ctx.at("author", default: "")
#let location = ctx.at("location", default: "")
#let date = ctx.at("date", default: "")
#let contacts = ctx.at("contacts", default: ())
#let addressee = ctx.at("addressee", default: (:))
#let body = ctx.at("body", default: (:))

// ===== Document setup (from src/cover-letter.typ `cover-letter`) =====

#set document(author: author, title: author)

#set text(
  font: "New Computer Modern",
  size: 11pt,
  lang: "en",
  ligatures: false,
)

#set page(
  paper: "us-letter",
  margin: (top: 1cm, bottom: 1cm, left: 1cm, right: 1cm),
)

#show link: set text(fill: rgb("#0645AD"))

// ===== Author header =====

#align(center)[
  #block(text(weight: 700, 2.5em, [#smallcaps(author)]))
]

// Contacts: each entry is `(value, href)`; link when an href is present.
#let fmt-contact(c) = {
  let value = c.at("value", default: "")
  let href = c.at("href", default: "")
  if value == "" { return none }
  if href != "" { link(href)[#value] } else { value }
}
#let contact-line = contacts.map(fmt-contact).filter(x => x != none)
#align(center)[#contact-line.join("  |  ")]

#if location != "" {
  align(center)[#smallcaps[#location]]
}

// ===== Date =====
#if date != "" {
  pad(top: 1em, bottom: 0.5em, align(left)[#strong[#date]])
}

// ===== Addressee block =====
#let addr-line(key) = addressee.at(key, default: "")
#let csz = {
  // "City, State Zip" with graceful handling of missing parts.
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
#set par(justify: true)

// Salutation built from the addressee name (falls back to a generic greeting).
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
#v(1em)
#signoff, \
#strong[#author]
