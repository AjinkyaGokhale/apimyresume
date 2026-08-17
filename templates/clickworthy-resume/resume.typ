// Clickworthy Resume Template
// Adapted from the upstream Typst package `clickworthy-resume` (MIT, see LICENSE)
// — the resume layout is inlined here and driven by data from sys.inputs.resume
// (JSON), matching this project's template contract.

#let ctx = json(bytes(sys.inputs.resume))
#let profile = ctx.header.data

// ----- Profile / header data (with defaults) -----
#let name = profile.at("name", default: "")
#let location = profile.at("location", default: "")
#let summary = profile.at("summary", default: "")
#let email = profile.at("email", default: "")
#let phone = profile.at("phone", default: "")
#let links = profile.at("links", default: (:))
#let github = links.at("github", default: "")
#let linkedin = links.at("linkedin", default: "")
#let portfolio = links.at("portfolio", default: "")

// Accent color (clickworthy default).
#let theme-color = rgb("#26428b")

// ===== Document setup (from src/resume-cv.typ `resume`) =====

#set document(author: name, title: name)

#set text(
  font: "New Computer Modern",
  size: 11pt,
  lang: "en",
  ligatures: false, // better ATS compatibility
)

#set page(
  paper: "us-letter",
  margin: (top: 1cm, bottom: 1cm, left: 1cm, right: 1cm),
)

#show link: set text(fill: rgb("#0645AD"))

// Accent-coloured, small-caps section headings with an underline rule.
#show heading: set text(fill: theme-color)
#show heading: it => [
  #pad(top: -0.3em, bottom: -0.8em, [#smallcaps(it.body)])
  #line(length: 100%, stroke: 1pt)
]

// ===== Header =====

// Author name, centered, large, small-caps.
#align(center)[
  #block(text(weight: 700, 2.5em, [#smallcaps(name)]))
]

// Normalise a URL for linking. Both forms are accepted everywhere a link is
// rendered — a bare host ("resume.agok.dev/resume/abc") or a complete URL
// ("https://resume.agok.dev/resume/abc") — so a scheme the author already typed
// is never prefixed twice.
#let href(url) = if url.starts-with("http") { url } else { "https://" + url }

// Strip the scheme for display so "https://x.dev/a" and "x.dev/a" read the same
// on the page; the link target itself always keeps the full URL.
#let display-url(url) = {
  if url.starts-with("https://") { url.slice(8) }
  else if url.starts-with("http://") { url.slice(7) }
  else { url }
}

// Contact line.
#let contact-item(value, prefix: "") = {
  if value != "" {
    if prefix == "https://" {
      // Web links go through href so a value typed with its scheme still works.
      link(href(value))[#display-url(value)]
    } else if prefix != "" {
      link(prefix + value)[#value]
    } else {
      value
    }
  }
}
#let contacts = (
  contact-item(email, prefix: "mailto:"),
  contact-item(phone, prefix: "tel:"),
  contact-item(github, prefix: "https://"),
  contact-item(linkedin, prefix: "https://"),
  contact-item(portfolio, prefix: "https://"),
).filter(x => x != none)
#align(center)[#contacts.join("  |  ")]

// Location.
#if location != "" {
  align(center)[#smallcaps[#location]]
}

// Professional summary.
#if summary != "" {
  pad(top: 0.4em, align(center)[#summary])
}

#set par(justify: true)
#v(2pt)

// ===== Entry helpers (clickworthy grid style) =====

// Render a plain data string with lightweight **bold** support: text between
// paired ** markers is emphasised, everything else is emitted verbatim. Only
// bold is interpreted (no other markup is evaluated), so arbitrary user text
// stays safe and predictable.
#let md(s) = {
  let parts = s.split("**")
  for (i, part) in parts.enumerate() {
    if calc.rem(i, 2) == 1 { strong(part) } else { part }
  }
}

// Wrap `body` in a link to `url` when there is one; return it untouched otherwise.
#let linked(body, url) = {
  if url == "" { body } else { link(href(url))[#body] }
}

// Title on the left (bold + emph subtitle), date/location on the right.
#let entry(title: "", subtitle: "", date: "", location: "") = {
  pad(
    bottom: -0.3em,
    grid(
      columns: (auto, 1fr),
      align(left)[
        #strong[#title]
        #if subtitle != "" [ \ #emph[#subtitle] ]
      ],
      align(right)[
        #emph[#date]
        #if location != "" [ \ #emph[#location] ]
      ],
    ),
  )
}

#let bullets(items) = {
  for b in items [
    - #md(b)
  ]
}

