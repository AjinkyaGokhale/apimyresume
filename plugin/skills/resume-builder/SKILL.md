---
name: resume-builder
description: Create or update the user's base resume (their master profile) with the APIMyResume tools. Use when the user wants to set up their resume for the first time, import an existing resume or LinkedIn profile, add a new job, skill or project, or fix their base resume.
---

# Build and maintain the base resume

The base resume is the single source of truth every tailored resume is derived from. Accuracy matters more than polish here.

## Steps

1. Call `get_guide` once per session, then `list_bases`.
   - If a base exists and the user wants changes, `get_base`, edit the document, and go to step 5.
2. **Gather real facts.** Prefer a source the user gives you: a resume file (PDF, DOCX or text you can read), LinkedIn export or pasted text. Otherwise interview briefly, one topic at a time:
   - name, headline title, email, phone, location, links;
   - each job: company, role, period, 3-6 achievement bullets with numbers where the user has them;
   - education, skills (grouped by category), projects, certifications, languages.
   Ask for missing numbers instead of guessing them. Never invent employers, dates, degrees or metrics.
3. **Pick a template.** `list_templates`, recommend one (`basic-resume` is the safe default), and let the user choose.
4. **Draft and preview.**
   - Build the document: `id` like `base-<firstname>`, `template`, `profile`, `experience`, `education`, `skills`, plus optional sections.
   - Each experience entry gets a stable, readable `id` (`acme-2022`).
   - Bullets start with a strong verb and show the outcome.
   - Call `preview_base` and give the user the `pdf_path`. Fix anything the user or the render warnings flag.
5. **Save.** `create_base` for a new base. For edits, `update_base` with the **complete** document, since omitted sections are deleted. Keep existing experience ids unchanged.
6. Tell the user what changed and that existing tailored resumes are not re-rendered automatically. Offer to update them with `update_resume`.

## Tips
- One base per career direction is enough; most people need one.
- Put the newest experience first.
- A summary of 2-3 lines in `profile.summary` helps tailoring later.
