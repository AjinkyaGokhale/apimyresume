// Simple Technical Resume
// Adapted from https://github.com/steadyfall/simple-technical-resume-template
// (MIT, Himank Dave) for the APIMyResume render pipeline.
//
// This template expects data from sys.inputs.resume in JSON format. Unlike the
// upstream package it does NOT use the `datify`/`datetime` machinery: APIMyResume
// passes pre-formatted date strings (Typst cannot parse dates from sys.inputs),
// so `period` is rendered verbatim.

#let ctx = json(bytes(sys.inputs.resume))
#let profile = ctx.header.data

// ===== Profile =====
#let name = profile.at("name", default: "")
#let location = profile.at("location", default: "")
#let email = profile.at("email", default: "")
#let phone = profile.at("phone", default: "")
#let links = profile.at("links", default: (:))
#let github = links.at("github", default: "")
#let linkedin = links.at("linkedin", default: "")
#let website = links.at("portfolio", default: "")

// ===== Document setup =====
#set document(author: name, title: "Résumé | " + name)

#set text(
  font: "New Computer Modern",
  size: 10.5pt,
  // Disable ligatures so ATS parsers do not get confused.
  ligatures: false,
)

#set page(
  paper: "us-letter",
  margin: (top: 0.45in, bottom: 0.3in, left: 0.4in, right: 0.4in),
)

#show link: underline

// Small-caps, ruled section titles (the upstream's signature look).
#show heading.where(level: 1): it => block(width: 100%, breakable: false)[
  #set text(size: 12.5pt, weight: "regular")
  #smallcaps(it.body)
  #v(-0.85em)
  #line(length: 100%, stroke: 0.4pt)
  #v(-0.25em)
]

// ===== Components =====

// Two rows × two columns: left column left-aligned, right column right-aligned.
#let two-by-two(cols, r1c1, r1c2, r2c1, r2c2) = {
  grid(
    columns: cols,
    align(left)[#r1c1 \ #r2c1],
    align(right)[#r1c2 \ #r2c2],
  )
}

#let work-entry(title, company, location, period) = {
  two-by-two((1fr, auto), strong(title), strong(period), company, emph(location))
  v(-0.3em)
}

#let edu-entry(institution, location, degree, period) = {
  two-by-two((1fr, auto), strong(institution), strong(location), emph(degree), period)
  v(-0.3em)
}

#let project-entry(name, url, role, period) = {
  let nm = if url != "" { link("https://" + url)[#strong(name)] } else { strong(name) }
  let heading = if role != "" { [#nm #h(0.5em) #emph(role)] } else { nm }
  grid(columns: (1fr, auto), align(left)[#heading], align(right)[#period])
  v(-0.3em)
}

// ===== Header =====
#align(center)[
  #upper(text(size: 23pt, weight: "extrabold")[#name])
]
#v(-0.4em)

#let contact-item(value, link-type: "") = {
  if value != "" {
    if link-type != "" {
      link(link-type + value)[#value]
    } else {
      value
    }
  }
}

#align(center, text(size: 9.5pt)[
  #(
    (
      contact-item(phone),
      contact-item(location),
      contact-item(email, link-type: "mailto:"),
      contact-item(website, link-type: "https://"),
      contact-item(linkedin, link-type: "https://"),
      contact-item(github, link-type: "https://"),
    )
      .filter(x => x != none)
      .join("  |  ")
  )
])

#v(0.3em)
#set par(justify: true)
#set list(indent: 0.6em, spacing: 0.65em)

// ===== Sections =====

// Custom (free-form) sections: any title with bullets under it. Each carries an
// optional `after` key naming the built-in section it should follow; "top"
// renders before everything and a missing/"end" key renders at the bottom.
#let all-customs = if "custom" in ctx { ctx.custom.data } else { () }
// One detail block: bold title + inline subtitle, right-aligned period,
// clickable link, bullets.
#let render-custom-detail(title, sub, period, url, bls) = [
  #if title != "" or sub != "" or period != "" [
    #if title != "" [*#title*#if sub != "" [ — #emph(sub)]] else if sub != "" [#emph(sub)]#if period != "" [#h(1fr) #period]#linebreak()
  ]
  #if url != "" [
    // Render the complete URL verbatim and make it clickable.
    #link(if url.starts-with("http") { url } else { "https://" + url })[#url] #linebreak()
  ]
  #for b in bls [
    - #b
  ]
]
#let render-custom(c) = [
  = #c.at("title", default: "")
  #let entries = c.at("entries", default: ())
  #if entries.len() > 0 [
    // Multi-entry section: each entry gets its own title/subtitle/period/link/bullets.
    #for e in entries [
      #render-custom-detail(e.at("title", default: ""), e.at("subtitle", default: ""), e.at("period", default: ""), e.at("link", default: ""), e.at("bullets", default: ()))
      #v(1pt)
    ]
  ] else [
    // Legacy single-entry section: detail lives at the section level.
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

// Per-section renderers. The dispatch loop below decides order from
// ctx.__layout.order, so the section sequence is fully data-driven.
#let render-education() = [
  = #ctx.education.label
  #for ed in ctx.education.data [
    #edu-entry(
      ed.at("institution", default: ""),
      ed.at("location", default: ""),
      {
        let d = ed.at("degree", default: "")
        let f = ed.at("field", default: "")
        if f != "" { d + ", " + f } else { d }
      },
      ed.at("period", default: ""),
    )
    #if ed.at("gpa", default: "") != "" [
      - GPA: #ed.gpa
    ]
    #if ed.at("honors", default: "") != "" [
      - #ed.honors
    ]
    #if ed.at("thesis", default: "") != "" [
      - Thesis: #ed.thesis
    ]
    #for b in ed.at("bullets", default: ()) [
      - #b
    ]
    #v(3pt)
  ]
]

