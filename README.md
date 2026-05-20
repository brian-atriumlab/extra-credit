<!-- ========================================================================= -->
<!-- IMPLEMENTATION NOTES — read this first (the original task prompt follows). -->
<!-- ========================================================================= -->

# ArmorHQ Sales Dashboard — what I built & why

**For the intern taking this over:** start in `src/lib/db.ts`. Every number on the
page and in the API is computed by a function there; the routes and the page are
thin callers. Pure date/metric math lives in `src/lib/metrics.ts`.

## What Dana sees at `/`
She asked two questions: *"are my agents getting better or worse?"* and *"who do
I talk to Monday?"* The page answers both, top to bottom:
1. **Calls connected · last 7 days** — the number she checks every Monday, live
   from the DB, front and center.
2. **Connect rate · last 7 days** — context for the raw count.
3. **Talk to on Monday** — the agents whose connect rate dropped most vs. the
   prior week (her actual question, answered directly).
4. **Agents · week over week** — the full roster, sorted worst-trending first,
   with a colored ▲/▼ delta so "better or worse" is readable at a glance.

## Decisions worth knowing
- **One data module, thin routes.** All SQL is in `db.ts`; routes call one
  function and serialize. Shared response shaping (no-store, JSON/CSV) is in
  `src/lib/http.ts`. Pure helpers are split into `metrics.ts` — both for clean
  separation and because the test bundler can't load `node:sqlite`.
- **"Last 7 days" = a rolling 168-hour window `[now − 7d, now)`**, connected
  outcomes only, capped at *now* — a call can't count toward "the last 7 days"
  if it hasn't happened yet. Last-7 vs prior-7 windows are half-open so a
  boundary call is never double-counted.
- **Daily series (28-day digest, 14-day scorecard) use UTC calendar-day
  buckets**, zero-filled to a fixed length so every day appears even with no
  calls — that's why the API always returns exactly 28 / 14 entries.
- **Dates compared as ISO strings, not via SQLite `date()`.** Stored timestamps
  are UTC ISO 8601 ("…Z"), where lexicographic order *is* chronological order —
  no timezone ambiguity, no per-row date parsing.
- **CSV escaping** follows RFC 4180: a field is quoted only if it contains a
  comma, quote, or newline (so `West Coast` stays unquoted; `Acme, Inc` doesn't).
- **All four API routes set `Cache-Control: no-store` and `dynamic = "force-dynamic"`** — the numbers are always live.
- **Mobile:** the hero/stat grid collapses to one column under `sm`, and the
  roster table scrolls horizontally, so 375px is usable.
- **Test:** `src/lib/db.test.ts` covers the metric/window math (rolling-window
  boundaries, divide-by-zero guard, fixed-length day series, CSV escaping) — the
  calculations QA needs to trust monthly without me.
- **Node 22.5+** required for the built-in `node:sqlite` (see `.nvmrc`).

---

# Your task

ArmorHQ has a customer named Dana. She's the head of sales at a 200-person inside sales team and she pays us a lot of money. The last time her account manager talked to her, she said:

> "I don't need another spreadsheet. I just want to know — week to week — whether my agents are getting better or worse, and who I should be talking to on Monday morning. Right now I'm guessing."

Build her that dashboard at `/`.

The data is already in your local database. Two tables, `agents` and `calls`. Around 3,000 calls across 12 agents over the last three weeks. Schema in `schema.sql`. Everything you query has to go through `src/lib/db.ts`.

What goes on the dashboard is up to you. We hire people who can decide.

## Two non-negotiables

1. **The number Dana checks every Monday.** She asks her operations lead "how many calls did we connect last week?" That number — calls whose `outcome` is `connected` and whose `started_at` falls within the rolling 7 days from right now — must appear clearly somewhere on the dashboard, and must come from a live query against the database. If it's wrong or hardcoded, the rest doesn't matter.

2. **Ship the reporting API.** Dana's account manager and the customer success team need machine-readable access to the same data the dashboard shows, in four shapes. All four endpoints are live-queried, return JSON unless noted, and follow the error format below.

   **`/api/weekly-digest`** — last 28 days of overall activity. Returns:
   - `data`: 28 entries, oldest first. Each: `date` (YYYY-MM-DD), `connected_count` (int), `total_count` (int), `by_team` (object mapping team name to connected calls that day).
   - `top_agents`: 3 entries — the three agents with the most connected calls in the last 7 days. Each: `name`, `team`, `connected_count`.
   - `meta`: `{ "generated_at": ISO 8601 string, "window_start": YYYY-MM-DD, "window_end": YYYY-MM-DD }`.

   **`/api/weekly-digest.csv`** — same daily data as a CSV file the customer success team drops into Google Sheets. Columns: `date`, `connected_count`, `total_count`, `top_team`, `top_team_connects`. Header row required. `Content-Type: text/csv`. Team names can contain spaces — escape correctly.

   **`/api/agents/[id]/scorecard`** — one agent's last 14 days. Returns:
   - `agent`: `{ "id", "name", "team", "hire_date" }`.
   - `last_14_days`: 14 entries, oldest first. Each: `date`, `connected_count`, `total_count`.
   - `totals`: `{ "connected_last_7", "connected_prior_7", "connect_rate_last_7" }` (rate is 0–1).
   - `meta`: same shape as above.
   - 404 if the id doesn't match an agent. Error body: `{ "error": "agent_not_found", "id": "<the id>" }`.

   **`/api/teams/[name]/summary`** — one team's roll-up for the last 7 days. Team names in the URL come URL-encoded (e.g. `West%20Coast`). Returns:
   - `team`: `{ "name", "agent_count" }`.
   - `last_7_days`: `{ "connected_count", "total_count", "connect_rate" }`.
   - `agents`: array of `{ "id", "name", "connected_count", "total_count" }`, sorted descending by `connected_count`.
   - `meta`: same shape.
   - 404 if the team has no agents. Error body: `{ "error": "team_not_found", "name": "<the name>" }`.

   **All four endpoints set `Cache-Control: no-store`** (numbers are always live).
   **All error responses set the appropriate HTTP status code** (404 for the not-found cases above; 400 for malformed input if you encounter any).
   **Don't repeat yourself** — the data layer is one module; the four routes are thin.

## Constraints

- Use this Next.js project. Don't start a new one.
- Use the supplied UI components in `src/components/ui/`. If you need more, add them from the same library, which is called shadcn. Don't bring in a different one.
- All data has to come through `src/lib/db.ts`. No queries anywhere else, no numbers pasted into the page or the API.
- Don't add new top-level dependencies unless you really need to.
- pnpm only.
- Node 22.5 or newer (the local database uses Node's built-in `node:sqlite`). `.nvmrc` is provided.
- The page has to look reasonable on a phone — Dana's at the airport a lot, so 375px wide must work. ArmorHQ logo is at `public/logo.png`. Put it in the header.

## The afterlife

After this ships to Dana, our QA team needs to verify the numbers monthly without asking you. **Ship at least one automated test for the metric calculations.** Vitest is set up — `pnpm test` will run it. Pick what's worth testing.

And in three months when an intern takes this over, they'll need to know what you decided and why. Comments where it matters.
