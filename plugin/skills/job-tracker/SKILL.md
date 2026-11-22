---
name: job-tracker
description: Track job applications and report on the job search with the APIMyResume tools. Use when the user mentions applying somewhere, hearing back, an interview, offer, rejection or no reply, asks what to follow up on, or wants their application stats, pipeline or progress.
---

# Track applications and report progress

## Logging updates

- **New application or saved job:** `track_job`. Include `job_url` whenever there is one, because it is the key that prevents duplicates. Set `source` (linkedin, indeed, referral, company_site…), `location`, `work_mode`, salary and `tags` when known.
- **Something happened:** find the job (`list_jobs` with `q` set to the company), then `update_job` with the new `status` and a short `status_note` ("Recruiter call booked for Tue", "Rejected after onsite").
  - Statuses: `saved` → `applied` → `screening` → `interviewing` → `offer` → `accepted`.
  - Closing statuses: `rejected`, `withdrawn` (the user stopped), `ghosted` (no reply for a long time).
- Never delete jobs. Use `withdrawn` instead, so the history and stats stay honest.
- Event times are recorded automatically. Put the real date in `applied_at` only when logging an application after the fact.

## Follow-ups

When asked what needs attention, `list_jobs` and look for:
- `applied` with no change for 7+ days: suggest a polite follow-up. Offer to draft it.
- `applied` or `screening` with no change for 30+ days: suggest marking `ghosted` (ask first).
- `interviewing`: prep for the next round, using the job's notes and the tailored resume (`get_resume`).

## Reporting

`job_stats` with optional filters (`from`/`to`, `location`, `source`, `status`) returns:
- total and counts by status;
- the funnel: applied → responded → interviewed → offered;
- response, interview and offer rates;
- average days to first response;
- applications in the last 7 and 30 days;
- a weekly timeline;
- top locations, sources, companies and work modes.

Summarise it briefly: what's working (best sources and locations by response), what isn't, and one or two concrete next steps. Show rates as percentages, and say when the sample is too small to judge.
