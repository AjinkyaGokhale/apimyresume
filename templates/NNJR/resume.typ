// NNJR (Not Jake's Resume) — integrated for the resume API.
//
// The upstream template is split across template.typ / yml.typ and reads a YAML
// file directly. The render pipeline only mounts THIS file and injects merged KB
// data as JSON via sys.inputs.resume, so everything is inlined here and reads
// from `ctx.<section>.data` (the section ids declared in map.json).

#let ctx = json(bytes(sys.inputs.resume))
#let profile = ctx.header.data

// ----- Profile fields (with defaults for missing values) -----
#let name = profile.at("name", default: "")
#let title = profile.at("title", default: "")
#let location = profile.at("location", default: "")
#let email = profile.at("email", default: "")
#let phone = profile.at("phone", default: "")
#let links = profile.at("links", default: (:))
#let github = links.at("github", default: "")
#let linkedin = links.at("linkedin", default: "")
#let site = links.at("portfolio", default: "")

// ===== Document styling (adapted from NNJR template.typ) =====
#set page(paper: "us-letter", margin: (x: 0.5in, y: 0.5in))
#set text(size: 11pt, font: "New Computer Modern", ligatures: false)
#set list(indent: 1em)
#show list: set text(size: 0.92em)
#show link: underline
#show link: set underline(offset: 3pt)
#set document(author: name, title: name)

#let name_header(n) = {
  set text(size: 2.25em)
  [*#n*]
}

#let resume_heading(txt) = {
  show heading: set text(size: 0.92em, weight: "regular")
  block[
    = #smallcaps(txt)
    #v(-4pt)
    #line(length: 100%, stroke: 1pt + black)
  ]
}

// A contact entry; returns `none` when the underlying value is empty so the
// header line only joins the items that actually exist.
#let contact-item(value, prefix: "", link-type: "") = {
  if value != "" {
    if link-type != "" {
      link(link-type + value)[#(prefix + value)]
    } else {
      value
    }
  } else {
    none
  }
}

// ===== Entry components =====
#let edu_item(name: "", degree: "", location: "", date: "", bullets: ()) = {
  set block(above: 0.7em, below: 1em)
  pad(left: 1em, right: 0.5em, box[
    #grid(
      columns: (3fr, 1fr),
      align(left)[*#name* \ _#degree _],
      align(right)[#location \ _#date _],
    )
    #if bullets.len() > 0 [#list(..bullets)]
  ])
}

#let exp_item(role: "", name: "", location: "", date: "", bullets: ()) = {
  set block(above: 0.7em, below: 1em)
  pad(left: 1em, right: 0.5em, box[
    #grid(
      columns: (3fr, 1fr),
      align(left)[*#role* \ _#name _],
      align(right)[#date \ _#location _],
    )
    #if bullets.len() > 0 [#list(..bullets)]
  ])
}

#let project_item(name: "", skills: "", date: "", desc: "", bullets: ()) = {
  set block(above: 0.7em, below: 1em)
  pad(left: 1em, right: 0.5em, box[
    *#name*#if skills != "" [ | _#skills _] #h(1fr) #date
    #if desc != "" [ \ #desc]
    #if bullets.len() > 0 [#list(..bullets)]
  ])
}

#let extra_item(activity: "", date: "", bullets: ()) = {
  set block(above: 0.7em, below: 1em)
  pad(left: 1em, right: 0.5em, box[
    #grid(columns: (3fr, 1fr), align(left)[*#activity*], align(right)[_#date _])
    #if bullets.len() > 0 [#list(..bullets)]
  ])
}

#let cert_item(name: "", issuer: "", url: "", date: "") = {
  set block(above: 0.5em)
  pad(left: 1em, right: 0.5em, block[
    *#name*#if issuer != "" [, #issuer]#if url != "" [ (#link("https://" + url)[#url])] #h(1fr) #date
  ])
}

