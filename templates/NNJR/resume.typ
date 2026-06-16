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
#let render-custom(c) = {
  resume_heading(c.at("title", default: ""))
  let bl = c.at("bullets", default: ())
  if bl.len() > 0 {
    pad(left: 1em, right: 0.5em, list(..bl))
  }
}
#let customs-after(key) = {
  for c in all-customs {
    if c.at("after", default: "end") == key {
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
#customs-after("top")

#if "education" in ctx {
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
#customs-after("education")

#if "experience" in ctx {
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
#customs-after("experience")

#if "projects" in ctx {
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
#customs-after("projects")

#if "extracurriculars" in ctx {
  resume_heading("Extracurricular Activities")
  for ex in ctx.extracurriculars.data {
    extra_item(
      activity: ex.at("activity", default: ""),
      date: ex.at("period", default: ""),
      bullets: ex.at("bullets", default: ()),
    )
  }
}
#customs-after("extracurriculars")

#if "certifications" in ctx {
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
#customs-after("certifications")

#if "skills" in ctx {
  resume_heading("Technical Skills")
  for cat in ctx.skills.data {
    skill_item(
      category: cat.at("category", default: ""),
      skills: cat.at("items", default: ()).join(", "),
    )
  }
}
#customs-after("skills")

// Custom sections with no placement (or `after: end`) render last.
#customs-after("end")