// ===== Custom (free-form) sections =====
#let all-customs = if "custom" in ctx { ctx.custom.data } else { () }
// One detail block: bold title + inline subtitle, right-aligned period,
// clickable link, bullets.
#let render-custom-detail(title, sub, period, url, bls) = [
  #if title != "" or sub != "" or period != "" [
    #if title != "" [*#title*#if sub != "" [ — #emph(sub)]] else if sub != "" [#emph(sub)]#if period != "" [#h(1fr) #period]#linebreak()
  ]
  #if url != "" [
    #link(href(url))[#url] #linebreak()
  ]
  #bullets(bls)
]
#let render-custom(c) = [
  = #c.at("title", default: "")
  #let entries = c.at("entries", default: ())
  #if entries.len() > 0 [
    #for e in entries [
      #render-custom-detail(e.at("title", default: ""), e.at("subtitle", default: ""), e.at("period", default: ""), e.at("link", default: ""), e.at("bullets", default: ()))
      #v(1pt)
    ]
  ] else [
    #render-custom-detail("", c.at("subtitle", default: ""), "", c.at("link", default: ""), c.at("bullets", default: ()))
  ]
  #v(3pt)
]
// Custom sections with an explicit `after` anchor render right after that
// section ("top", a section id, or "end").
#let customs-after(key) = {
  for c in all-customs {
    if ("after" in c) and (c.after == key) {
      render-custom(c)
    }
  }
}
// Custom sections with no `after` key render at the "custom" slot, i.e. wherever
// the custom block sits in the (block-order-derived) layout order.
#let customs-unanchored() = {
  for c in all-customs {
    if "after" not in c {
      render-custom(c)
    }
  }
}

// Per-section renderers. Each reproduces exactly what that section rendered
// before; the dispatch loop below decides order from ctx.__layout.order.
#let render-education() = [
  = Education
  #for ed in ctx.education.data [
    #entry(
      title: ed.at("institution", default: ""),
      subtitle: {
        let degree = ed.at("degree", default: "")
        let field = ed.at("field", default: "")
        if field != "" { degree + " — " + field } else { degree }
      },
      date: ed.at("period", default: ""),
      location: ed.at("location", default: ""),
    )
    #if ed.at("gpa", default: "") != "" [ #emph[GPA: #ed.gpa] \ ]
    #if ed.at("honors", default: "") != "" [ #emph[#ed.honors] \ ]
    #bullets(ed.at("bullets", default: ()))
    #v(3pt)
  ]
]

#let render-experience() = [
  = Experience
  #for job in ctx.experience.data [
    #let roles = job.at("roles", default: ())
    #if roles.len() > 0 [
      // Progression at one company: the company anchors the block (location
      // opposite it) and each role hangs beneath with its own period and
      // bullets. The entry's own role/period/bullets are not rendered.
      #entry(
        title: job.at("company", default: ""),
        date: job.at("location", default: ""),
      )
      #for r in roles [
        #pad(left: 0.8em)[
          #entry(
            title: r.at("role", default: ""),
            date: r.at("period", default: ""),
          )
          #bullets(r.at("bullets", default: ()))
        ]
        #v(3pt)
      ]
    ] else [
      #entry(
        title: job.at("role", default: ""),
        subtitle: job.at("company", default: ""),
        date: job.at("period", default: ""),
        location: job.at("location", default: ""),
      )
      #bullets(job.at("bullets", default: ()))
      #v(3pt)
    ]
  ]
]

#let render-projects() = [
  = Projects
  #for p in ctx.projects.data [
    #let url = p.at("url", default: "")
    #entry(
      title: {
        let n = p.at("name", default: "")
        linked(n, url)
      },
      subtitle: p.at("role", default: ""),
      date: p.at("period", default: ""),
    )
    #if p.at("description", default: "") != "" [ #md(p.description) \ ]
    #bullets(p.at("bullets", default: ()))
    #v(3pt)
  ]
]

#let render-awards() = [
  = Awards
  #for a in ctx.awards.data [
    #entry(
      title: a.at("name", default: ""),
      subtitle: a.at("issuer", default: ""),
      date: str(a.at("year", default: "")),
    )
    #if a.at("description", default: "") != "" [ #md(a.description) \ ]
    #v(3pt)
  ]
]

#let render-certifications() = [
  = Certifications
  #for cert in ctx.certifications.data [
    // The name itself carries the credential link, so a long verification URL
    // never takes up space on the page.
    #entry(
      title: linked(cert.at("name", default: ""), cert.at("url", default: "")),
      subtitle: cert.at("issuer", default: ""),
      date: str(cert.at("year", default: "")),
    )
    #v(3pt)
  ]
]

#let render-extracurriculars() = [
  = Extracurricular Activities
  #for ex in ctx.extracurriculars.data [
    #entry(
      title: ex.at("activity", default: ""),
      date: ex.at("period", default: ""),
    )
    #bullets(ex.at("bullets", default: ()))
    #v(3pt)
  ]
]

#let render-skills() = [
  = Skills
  #for cat in ctx.skills.data {
    strong[#cat.at("category", default: ""): ]
    cat.at("items", default: ()).join(", ")
    linebreak()
  }
]

#let renderers = (
  education: render-education,
  experience: render-experience,
  projects: render-projects,
  awards: render-awards,
  certifications: render-certifications,
  extracurriculars: render-extracurriculars,
  skills: render-skills,
)

// Render order is data-driven: header is pinned (already rendered above), then
// each section in ctx.__layout.order. The "custom" slot renders unanchored
// custom sections; every section is followed by any custom sections explicitly
// anchored after it. A section renders only if present in ctx (show_if).
#customs-after("top")
#for sid in ctx.__layout.order {
  if sid != "header" {
    if sid == "custom" {
      customs-unanchored()
    } else if (sid in ctx) and (sid in renderers) {
      (renderers.at(sid))()
    }
    customs-after(sid)
  }
}
#customs-after("end")
