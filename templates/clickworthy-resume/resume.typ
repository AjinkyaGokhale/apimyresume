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

// Contact line.
#let contact-item(value, prefix: "") = {
  if value != "" {
    if prefix != "" {
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
    - #b
  ]
}

// ===== Custom (free-form) sections =====
#let all-customs = if "custom" in ctx { ctx.custom.data } else { () }
#let render-custom(c) = [
  = #c.at("title", default: "")
  #bullets(c.at("bullets", default: ()))
  #v(3pt)
]
#let customs-after(key) = {
  for c in all-customs {
    if c.at("after", default: "end") == key {
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
    #v(3pt)
  ]
]

#let render-experience() = [
  = Experience
  #for job in ctx.experience.data [
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

#let render-projects() = [
  = Projects
  #for p in ctx.projects.data [
    #let url = p.at("url", default: "")
    #entry(
      title: {
        let n = p.at("name", default: "")
        if url != "" { link("https://" + url)[#n] } else { n }
      },
      subtitle: p.at("role", default: ""),
      date: p.at("period", default: ""),
    )
    #if p.at("description", default: "") != "" [ #p.description \ ]
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
    #if a.at("description", default: "") != "" [ #a.description \ ]
    #v(3pt)
  ]
]

#let render-certifications() = [
  = Certifications
  #for cert in ctx.certifications.data [
    #let url = cert.at("url", default: "")
    #entry(
      title: cert.at("name", default: ""),
      subtitle: cert.at("issuer", default: ""),
      date: str(cert.at("year", default: "")),
    )
    #if url != "" [ #link("https://" + url)[#url] \ ]
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
// each section in ctx.__layout.order, each followed by any custom sections
// anchored after it. A section renders only if present in ctx (show_if).
#customs-after("top")
#for sid in ctx.__layout.order {
  if sid != "header" {
    if (sid in ctx) and (sid in renderers) {
      (renderers.at(sid))()
    }
    customs-after(sid)
  }
}
#customs-after("end")