#let skill_item(category: "", skills: "") = {
  set block(above: 0.7em)
  set text(size: 0.91em)
  pad(left: 1em, right: 0.5em, block[*#category*: #skills])
}

// ----- Custom (free-form) sections: any title + bullets, placed via `after` -----
#let all-customs = if "custom" in ctx { ctx.custom.data } else { () }
// One detail block: bold title + inline subtitle, right-aligned period,
// clickable link, bullets.
#let render-custom-detail(title, sub, period, url, bls) = {
  if title != "" or sub != "" or period != "" {
    let head = if title != "" [*#title*#if sub != "" [ — #emph(sub)]] else if sub != "" [#emph(sub)]
    if period != "" {
      [#head #h(1fr) #period\ ]
    } else {
      [#head\ ]
    }
  }
  if url != "" {
    [#link(if url.starts-with("http") { url } else { "https://" + url })[#url]\ ]
  }
  if bls.len() > 0 {
    pad(left: 1em, right: 0.5em, list(..bls))
  }
}
#let render-custom(c) = {
  resume_heading(c.at("title", default: ""))
  let entries = c.at("entries", default: ())
  if entries.len() > 0 {
    // Multi-entry section: each entry gets its own title/subtitle/period/link/bullets.
    for e in entries {
      render-custom-detail(e.at("title", default: ""), e.at("subtitle", default: ""), e.at("period", default: ""), e.at("link", default: ""), e.at("bullets", default: ()))
      v(1pt)
    }
  } else {
    // Legacy single-entry section: detail lives at the section level.
    render-custom-detail("", c.at("subtitle", default: ""), "", c.at("link", default: ""), c.at("bullets", default: ()))
  }
}
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

// ===== Header =====
#align(center, block[
  #name_header(name) \
  #if title != "" [#title \ ]
  #{
    let items = (
      contact-item(location),
      contact-item(phone, link-type: "tel:"),
      contact-item(email, link-type: "mailto:"),
      contact-item(linkedin, link-type: "https://"),
      contact-item(github, link-type: "https://"),
      contact-item(site, link-type: "https://"),
    ).filter(x => x != none)
    items.join(" | ")
  }
])
#v(5pt)

// ===== Sections =====

// Per-section renderers. Each reproduces exactly what that section rendered
// before; the dispatch loop below decides order from ctx.__layout.order.
#let render-education() = {
  resume_heading("Education")
  for ed in ctx.education.data {
    edu_item(
      name: ed.at("institution", default: ""),
      degree: ed.at("degree", default: ""),
      location: ed.at("location", default: ""),
      date: ed.at("period", default: ""),
      bullets: ed.at("bullets", default: ()),
    )
  }
}

#let render-experience() = {
  resume_heading("Experience")
  for job in ctx.experience.data {
    exp_item(
      role: job.at("role", default: ""),
      name: job.at("company", default: ""),
      location: job.at("location", default: ""),
      date: job.at("period", default: ""),
      bullets: job.at("bullets", default: ()),
    )
  }
}

#let render-projects() = {
  resume_heading("Projects")
  for p in ctx.projects.data {
    project_item(
      name: p.at("name", default: ""),
      skills: p.at("tags", default: ()).join(", "),
      date: p.at("period", default: ""),
      desc: p.at("description", default: ""),
      bullets: p.at("bullets", default: ()),
    )
  }
}

#let render-extracurriculars() = {
  resume_heading("Extracurricular Activities")
  for ex in ctx.extracurriculars.data {
    extra_item(
      activity: ex.at("activity", default: ""),
      date: ex.at("period", default: ""),
      bullets: ex.at("bullets", default: ()),
    )
  }
}

#let render-certifications() = {
  resume_heading("Certifications")
  for cert in ctx.certifications.data {
    cert_item(
      name: cert.at("name", default: ""),
      issuer: cert.at("issuer", default: ""),
      url: cert.at("url", default: ""),
      date: str(cert.at("year", default: "")),
    )
  }
}

#let render-skills() = {
  resume_heading("Technical Skills")
  for cat in ctx.skills.data {
    skill_item(
      category: cat.at("category", default: ""),
      skills: cat.at("items", default: ()).join(", "),
    )
  }
}

#let renderers = (
  education: render-education,
  experience: render-experience,
  projects: render-projects,
  extracurriculars: render-extracurriculars,
  certifications: render-certifications,
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
