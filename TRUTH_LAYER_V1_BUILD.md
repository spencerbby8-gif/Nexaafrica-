# Truth Layer v1 — Build & Evidence Report

**Date:** 2026-08-05 · **Branch:** `arena/019fd268-nexaafrica` · **Commit:** `d78e78f`
**Source of truth for scope:** `PRODUCTION_TRUTH_REPORT_2026-08-05.md` ("Truth Report") + `PRODUCTION_AUDIT_LEDGER_2026-08-05.md` ("Ledger") — every fix below cites the live artifact that proved the defect.
**Rules honored:** verified-jobs-first ordering untouched · "Matching your experience" feed stays verified-only (already satisfied — untouched) · no provider names exposed to users (proof-badge/pipelineState code reviewed, untouched) · zero fabricated claims: every "AFTER" statement is backed by a gate (typecheck, fixture) or a live fetch.

---

## 0 · Verification gates (run on the exact committed tree)

| Gate | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** |
| `npx tsx scripts/truth-layer-v1-check.ts` | **30 fixtures passed, 0 failed** |
| Production before-state re-captured live (2026-08-05, after branch push) | defects persist verbatim — see §6 |
| Sandbox `next build` | **not runnable here** — Google Fonts fetch blocked by sandbox egress (environmental, pre-existing, unrelated to this diff; Vercel builds fine) |

The fixture harness caught **3 real implementation bugs during the build** (comma-split location-lock parsing → switched to semicolon + segment analysis; `across` leaking EMEA hiring-context into business-coverage lines → anchor removed; unanchored `0\.\d+k` regex matching real salaries → anchored with currency context). Fixtures earned their keep.

---

## 1 · One shared geo/eligibility corpus  →  `lib/geo/eligibility.ts` (NEW, 378 lines)

**BEFORE (live):**
- `https://v0-nexaafrica.vercel.app/role/finance-operations-audit-leader-openai-worldwide` — SF **hybrid** (3 days/wk office) OpenAI role rendered **"Africa Fit: Explicitly open to Africa • 75% confidence"** with fabricated quote `“d AI to improve risk assessment… identifying anomalies…”`: the substring `mali` inside "anomalies" matched an unanchored country regex; the truth-guard consumed the same regex and *propagated* the lie with a "verbatim" quote (Truth Report §3 Trace B, §4 P0-1; re-fetched 2026-08-05 — still live).
- `…/gcp-senior-consultant-tech-lead-job-ref-63v8x5vr-oben-technology-worldwide` — "Remote (Anywhere Romania) · EET Timeframe" classified worldwide (Romania/Bulgaria absent from restriction corpus), listed on Nigeria hub + open-to-Africa intent page (P1-3, Ledger F-* rows).
- MindPlus Senior PM chain proven end-to-end in one raw `/api/jobs` payload: marketing "partners with businesses worldwide" → `scope_worldwide` → `eligibility:"likely"` → `is_open_to_africa:true` → JAI "Likely open • 75%" (Ledger §2 Trace D).
- MongoDB Gurugram hybrid: "Likely open to Africa • 80%" via business-coverage "EMEA" (Ledger F-EMEA). Pinterest "Los Angeles, CA, US; Remote, CA, US" → "Likely open • 90%" (Ledger F-USSTATE).
- Three copies of conflicting geo regexes (AI verifier, ingest normalize, intelligence signals) — drift guaranteed.

**AFTER (code, fixture-evidenced):**
- Single module consumed by **all four planes**: ingest (`lib/ingest/normalize.ts → classifyEligibility` delegates), signals (`lib/intelligence.ts` scope signals), AI verifier + truth-guard (`lib/ai/verifiers/consolidated.ts`), backfill sniffer (`app/api/ai/backfill/route.ts`).
- `AFRICA_RE` word-boundary anchored; `AFRICA_COLLISION_TOKENS` exported (`mali|togo|chad|niger|benin|guinea|…`) — fixture: **no match** on "anomalies"/"normalize", match retained on real mentions; audit-leader JD → not explicit, not likely.
- Full EU-27 + observed-region restriction corpus (Romania, Bulgaria, Hungary, Armenia…) — fixture: Oben Romania → **restricted**.
- `isUSStateRemoteLocation` (`Remote, CA, US` / `US - Remote`) with postal-code US-anchor requirement — fixture: Pinterest → **restricted** with explicit us-state-remote reason.
- **Dead zones**: marketing/project-coverage lines ("enables businesses worldwide"), multi-line "our regions" boilerplate, legal/EEO lines, and EMEA *coverage* (as opposed to EMEA *hiring*) are stripped before any outreach token can count — fixtures: Decision Inc → restricted (previously likely@55), MindPlus → not likely, Gurugram EMEA-coverage → not likely.
- `classifyGeoEligibility({text, locationField}) → {tier, reason, quote, restrictions}` canonical output; `extractQuote` word-aligned, returns `null` instead of fabricating.
- **Positive control preserved:** Hostaway `staff-product-manager-ai-100-remote-emea…` fixtures stay **explicit** (country list in location) / **likely** (bare "Remote - EMEA" in hiring context).

