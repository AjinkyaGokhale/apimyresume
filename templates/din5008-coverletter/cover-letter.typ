// Default Cover Letter (APIMyResume) — DIN 5008 layout.
// A4 letter following the DIN 5008 business-letter norm (Form B header zone):
// content starts 4.5cm from the top; margins left 2.5cm, right 2cm, bottom
// 2.5cm. Sender info sits right-aligned at the top, the recipient block below
// it on the left, then "Location, Date" (right), a bold subject line without a
// "Subject:" prefix, salutation, ragged-right body, signoff with signature
// room, and an enclosure list.
// Used as the shared fallback for any resume template that does not ship its
// own cover-letter.typ. The author identity comes from the resume profile; the
// addressee + body come from the per-resume cover letter (merged base + child).
// Fixed strings are localized via ctx.lang ("en"/"de"). Body text is injected
// as data and rendered literally — never evaluated as Typst markup.

#let ctx = json(bytes(sys.inputs.resume))

#let author = ctx.at("author", default: "")
#let location = ctx.at("location", default: "")
#let phone = ctx.at("phone", default: "")
#let date = ctx.at("date", default: "")
#let lang = ctx.at("lang", default: "en")
#let contacts = ctx.at("contacts", default: ())
#let addressee = ctx.at("addressee", default: (:))
#let body = ctx.at("body", default: (:))

#let de = lang == "de"
#let ink = rgb("#1a1a1a")

#set document(author: author, title: author)

#set text(
  font: "New Computer Modern",
  size: 11pt,
  fill: ink,
  lang: lang,
  ligatures: false,
)

// DIN 5008: A4, content begins 4.5cm from the top edge (Form B), left 2.5cm,
// right 2cm, bottom 2.5cm.
#set page(
  paper: "a4",
  margin: (top: 4.5cm, bottom: 2.5cm, left: 2.5cm, right: 2cm),
)

// DIN 5008 recommends flush-left, ragged-right body text.
#set par(justify: false, leading: 0.65em, spacing: 1.1em)

// ===== Sender block (right-aligned: name, location, phone, email + links) =====
#let fmt-contact(c) = {
  let value = c.at("value", default: "")
  let href = c.at("href", default: "")
  if value == "" { return none }
  if href != "" { link(href)[#value] } else { value }
}
#let sender-lines = (
  if author != "" { author },
  if location != "" { location },
  if phone != "" { phone },
  ..contacts.map(fmt-contact),
).filter(x => x != none)
#if sender-lines.len() > 0 {
  align(right)[#sender-lines.join(linebreak())]
}

#v(1.5em)

// ===== Recipient block (DIN address order: company, person, street, zip city) =====
#let addr-line(key) = addressee.at(key, default: "")
#let zip-city = {
  // DIN 5008 postal order: postal code before the city ("10115 Berlin").
  let city-state = (addr-line("city"), addr-line("state")).filter(x => x != "").join(", ")
  (addr-line("zip"), city-state).filter(x => x != "").join(" ")
}
#let recipient-lines = (
  if addr-line("institution") != "" { addr-line("institution") },
  if addr-line("name") != "" { addr-line("name") },
  if addr-line("address") != "" { addr-line("address") },
  if zip-city != "" { zip-city },
  if addr-line("country") != "" { addr-line("country") },
).filter(x => x != none)
#if recipient-lines.len() > 0 {
  recipient-lines.join(linebreak())
}

#v(1.5em)

// ===== Location, Date (right-aligned; DIN "Ort, Datum") =====
#if date != "" {
  align(right)[#((location, date).filter(x => x != "").join(", "))]
}

#v(2em)

// ===== Subject (bold, no "Subject:" prefix per DIN 5008) =====
#let subject = body.at("subject", default: "")
#if subject != "" {
  strong[#subject]
  v(1em)
}

// ===== Salutation =====
// German has no gender-neutral "Sehr geehrte/r + name" form, so a named
// recipient gets the accepted neutral "Guten Tag" instead.
#let greet-name = addr-line("name")
#if greet-name != "" {
  if de [ Guten Tag #greet-name, ] else [ Dear #greet-name, ]
} else {
  if de [ Sehr geehrte Damen und Herren, ] else [ Dear Hiring Manager, ]
}

// ===== Body =====
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

// ===== Signoff + signature room =====
// DIN 5008: no comma after the German Grußformel; English keeps its comma.
#let signoff = body.at("signoff", default: if de { "Mit freundlichen Grüßen" } else { "Sincerely" })
#v(1em)
#if de [ #signoff ] else [ #signoff, ]
#v(1.2cm)
#author

// ===== Enclosures (DIN "Anlagen") =====
#let enclosures = body.at("enclosures", default: ())
#if enclosures.len() > 0 {
  v(1.5em)
  strong[#if de [Anlagen] else [#if enclosures.len() == 1 [Enclosure] else [Enclosures]]]
  linebreak()
  enclosures.join(linebreak())
}
