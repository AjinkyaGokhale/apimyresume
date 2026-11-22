---
name: tailor-resume
description: Tailor a resume (and optionally a cover letter) to a specific job posting with the APIMyResume tools, render the PDFs, and log the application in the job tracker. Use when the user shares a job description or link, or asks to apply to a job, write a cover letter, or adapt their resume for a role.
---

# Tailor a resume for one job

## Steps

1. **Get the posting.** Use the text or link the user gives. Extract the company, role, location, work mode, salary if stated, and the 5-10 requirements that matter most.
2. **Load the base.** `list_bases`, then `get_base`. If there is no base, switch to the `resume-builder` skill first.
3. **Check fit honestly.** Map each key requirement to evidence in the base. Tell the user about real gaps; don't hide them with invented claims. Estimate a `match_score` (0-100).
4. **Create the tailored resume** with `create_resume`:
   - `meta`: `{ company, role }`, and `tags` such as the role family.
   - `overrides` re-order, trim and re-word **existing** content toward the posting. Sections you send replace the base section entirely, so copy the base section, edit it and send it all.
   - Use `inject_bullets` (`target: "experience.<entry id>"`) to add a bullet the user confirms is true.
   - Use `skills_highlight` and `keywords` for posting keywords the user genuinely has.
   - Keep it to what fits the template; cut weaker bullets rather than cramming.
   Give the user the `pdf_path` and summarise what you changed.
5. **Cover letter (optional, ask).** Call `set_cover_letter` with:
   - `addressee`: the company, plus the contact if known;
   - `body`: 3-4 short paragraphs. Open with why this role, give two proof points from the resume, then close.
   - `lang` if the posting isn't in English.
   Then `render_cover_letter` and share the path.
6. **Track it.** Call `track_job` with company, role, `job_url`, location, `work_mode`, `source`, salary, `match_score`, `resume_id`, and status:
   - `saved` if the user hasn't applied yet;
   - `applied` once they have.
   Re-running with the same `job_url` updates the entry and never duplicates it.

## Rules
- Never add employers, titles, dates, degrees, certifications, metrics or skills the base doesn't support. If a keyword matters and the user has the experience, ask them, then update the base via `resume-builder` so it's true everywhere.
- Keep the template the base uses; children can't change it.