**Deliberate behavior change to expect post-deploy:** MORE ingest-time `restricted` verdicts and FEWER `open_to_africa` badges — falsification down, coverage down. This is truth recovery, not a regression; company hubs' "open to Africa" counts will drop to honest values as re-verification drains.

---

## 2 · Fact-authority rules across feed, ingest, and JAI

**BEFORE (live):**
- Same page, two salaries: `…/role/talent-operations-manager-micro1-worldwide` badge "USD70k – USD110k (company's job feed)" vs JAI "Salary disclosed: USD 50000 – 70000 • 100%" quoting the actual posting (`$50,000–$70,000`). DB sync guarded by `salary_min IS NULL` → the wrong value was protected from correction **forever** (P0-3; re-fetched 2026-08-05 — still live).
- The verifier *self-certified* salary truthfulness by testing its own combined summary text (`numInText(…, jt)`), and ingested the broken display layer ("USD0.05k – USD0.12k") as ground truth (P0-3 companion).
- Feed `is_remote` boolean outranked posting text: on-site datacenter commissioning role "Fully remote (from feed) • 40%" (P0-5, Trace C).
- "Likely open" rendered as affirmative green chips on queued/rule-based cards everywhere incl. `/remote-jobs/search/open-to-africa` (~90% guesses — P0-4; re-fetched `/companies/mongodb` 2026-08-05: every queued card still asserts "Likely open to Africa").
- Trust-signal rot: logo granted +8 ("indicating legitimate employer presence"); copy asserted "Apply link is on company domain himalayas.app — direct application" (a job board claimed as the company's own domain) (P1-2).

**AFTER (code):**
- **Salary authority (JAI wins when disclosed):** post-upsert in `lib/ai/engine.ts` — when AI extracts a disclosed salary with `max>0`, it **overwrites** `jobs.salary_min/max/currency/period/salary_range` (logged as `salary_authority_applied`); `max≤0` clears the junk under a `.eq("salary_max",0)` guard (`salary_zero_cleared`). The `IS NULL` protection is gone for conflict cases. Circular self-certification deleted — `jobTruth` now uses the candidate's own claims only.
- **Remote authority (text > flag):** verifier order is onsite-text > hybrid-text > remote-text > feed-flag (feed flag demoted to confidence-40 hint, never a 100% verdict over contrary text). UI: `job-card.tsx`/`job-detail-layout.tsx` render aiRemote hybrid→"Hybrid", onsite→"On-site"; feed flag is fallback only.
- **"Unknown" is now rendered as unknown:** eligibility badge = green **verified** only for `explicit`, green **likely** only when produced by JAI; ingest-only `likely` renders as neutral gray **"Likely open · unverified"** — on cards, company hubs, country hubs, and share text ("Open to Africa" only when explicit; "Likely open to Africa" only when JAI-backed).
- **Honest trust copy:** `applicationMethod.ts` — known job-board hosts (himalayas.app, remoteok, remotive, weworkremotely, …) get "Job board apply • host" (+4) instead of "company domain … direct application"; `employerLegitimacy.ts` — logo signal +8→+3, relabeled "Employer branding present" with an honest explanation.

---

## 3 · Persistence normalization at the write boundary  →  `lib/ai/normalize.ts` (NEW, 84 lines)

**BEFORE (live, re-fetched 2026-08-05):** micro1 role shows `Required: {"skill":"large-cohort onboarding at scale","evidence":…}` — **8 raw JSON objects** rendered to users (grew 4→8 across re-verifies — the corruption *compounds*); stored evidence sliced mid-word ("app) Worldwide", `"app/companies/micro1) provides a comprehensive benefits package…"` — a markdown link fragment stored as a "quote"); markdown escapes `\_own\_` persisted; "USD 0 – 0 disclosed • 100%" on the BI-consultant role; hourly $13–36/hr rendered "USD0.013k – USD0.036k" (P1-1, P0-3).

**AFTER (code, fixture-evidenced):**
- `asSkillList` (extracts from `{skill|name|title}` objects, unescapes markdown, case-insensitive dedupe, caps) applied on **every** persist path including the previously-unguarded second-opinion path — fixture: never returns objects, unescapes, dedupes.
- `cleanEvidenceText` (unescape + collapse + 600-char cap) applied to **all** stored evidence fields (main upsert ×6, second-opinion ×5).
- `extractQuote` word-aligned truncation (`…`-affixed) — fixture: no more `…mali`-style fragments; returns `null` when no clean quote exists.
- `formatSalary` hourly-aware — fixture: `$13 - $36/hour` renders as-is, `$50k - $70k` annual unchanged; `MACHINE_JUNK_SALARY_RE` in `lib/format.ts` makes `salaryDisplay` treat `0.013k`-style collapses and `0 – 0` as **absent** (honest fallback) — fixtures cover junk rejection and real-value retention.

---

## 4 · Backfill re-verification  →  `app/api/ai/backfill/route.ts` (NEW, 237 lines)

Authorized GET (`lib/server/auth`: `Authorization: Bearer $CRON_SECRET|$INGEST_TOKEN`), **dry-run by default**, `&execute=1` to write, `CAP=500` per call:

- `kind=africa-fp` — scans latest JAI rows holding `explicit` Africa verdicts; a row is suspect if stored evidence is missing, <10 chars, or fails the new word-boundary corpus after dead-zone stripping → requeued (`status:'pending', attempts:0, next_retry_at:now, error:'[TLV1] re-verify…'`); the existing 05:00 UTC self-chaining drain re-verifies them under the new corpus (audit evidence shows re-verifies already happen naturally — the mali row re-emitted 8/4→8/5 — so a forced requeue converges fast).
- `kind=salary-conflict` — JAI disclosed (`max>0`) × `jobs` rows that are missing, junk (`0–0`/k-collapsed), or numerically mismatched (>$1) → applies the salary-authority update from §2 directly.
- `kind=skills-json` — JAI rows whose skills arrays contain objects → normalized in place via `asSkillList`.
- `kind=all` runs all three and returns per-kind scan/suspect/fix counts.

**Runbook (post-merge, 2 commands):**
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://v0-nexaafrica.vercel.app/api/ai/backfill?kind=all"            # dry-run: review suspects
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://v0-nexaafrica.vercel.app/api/ai/backfill?kind=all&execute=1"
```
Then the next 05:00 UTC drain re-verifies requeued rows; re-check the §6 fixtures.

---

## 5 · Same-PR hygiene

| Defect (live evidence) | Fix |
|---|---|
| Observability dashboard destructured **13 names from 15 queries** — every panel from position 2 shifted; `queue.completed` rendered the *pending* count (P1-4) | `app/admin/observability/page.tsx`: 15 names ⇄ 15 queries, verified line-by-line |
| `lib/ai/gateway.ts` `logAudit({action:"allow"})` silently rejected by `trust_audit_log` CHECK (`flagged\|unflagged\|score_updated\|report_reviewed\|auto_flagged`) → audit table **empty by construction** (P1-4) | `lib/ai/audit/logger.ts`: `PERSISTABLE_ACTIONS` guard; non-persistable actions emit `action_not_persistable` metric + console instead of a silent DB rejection |
| `/api/og?kind=default&title=…` → **HTTP 500** (re-confirmed live 2026-08-05; satori lacks `radial-gradient`) | `app/api/og/route.tsx`: solid tint replaces radial-gradient; ImageResponse wrapped in try/catch with SVG fallback + `console.error('[og] …')` so the failure is observable |
| "12h ago **ago**" on every timeline (re-confirmed live ×3 on both traced roles) | `components/verification-timeline.tsx`: `relativeTime` already suffixes " ago"; template no longer appends a second one |
| Company pages "237 open roles · 237 open to Africa" — two labels over one identical pre-filtered set (P0-2; structural) | `app/companies/page.tsx` + `[slug]/page.tsx`: single truthful `africaFriendlyCount` label ("roles open to Africa"); "Direct apply on company's own site" fabrication dropped |

---

## 6 · Final production audit — authoritative pre-merge baseline (re-captured live 2026-08-05, *after* branch push, prod untouched)

| Fixture | Live finding today | Post-merge expected |
|---|---|---|
| `/role/finance-operations-audit-leader-openai-worldwide` | **Persists:** "Explicitly open to Africa • 75%" + mali-fabricated quote "d AI to improve…anomalies…"; "ago ago" ×3; "Finance, Finance"; `/application` URL as quote source | Backfill `africa-fp` marks it (quote fails dead-zone-stripped `AFRICA_RE`) → re-verified → unknown/restricted; quote regenerated word-aligned or omitted |
| `/role/electrical-commissioning-lead-openai-worldwide` | **Persists** (Ledger §2): "Fully remote (from feed) 40%" on an on-site role; legitimacy 100-vs-0 | Next verification: onsite text outranks feed flag |
| `/role/talent-operations-manager-micro1-worldwide` | **Persists:** badge USD70–110k vs JAI USD 50000–70000 •100%; **8** skills-as-JSON objects; mangled quotes ("app) Worldwide", "app/companies/micro1) provides…"); "14h ago ago" ×3 | `salary-conflict` sets jobs.salary to 50k–70k → single number on the page; `skills-json` normalizes the 8 objects |
| `/role/business-intelligence-consultant-excel-micro1-worldwide` | "USD 0 – 0 disclosed • 100%" (Truth Report) | Rendered as undisclosed (junk-rejection) + `salary_zero_cleared` on next verify |
| `/role/junior-electronic-engineer-qucs-s-micro1-worldwide` | k-collapsed "USD0.05k – USD0.12k" echo (Truth Report) | Junk range suppressed; verifier no longer ingests display strings |
| Oben / MindPlus / Pinterest / Gurugram fixtures | **Persist** (Ledger F-rows) | All restricted/unknown under new corpus at ingest + re-verify |
| `/companies/*` | "N open roles · N open to Africa" over identical set; queued cards assert "Likely open to Africa" | Single truthful count label; queued cards render neutral "Likely open · unverified" |
| `/api/og?kind=default&title=…` | **HTTP 500 today** | HTTP 200 image |
| Positive control `/role/staff-product-manager-ai-100-remote-emea-hostaway-africa` | explicit (correct) | **must stay explicit** — corpus fixtures assert it |

**Production-state drift check:** repo tip ↔ prod build stamp unchanged since audit (sitemap `2026-08-04T08:29:05.798Z`); branch push did not (and cannot) affect production.

---

## 7 · Integration evidence discovered this build (bonus)

- **Supabase Preview CI on the default-branch commit `3d2dc90` FAILED** with *"Remote migration versions not found in local migrations directory."* (live via GitHub check-runs) — direct CI corroboration of Truth Report P3 (duplicate migration versions / out-of-band applies; replay cannot be proven from the repo).
- Repo is public; Vercel + Supabase GitHub Apps both react to pushes. Only two check-runs exist per commit ("Vercel Preview Comments", "Supabase Preview") and the Deployments API is empty — branch previews could not be enumerated from outside (§8).

## 8 · Environment limitations encountered (honest ledger)

1. **Sandbox egress** = github + npm only: no Supabase, no Vercel API, no Google Fonts (kills local `next build`), no general HTTP. Known and pre-proven; not re-litigated.
2. **`gh` REST token in-env is stale** ("Bad credentials", rotated since the audit rounds) — `git` push works (proxy-injected), PR creation via API does not. → PR opened via pre-filled compare link (owner, one click) or after Arena GitHub reconnect.
3. **Branch-preview URL not discoverable from outside:** linked project, team scope, and truncation rules were reverse-engineered (project `v0-nexa-platform-architec`, scope `waylonbaby2-9618s-projects`), but no deployment alias for `arena/019fd268-nexaafrica` resolves — this integration appears to build previews **on PR open**, not on branch push. Opening the PR triggers the build and Vercel posts the exact URL as a PR comment.
4. Therefore **preview-stage verification here = harness + typecheck + code-level diff of rendering behavior against known prod data**, with live-browser preview checks queued as the immediate post-PR step (checklist below).

## 9 · Remaining verification ladder (exact commands/checks)

**On PR open (auto):** Vercel preview builds → verify on preview (same prod DB, so rendering fixes are immediately visible):
- [ ] `/companies/mongodb` header shows single truthful count; queued cards read "Likely open · unverified" (neutral), remote chip no longer asserts "Fully remote (from feed)"-style claims as fact
- [ ] any role page timeline: "14h ago" not "14h ago ago"
- [ ] `/api/og?kind=default&title=Test` → 200 PNG
- [ ] micro1 role card: himalayas signal copy reads "Job board apply • himalayas.app", logo signal is "Employer branding present"

**Post-merge to `arena/019f4801-freeborn` (owner) → production deploy:**
- [ ] Run §4 backfill dry-run then `execute=1` (needs `CRON_SECRET`)
- [ ] After next 05:00 UTC drain: re-run the §6 table — every row must flip to the "Post-merge expected" column; positive control must stay explicit
- [ ] `/admin/observability` panels show plausible aligned counts; `action_not_persistable` appears in logs once per gateway allow (then audit table gains rows only for persistable actions)

## 10 · Deferred debt (documented, not silently skipped)

`posted_at = ingest_time` freshness fabrication is **DB-trigger-enforced** (`20260530154519` coalesces null→created_at) — fixing it needs a migration + adapter-dates plumbing: deliberately out of this PR. Also deferred (all listed in Truth Report §4/P2–P3 with live evidence): trust-score plateaus (partially mitigated by §2 signal honesty), seo-status 1000 caps, build-time sitemap lastmod, `npm run lint` config absence, in-memory rate limiter, dead subsystems (council `Math.random`, 18 superseded `real*AI` verifiers), duplicate migration versions (needs DB-plane access to reconcile), admin in-page authZ (authN verified live).
