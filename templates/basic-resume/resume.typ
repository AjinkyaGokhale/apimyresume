// Basic Resume Template
// Adapted from https://github.com/stuxf/basic-typst-resume-template
// This template expects data from sys.inputs.resume in JSON format

#let ctx = json(bytes(sys.inputs.resume))
#let profile = ctx.header.data

// Extract profile data with defaults
#let name = profile.at("name", default: "")
#let location = profile.at("location", default: "")
#let email = profile.at("email", default: "")
#let phone = profile.at("phone", default: "")
#let links = profile.at("links", default: ())
#let github = links.at("github", default: "")
#let linkedin = links.at("linkedin", default: "")
#let personal-site = links.at("portfolio", default: "")

// Accent color - can be customized
#let accent-color = "#26428b"

// ===== Template Functions =====

// Date helper function
#let dates-helper(start-date: "", end-date: "") = {
  if start-date == "" {
    end-date
  } else {
    start-date + " --- " + end-date
  }
}

// Generic two by two component for resume
#let generic-two-by-two(
  top-left: "",
  top-right: "",
  bottom-left: "",
  bottom-right: "",
) = {
  [
    #top-left #h(1fr) #top-right \
    #bottom-left #h(1fr) #bottom-right
  ]
}

// Generic one by two component for resume
#let generic-one-by-two(
  left: "",
  right: "",
) = {
  [
    #left #h(1fr) #right
  ]
}

// Education component
#let edu(
  institution: "",
  dates: "",
  degree: "",
  gpa: "",
  location: "",
  consistent: false,
) = {
  if consistent {
    // edu-constant style (dates top-right, location bottom-right)
    generic-two-by-two(
      top-left: strong(institution),
      top-right: dates,
      bottom-left: emph(degree),
      bottom-right: emph(location),
    )
  } else {
    // original edu style (location top-right, dates bottom-right)
    generic-two-by-two(
      top-left: strong(institution),
      top-right: location,
      bottom-left: emph(degree),
      bottom-right: emph(dates),
    )
  }
}

// Work experience component
#let work(
  title: "",
  dates: "",
  company: "",
  location: "",
) = {
  generic-two-by-two(
    top-left: strong(title),
    top-right: dates,
    bottom-left: company,
    bottom-right: emph(location),
  )
}

// Project component
#let project(
  role: "",
  name: "",
  url: "",
  dates: "",
) = {
  generic-one-by-two(
    left: {
      if role == "" {
        [*#name* #if url != "" and dates != "" [ (#link("https://" + url)[#url])]]
      } else {
        [*#role*, #name #if url != "" and dates != "" [ (#link("https://" + url)[#url])]]
      }
    },
    right: {
      if dates == "" and url != "" {
        link("https://" + url)[#url]
      } else {
        dates
      }
    },
  )
}

// Certificates component
#let certificates(
  name: "",
  issuer: "",
  url: "",
  date: "",
) = {
  [
    *#name*, #issuer
    #if url != "" {
      [ (#link("https://" + url)[#url])]
    }
    #h(1fr) #date
  ]
}

// Extracurriculars component
#let extracurriculars(
  activity: "",
  dates: "",
) = {
  generic-one-by-two(
    left: strong(activity),
    right: dates,
  )
}

// ===== Document Setup =====

#set document(author: name, title: name)

// Document-wide formatting, including font and margins
#set text(
  // LaTeX style font
  font: "New Computer Modern",
  size: 10pt,
  // Disable ligatures so ATS systems do not get confused when parsing fonts.
  ligatures: false
)

// Recommended to have 0.5in margin on all sides
#set page(
  margin: (0.5in),
  paper: "us-letter",
)

// Link styles
#show link: underline

// Small caps for section titles
#show heading.where(level: 1): it => [
  #pad(top: 0pt, bottom: -10pt, [#smallcaps(it.body)])
  #line(length: 100%, stroke: 1pt)
]

// Accent Color Styling
#show heading: set text(
  fill: rgb(accent-color),
)

#show link: set text(
  fill: rgb(accent-color),
)

// ===== Header Section =====

// Personal Info Helper
#let contact-item(value, prefix: "", link-type: "") = {
  if value != "" {
    if link-type != "" {
      link(link-type + value)[#(prefix + value)]
    } else {
      value
    }
  }
}

// Name will be aligned left, bold and big
#let author-font-size = 20pt
#text(weight: 700, size: author-font-size)[#name]

// Personal Info
#let items = (
  contact-item(location),
  contact-item(phone, link-type: "tel:"),
  contact-item(email, link-type: "mailto:"),
  contact-item(github, link-type: "https://"),
  contact-item(linkedin, link-type: "https://"),
  contact-item(personal-site, link-type: "https://"),
).filter(x => x != none)

#v(-4pt)
#items.join(" | ")

// Main body.
#set par(justify: true)

// ===== Sections =====

// Education Section
#if "education" in ctx [
  = Education
  #for ed in ctx.education.data [
    #edu(
      institution: ed.institution,
      location: ed.at("location", default: ""),
      dates: dates-helper(start-date: "", end-date: ed.period),
      degree: ed.degree,
    )
    #if "bullets" in ed [
      #for b in ed.bullets [
        - #b
      ]
    ]
    #v(3pt)
  ]
]

// Work Experience Section
#if "experience" in ctx [
  = Work Experience
  #for job in ctx.experience.data [
    #work(
      title: job.role,
      location: job.at("location", default: ""),
      company: job.company,
      dates: dates-helper(start-date: "", end-date: job.period),
    )
    #for b in job.at("bullets", default: ()) [
      - #b
    ]
    #v(3pt)
  ]
]

// Projects Section
#if "projects" in ctx [
  = Projects
  #for p in ctx.projects.data [
    #project(
      role: p.at("role", default: ""),
      name: p.name,
      url: p.at("url", default: ""),
      dates: dates-helper(start-date: "", end-date: p.at("period", default: "")),
    )
    #if "description" in p [
      #p.description
    ]
    #if "bullets" in p [
      #for b in p.bullets [
        - #b
      ]
    ]
    #v(3pt)
  ]
]

// Extracurricular Activities Section
#if "extracurriculars" in ctx [
  = Extracurricular Activities
  #for ex in ctx.extracurriculars.data [
    #extracurriculars(
      activity: ex.activity,
      dates: dates-helper(start-date: "", end-date: ex.at("period", default: "")),
    )
    #if "bullets" in ex [
      #for b in ex.bullets [
        - #b
      ]
    ]
    #v(3pt)
  ]
]

// Certifications Section
#if "certifications" in ctx [
  = Certifications
  #for cert in ctx.certifications.data [
    #certificates(
      name: cert.name,
      issuer: cert.at("issuer", default: ""),
      url: cert.at("url", default: ""),
      date: cert.at("date", default: ""),
    )
    #v(3pt)
  ]
]

// Skills Section
#if "skills" in ctx [
  = Skills
  #for cat in ctx.skills.data [
    - *#cat.category*: #cat.items.join(", ")
  ]
]