#let render-experience() = [
  = #ctx.experience.label
  #for job in ctx.experience.data [
    #work-entry(
      job.at("role", default: ""),
      job.at("company", default: ""),
      job.at("location", default: ""),
      job.at("period", default: ""),
    )
    #for b in job.at("bullets", default: ()) [
      - #b
    ]
    #v(3pt)
  ]
]

#let render-projects() = [
  = #ctx.projects.label
  #for p in ctx.projects.data [
    #project-entry(
      p.at("name", default: ""),
      p.at("url", default: ""),
      p.at("role", default: ""),
      p.at("period", default: ""),
    )
    #if p.at("description", default: "") != "" [
      #p.description
    ]
    #for b in p.at("bullets", default: ()) [
      - #b
    ]
    #v(3pt)
  ]
]

#let render-skills() = [
  = #ctx.skills.label
  #for cat in ctx.skills.data [
    *#cat.at("category", default: "")*: #cat.at("items", default: ()).join(", ") \
  ]
]

#let render-certifications() = [
  = #ctx.certifications.label
  #for c in ctx.certifications.data [
    #grid(
      columns: (1fr, auto),
      align(left)[*#c.at("name", default: "")*#if c.at("issuer", default: "") != "" [, #c.issuer]],
      align(right)[#c.at("year", default: "")],
    )
    #v(2pt)
  ]
]

#let render-awards() = [
  = #ctx.awards.label
  #for a in ctx.awards.data [
    #grid(
      columns: (1fr, auto),
      align(left)[*#a.at("name", default: "")*#if a.at("issuer", default: "") != "" [, #a.issuer]],
      align(right)[#a.at("year", default: "")],
    )
    #if a.at("description", default: "") != "" [
      #a.description
    ]
    #v(2pt)
  ]
]

#let render-extracurriculars() = [
  = #ctx.extracurriculars.label
  #for ex in ctx.extracurriculars.data [
    #grid(
      columns: (1fr, auto),
      align(left)[*#ex.at("activity", default: "")*],
      align(right)[#ex.at("period", default: "")],
    )
    #for b in ex.at("bullets", default: ()) [
      - #b
    ]
    #v(3pt)
  ]
]

#let renderers = (
  education: render-education,
  experience: render-experience,
  projects: render-projects,
  skills: render-skills,
  certifications: render-certifications,
  awards: render-awards,
  extracurriculars: render-extracurriculars,
)

// Render order is data-driven: header is pinned (rendered above), then each
// section in ctx.__layout.order. The "custom" slot renders unanchored custom
// sections; every section is followed by any custom sections explicitly anchored
// after it. A section renders only if present in ctx (i.e. passed its show_if).
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
