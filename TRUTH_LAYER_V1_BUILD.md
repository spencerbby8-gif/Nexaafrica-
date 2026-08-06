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
| ~~`/api/og` HTTP 500~~ — **CORRECTED (errata §10c): the 500 was a fetch-tool artifact on image content-types.** Cross-channel renderers (r.jina.ai, 2026-08-05) prove production's OG route served 200 PNG cards the whole time | Route restored **byte-for-byte** to the healthy production original (PNG ImageResponse retained — SVG would have downgraded PNG-only scrapers for zero real gain) |
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
| ~~`/api/og` HTTP 500~~ | **RETRACTED (§10c)** — serves 200 to content-capable clients; "500" was a tool artifact | unchanged — valid by inspection |
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
- [x] ~~`/api/og` → 200 PNG~~ — verified 200 via cross-channel renderer on both preview and production (§10c); do not re-test with status-only tooling
- [ ] micro1 role card: himalayas signal copy reads "Job board apply • himalayas.app", logo signal is "Employer branding present"

**Post-merge to `arena/019f4801-freeborn` (owner) → production deploy:**
- [ ] Run §4 backfill dry-run then `execute=1` (needs `CRON_SECRET`)
- [ ] After next 05:00 UTC drain: re-run the §6 table — every row must flip to the "Post-merge expected" column; positive control must stay explicit
- [ ] `/admin/observability` panels show plausible aligned counts; `action_not_persistable` appears in logs once per gateway allow (then audit table gains rows only for persistable actions)

## 10 · Preview verification results (PR #32 → deployment `mLbLBJtKVFZaceg4k3patMdzk1uh`, 2026-08-05)

**Preview URL:** `https://v0-nexa-platform-architec-git-091ee2-waylonbaby2-9618s-projects.vercel.app`
**Deployment identity proof:** preview sitemap static-page `lastmod = 2026-08-05T21:42:16.782Z` (fresh build at PR creation) vs production's `2026-08-04T08:29:05.798Z`. Preview reads the same production DB → rendering-plane fixes are verifiable immediately; persisted-data fixes require the post-merge backfill/drain and are *expected stale* in preview.

### PASS (verified live on preview)
| Gate | Evidence |
|---|---|
| "ago ago" template | micro1 role timeline renders "**17h ago**" ×3 (prod: "14h ago ago") |
| P0-4 chip downgrade | `/companies/mongodb` queued cards now read "**Likely open · unverified**" neutral (prod: affirmative "Likely open") |

### DEFECTS FOUND BY PREVIEW — fixed on this branch (same push cycle)
1. **P0-4 residue: "Opportunity Intelligence" bullets asserted "Likely open to Africa"** on queued cards (from the ingest `job.eligibility` fallback inside `africaFitLabel`) even though the chip was downgraded. **Fix:** `africaFitLabel` now treats JAI verdicts and ingest fallbacks as separate claim classes — ingest-only `likely` renders neutral "**Likely open · unverified**"; ingest `restricted` stays visible (protective); ingest `explicit` (Africa actually named in posting) renders "Open to Africa", consistent with the card chip. Applied to both card and detail variants (call sites ×2). Re-verified live on preview: MongoDB hub bullets now read "Likely open · unverified".

### EXPECTED STALE in preview (data-plane; corrected by post-merge backfill + 05:00 UTC drain — not code defects)
Persisted skills-as-JSON (8 objects on micro1) · salary split (badge USD70–110k vs JAI USD 50,000–70,000) · mid-word-mangled stored quotes · legacy trust-signal copy ("Employer with logo…") · stored JAI verdicts incl. the audit-leader's "Explicitly open to Africa • 75%" and the commissioning role's "Fully remote (from feed)". All are re-queued / corrected by `kind=all` backfill + re-verification per §4/§6.

### §10c · ERRATUM — the `/api/og` "HTTP 500" was a measurement artifact, route healthy all along

**What the audit claimed (P1-4):** OG edge route 500s in production, attributed to satori `radial-gradient`. **What is true (cross-channel evidence, 2026-08-05):** an independent renderer (`r.jina.ai`) fetched both the preview AND production `/api/og` endpoints and described the rendered cards ("a black square … N in upper left hand corner", "shimmery green motif") — **HTTP 200 on both, including production's original radial-gradient ImageResponse code.** Every "HTTP 500" ever observed on this route came from ONE fetch tool that cannot ingest image content-types (PNG binary or `image/svg+xml`) and reports its own parse failure as "HTTP 500".

**How this was proven:** six-push elimination on the preview — (a) ImageResponse route 500s on both prod & preview; (b) SVG route 500s; (c) runtime/nodejs+force-dynamic 500s; (d) route reduced to literal string-building 500s; (e) in-band error probe (handler can only return 200) STILL 500s; (f) three path variants (`og`, `og-image`, `social-card`) + five single-variable probe routes: baseline/`runtime`/`force-dynamic`/plain-text-Response all 200, **SVG-returning route 500s** → failure correlated with CONTENT-TYPE, not code → cross-channel check confirmed 200 reality on both deployments.

**Consequences & disposition:**
- The audit's OG finding is **retracted** (recorded here; the dated audit docs intentionally remain as historical record).
- Four iterations of OG "fixes" were reverted; **`app/api/og/route.tsx` restored byte-for-byte to the production-original PNG renderer** (a PNG card serves strictly more scrapers than SVG). All debug routes (`ping-*`, `og-image`, `social-card`) deleted.
- **Verification tooling lesson (now doctrine):** image-typed endpoints must be validated with a content-capable observer; HTTP-status-only fetch tooling is inadmissible for binary/image routes.

---

## 10b · Deferred debt (documented, not silently skipped)

`posted_at = ingest_time` freshness fabrication is **DB-trigger-enforced** (`20260530154519` coalesces null→created_at) — fixing it needs a migration + adapter-dates plumbing: deliberately out of this PR. Also deferred (all listed in Truth Report §4/P2–P3 with live evidence): trust-score plateaus (partially mitigated by §2 signal honesty), seo-status 1000 caps, build-time sitemap lastmod, `npm run lint` config absence, in-memory rate limiter, dead subsystems (council `Math.random`, 18 superseded `real*AI` verifiers), duplicate migration versions (needs DB-plane access to reconcile), admin in-page authZ (authN verified live).

---

## 11 · Trust de-flattening (preview-lane feature, 2026-08-05 — mandate: UI trust must not be static unless truthful)

**Problem (live evidence):** the unified trust plane quantized reality — any JAI row with Africa `unknown|restricted` hard-clamped to exactly **59** (~30/30 sampled cards identical); queued rows flattened via `legitimacy×0.4` to identical **Low 32** (10+ MongoDB hub cards); first-seen recruiters carried clamped raw **100**. Evidence 19% and evidence 95% rendered the same number — a score with zero discriminating power is a label pretending to be a measurement.

**Fix (render-plane only, zero writes — all corrections surface on the existing stored rows):**
1. **Soft cap replaces hard clamp** (`lib/trust/engine.ts:softCapTrust`): capped conditions (Africa unknown/restricted; blocked page) now compress above-cap scores into the sub-59 band (`score' = 59 − (100−score)×0.35`, monotone, ceiling preserved). Unknown/restricted still cannot read as Trusted — but evidence depth differentiates *within* the cap.
2. **Corrected read-time legitimacy** (`correctedTrustSignals`): stateless signals recomputed with current weights at read time (logo +3 not +8, board-host honesty), fabricated freshness zeroed, ctx-dependent **learning entries kept from the persisted set** (real measured history, not discarded); legitimacy = `min(100, 50 + Σ(displayed impacts))` — **the number always sums to the list shown beneath it, and when the sum overruns the scale the card says so**: `correctedTrustSignals` exposes `rawSum` and the trust card marks "Listing signals 100 (at ceiling — signal sum N)" instead of quietly clamping away exactly the differences this plane exists to show. Detail page + card chips both consume this single plane.
3. **Fabricated-freshness honesty** (`postingFreshnessSignal`): `posted_at == created_at` (the coalesce signature) no longer mints "+12 Fresh • 0 days" — renders neutral 0-impact "**Listed recently · no date from source**" with the reason in the explanation. Real dated jobs keep their real-date freshness math unchanged.
4. **Cross-plane disambiguation:** trust card line "Listing legitimacy {N}" → "Listing signals {N}" — the deterministic listing-level number no longer masquerades as the AI's employer-level "Company Legitimacy" verdict (kills the 100-vs-0 reading).

**Truth Audit (mandatory gate for this feature):**
- *Fabricated data?* No — every displayed number sums exactly to the signals listed on the same card; freshness fabrication deleted; soft cap is order-preserving compression, not new data.
- *Contradictory UI?* No — one legitimacy plane feeds the headline number, the legitimacy line, and every chip; admin pages intentionally show the stored write-plane value (moderation context).
- *Static trust?* Fixtures: evidence 19 vs 95 → different scores; raws 73 vs 80 → different under cap; explicit > unknown at equal evidence; queued rows differentiate. 18 new fixtures, **48/48 total PASS**.
- *Misleading labels?* Freshness illusion labeled honestly; listing-vs-company planes disambiguated; cap note copy remains accurate ("cannot exceed Moderate" still true — the band itself now resolves).
- *Evidence inconsistencies?* Learning entries are marked as the persisted set; stateless entries are current-weight recomputes; the merger is documented inline in `engine.ts`.

**Live verification on preview (2026-08-05, final):** micro1 unified 59 → **52** with "Listing signals 100" + honest logo copy visible; audit-leader (explicit) unified stays **75** (legitimacy at ceiling — now MARKED "(at ceiling — signal sum N)", plateau-at-ceiling is truthful identical-evidence, not flattening); queued hubs differ ACROSS employers (MongoDB hub Low **30** vs OpenAI hub Low **32**) while same-company same-feed cards match — identical evidence, identical number, exactly the clause under which the mandate permits equality. Cross-plane copy: "Listing signals" now disambiguates the deterministic plane from the AI "Company Legitimacy" verdict.

**Expected live deltas on preview (same prod DB):** micro1: unified 59 → ~51 (blocked & unknown still cap, evidence 63% now reads); audit-leader (explicit): ~73; queued hub cards: 30–36 varying by employer evidence; any source without real posting dates loses the "Fresh • 0 days" badge for an honest "no date from source" entry.

---

## 12 · Evidence Intelligence V1.1 (preview-lane increment, 2026-08-05 — crawler/store/state integrity)

**Scope:** continues the Evidence Intelligence V1 scaffold (base `3d2dc90`): evidence crawler, evidence store, browser worker, crawler states, intelligence integration. Preview lane only; no production touched; no backfills run.

**Defects found (code-verified against live-rendered behavior; each maps to a fixture):**
1. **Out-of-vocabulary crawler state** — `scripts/evidence-worker.ts` wrote `evidence_state='timeout'` on navigation timeout: `blockedBy("timeout") || classifyBlockStatus(...)` flowed straight into the row. "timeout" is not one of the 8 migrated states → the UI would render raw jargon (`Evidence: timeout`), and the trust layer's `blocked` handling would silently skip the SAME real-world condition a 403 gets capped for. Honest state + lost cause: the timeout detail belonged in `detail`, not in the state field.
2. **Crawler ignored its own retry schedule** — `collectPageEvidence` re-fetched every live page on every AI verification run regardless of the `retry_at` it had itself written (+6h for blocked/failed). A page that refused us (Cloudflare/403/429) was re-hit on every drain and every refusal inserted ANOTHER identical evidence row — impolite to hosts that explicitly refused, and the store filled with echo rows restating one fact.
3. **Evidence store kept echoes, not versions** — every run re-inserted `ats_api` (and `structured_data`) rows with the same content hash. `content_hash` existed but was never read; the store recorded *runs*, not *content versions*.
4. **Raw enum rendering** — `components/job-detail-layout.tsx` rendered `Evidence: {state}` verbatim for every non-blocked state (`Evidence: partial`, `Evidence: verified`, …) — internal vocabulary as user-facing copy. (Live on preview: the blocked branch was the only hand-written one; every other state leaked the enum the moment it appeared.)
5. **Wedged `fetching` rows were unreachable** — a worker crash left `evidence_state='fetching'` forever; both worker selection queries excluded it.

**Fixes (all state writes keep legal vocabulary; no verdicts invented; render-plane change is copy-only):**
- `lib/ai/evidence.ts`: `EVIDENCE_STATES` vocabulary + `isEvidenceState` guard; `workerStateFor(navFailure,status,text)` — nav timeout/abort ⇒ `failed` (cause preserved in `detail.blockedBy`); `shouldDeferLiveFetch` — blocked/failed + future `retry_at` ⇒ reuse stored state truthfully, no re-hit, no echo row (fail-open if the read fails); `sameContentHash` dedupe on `ats_api`/`structured_data` inserts; `crawlerStateLabel` — shared honest copy for all 8 states ("Page could not be read — retry is scheduled" etc.), unknown values degrade to "Page evidence state not recorded", never to jargon.
- `scripts/evidence-worker.ts`: uses `workerStateFor`; selection queries include `fetching` (worker-owned state, serial operator runs — wedged rows are recoverable).
- `components/job-detail-layout.tsx`: renders `crawlerStateLabel` copy+tone; the blocked string is byte-identical to before (regression-locked by fixture).

**Truth Audit (mandatory gate):**
- *Fabricated data?* No — defer-path reuses the stored state it reports (and says nothing more); dedupe only suppresses redundant rows; no new claims anywhere; the timeout fix records strictly MORE truth (state `failed` + cause in detail) than the old `timeout`.
- *Contradictory UI?* No — one label map now feeds every crawler-state mention; blocked copy unchanged; trust numbers untouched.
- *Static trust?* Untouched by design — the V1.1 increment changes evidence-collection integrity and state copy, not scores. Regression-verified live (below).
- *Misleading labels?* Fixed precisely here — raw enums replaced by human copy; "retrying later" (blocked) and "retry is scheduled" (failed) are backed by the actual `retry_at` column the writer sets, and 8d fixtures prove the deference logic consumes it.
- *Evidence inconsistencies?* The store now versions by content hash — two rows with identical hashes can no longer exist from the same run class; states are confined to the migrated vocabulary.

**Gates:** `tsc` PASS · harness **90/90** (suite 8 = +39 fixtures: vocabulary legality, timeout→failed, label honesty incl. "not the raw enum" per state, retry-window deference matrix, hash-version semantics).

**Live verification on preview (deployment `HPc9Juwf242kkuihZxTcncBP92X7`, 2026-08-05, commit `92c1191`):**
- micro1 role: "Crawler: **Page blocked — evidence unavailable, retrying later**" — byte-identical (label-map regression pass); trust plane unchanged — "Listing signals 100 (at ceiling — signal sum 108) · Opportunity evidence 63% · unified **52** · Moderate" + blocked cap note verbatim.
- audit-leader role: "Listing signals 100 (at ceiling — signal sum 144) · Opportunity evidence 55% · unified **75** · Trusted" — unchanged.
- OpenAI hub queued cards: all "Low **32**"; MongoDB hub: "Low **30**" (verified earlier same-day on the prior build; nothing in this diff touches the compute path) — cross-employer variance preserved.
- Collector-side improvements (retry deference, hash versioning) take effect on the next drain/worker run against existing rows — write-plane, same expected-stale rule as §6; preview render-plane behavior verified above.

**Deferred (documented, not skipped):** the `stale` state remains reserved-but-unused — nothing fabricates it; age-based trust decay already runs off `last_verified_at`. A stale-marker belongs with drain-side scheduling, post-merge, with DB-plane verification tooling.

---

## 13 · Evidence Intelligence V1.2 (preview lane, 2026-08-05) — one evidence plane, quote traceability, junk hygiene

**Mandate scope:** every UI evidence item from the latest verified source · quotes accurate/word-aligned/traceable · eliminate stale/duplicated/fabricated/conflicting evidence · confidence from real evidence depth · every badge/chip/explanation backed by the SAME underlying plane · no contradictions across cards/detail/hubs/search/APIs/summaries · heuristics → evidence-driven where possible. Preview only; PR #32 unmerged.

### Re-audit first (fresh fetch of EVERY prior fixture before writing code)
Trust planes (52/75/30/32 + rawSums) ✓ unchanged · cap notes ✓ · chips/bullets ✓ · OG 200 via r.jina.ai ✓ · positive control Hostaway explicit ✓ (but see D1 below) · nigeria hub & intent page: **original P0/P1 findings STILL LIVE in the render plane** (Oben Romania on /remote-jobs/nigeria + /open-to-africa; MindPlus "Likely open to Africa • 75%"; mali "Explicitly open to Africa • 75%" + fabricated quote; "Finance, Finance"; mangled quotes) — previously classified "expected-stale (backfill-gated)". **The V1.2 insight: none of them needed the backfill — they were all treatable at the render plane by re-deriving truth from the posting text we already hold.**

### New defects found & fixed (each live-proven, then fixture-locked)
| # | Live defect (before) | Fix |
|---|---|---|
| D1 | Render-time quote extractor sliced markdown: `"app) Worldwide"`, `"Hostaway(https://himalayas."`, `"…United Stat"` (Hostaway), benefit fragments `"app/companies/micro1) provides…` | `plainifyPosting` + word-aligned `extractExcerpt` + per-segment extraction (no cross-field splices) in `lib/evidence.ts` |
| D2 | Stored quotes rendered unverified: mali quote; escaped `"\*\*NOTE…"`; mid-word `"ues to ensure…"` on hub cards | `traceableQuote` — quotes render only when present word-aligned in the plain posting; applied to EvidencePanel persisted excerpts + all EvidenceQuote sites |
| D3 | Three stored eligibility stores drifted; surfaces disagreed: mali explicit everywhere; Oben/MindPlus/Decision on Africa pages | `lib/geo/render-eligibility.ts` arbitration plane — corpus re-reads the posting at render; stored claims show as verified only when corpus-corroborated; consumed by card chip, opportunity intelligence, EvidencePanel, trust cap, cap note, intent page (explicit/likely only), country hubs (restricted excluded) |
| D4 | Stored confidence attached to uncorroborated claims ("Likely open · unverified • 75%" risk; "unknown • 75%") | confidence % gated on `corroborated` in both panel variants |
| D5 | "Required: Finance, Finance" duplicates; tags masquerading as required skills | `asSkillList` at render + "Tagged in the feed:" honesty |
| D6 | "Required: {\"skill\":…}" 8 JSON objects (micro1) | `asSkillList` unwraps stringified-JSON entries; broken JSON dropped |
| D7 | Same-page salary split: badge 70–110k vs JAI 50–70k quoted from posting | `jaiSalaryDisplay` — quote-traceable JAI salary outranks conflicting feed range on card AND detail |
| D8 | Salary junk asserted as fact: "USD 0 – 0 • 100%", "USD0.03k – 0.1k" ×4 surfaces, missing period | zero/k-collapse guards in `salaryTruthLabel`, feed-range fallbacks, EvidencePanel metadata branch — one junk test everywhere; hourly keeps `/hour` |
| D9 | Intent-page copy overclaimed the evidence ("only when explicitly accepts…", "every six hours" refresh) | copy now states the real policy (corpus explicit/likely, exclusions, daily refresh) |

### Live verification (deployments rRqY5wds→4KbKfpKQ, commits e9a436f..be92eb8, 2026-08-05)
- **mali row** (`/role/finance-operations-audit-leader-openai-worldwide`): "Explicitly open to Africa • 75%" + fabricated quote → **gone**; Africa Fits reads "Africa eligibility unknown" (no stray confidence), unified **75 → 50 Moderate** with honest note "Capped: Africa eligibility is unverified…"; "Required: Finance, Finance" → "Tagged in the feed: Finance". Zero fabricated claims remain on the page.
- **Oben Romania**: removed from `/remote-jobs/nigeria` and `/remote-jobs/search/open-to-africa`.
- **Intent page**: 12+ guess-listings → 3 corpus-confirmed (Hostaway "Open to Africa", iManage/EMCD "Likely open" corroborated); copy matches the real policy.
- **micro1 detail**: 8 JSON objects → clean skill names; salary **one number** ("USD50k - USD70k", posting-verbatim) on panel + JAI + card; mangled quotes gone; worldwide signal quote honestly omitted (single-word fragment).
- **Nigeria hub**: MindPlus/Decision junk claims gone; "Salary unclear" replaces "USD 0 – 0 • 100%" and k-collapses; chip-vs-bullet contradictions closed; Hostaway corroborated "Explicitly open to Africa".
- **Variance preserved** (mandate): unified 52 (micro1 blocked) / 46 (video editor, hostaway) / 50 (audit-leader capped-unknown) / 55 (workflow annotator) / 30–32 queued hubs — scores move with evidence, never flat.
- Gates at final HEAD: `tsc` PASS · fixtures **140/140** (suites 9–11 = +49 real live cases; two suite-7 fixtures updated to V1.2 semantics: "explicit" now requires Africa traceable in the posting; mali regression guarded).

### Truth Audit answers (V1.2)
Fabricated data? None — every rendered quote is containment-verified; dropped evidence is omitted, never replaced with plausible text. Contradictory UI? The card, panel, hub, intent, and trust planes now read one arbitrated tier/one salary rule/one quote test — the audit produced 3 same-page contradictions DURING the build (salary fallback, panel metadata, confidence gate) and all were closed before stopping. Static trust? No — arbiter is pure recomputation from posting text; scores spread with evidence. Misleading labels? Intent copy, "Tagged in the feed", "Salary unclear", unverified classes all state their provenance. Evidence inconsistencies? Stored claims survive ONLY with corpus corroboration; everything uncorroborated is labeled unverified or unknown.

### Intentionally deferred
- Stored-row healing still belongs to the post-merge backfill + drain (write plane; the render plane now shields users from the stale rows, but the rows themselves await `kind=all` + re-verify).
- `stale` crawler state remains reserved (no fabricated staleness marker).
- `/api/jobs` exposes persisted raw `trust_score` (machine surface; aligning it requires the same AI join the detail page does — deferred rather than half-aligned).
- posted_at=ingest fabrication (DB trigger + adapter plumbing), seo-status caps, duplicate migration versions — unchanged from §10b.

## 14 · Architecture cleanup — single canonical owner per intelligence decision (2026-08-05, doctrine-mandated)

**Doctrine (user, governing):** the render layer is never allowed to become an intelligence engine. It may sanitize objectively malformed data, improve presentation, expose provenance, and communicate uncertainty — never reinterpret, recompute, replace, downgrade, or silently override canonical intelligence. Triggered by RENDER_BOUNDARY_AUDIT_2026-08-05.md.

**Owner map (final architecture):**

| Decision | Canonical owner | Where |
|---|---|---|
| Ingestion (rows, ingest tier) | Ingest | `lib/ingest/*` |
| Verification (Africa verdicts, salary/remote authority, AI conclusions) | Verifier / AI engine | `lib/geo/eligibility.ts`, `lib/ai/verifiers/*`, `lib/ai/engine.ts` |
| Company intelligence | Company Intelligence plane | `job_ai_intelligence` rows |
| Evidence (crawler states, store) | Evidence pipeline | `lib/ai/evidence.ts`, `scripts/evidence-worker.ts` |
| Trust (scores, signals, rescoring) | Trust Engine (write plane) | `lib/trust/engine.ts` (`calculateTrustScore`, `rescoreTrustSignals`), persisted `jobs.trust_*` |
| Healing historical data | Backfill | `app/api/ai/backfill`, `app/api/jobs/backfill-trust` |
| Display | Render | sanitize malformed values, label provenance, show uncertainty — nothing more |

**Executed reverts (A1–A5):**
- **A1** render-time eligibility arbitration deleted (`lib/geo/render-eligibility.ts` gone). The corpus re-read moved to the verifier domain as `corroborateAfricaClaim()` in `lib/geo/eligibility.ts`, consumed by the africa-fp backfill healer (which now also re-reads the CURRENT posting, not just the stored quote) and future re-verification. All render consumers display the canonical stored verdict chain (JAI verdict first, ingest tier as fallback) with P0-4 provenance classes.
- **A2** country-hub and intent-page membership follow stored flags again; render no longer re-decides page membership.
- **A3** trust cap + cap note gate on the stored `africa_eligibility` verdict.
- **A4** render salary authority deleted (`jaiSalaryDisplay` gone). Card and evidence panel display the canonical feed plane (junk guard kept); the JAI range displays in the Opportunity panel with its own provenance. Write path owns reconciliation (`salary_authority_applied` at verification; salary-conflict healer extended with the stale-quote requeue class).
- **A5** confidence display pairs with its stored verdict again (no render corroboration gating).

**Kept presentation/sanitization (B):** traceable quoting, plainified word-aligned excerpts, junk-salary guards (with the corrected copy: "Raw value failed quality checks — we don't display it as compensation."), skills de-duping/unwrap, claim-class provenance labels, crawler-state labels, presentation bug fixes, OG restore.

**Judgment calls (C):**
- **C1 REVERTED.** The render-time trust correction is gone from every render file. The identical computation exists only as `rescoreTrustSignals` (write plane), consumed by `POST /api/jobs/backfill-trust` (now preserves persisted measured-learning entries); `TRUST_VERSION` bumped 2 → 3 so pre-doctrine rows are rescore-eligible. Accepted consequence: plateaus (raw 100s, 59-band) return in render until the merge-gated rescore runs — **stale truth over fabricated freshness**.
- **C2 kept with doctrine constraint:** `unifiedTrustScore` is a presentation metric over canonical persisted inputs only (persisted `trust_score` + persisted `overall_confidence`). The render-time dynamic adjustments (freshness decay, richness/provenance bonuses, dead-page penalty) were removed from render; evidence age/depth is the verifier plane's business at write time.
- **C3 kept:** `softCapTrust` is a monotone presentation of the pre-existing cap rule over canonical stored inputs; no business decision consumes the transformed number.
- **C4 kept:** ceiling marker is pure arithmetic over displayed persisted signals.

**Structural enforcement:** harness suite 12 walks `app/`, `components/`, `lib/` and fails if any reverted override identifier (`render-eligibility`, `correctedTrustSignals`, `displayLegitimacy`, `jaiSalaryDisplay`, render `corroborated` gating) ever returns; plus the verifier-domain corroboration matrix. 139/139.

**Honest display consequences (doctrine-accepted, heal at the write path):**
- mali-class rows display their stored (wrong) "Explicitly open to Africa • 75%" verdict again — visibly stale until merge + `africa-fp` backfill re-verifies them.
- Oben's Romania-locked role re-appears on /remote-jobs/nigeria and the Africa intent page until ingest/re-verify corrects stored flags.
- Micro1-class salary splits display both planes with provenance (card: feed; panel: JAI range) until the write-path authority + salary-conflict backfill settle them.
- Trust plateaus return until the rescore backfill runs.

**Backfill runbook (unchanged, merge-gated, never run in preview):** `GET /api/ai/backfill?kind=africa-fp|salary-conflict|skills-json|all&execute=1` (Bearer CRON_SECRET; dry-run first) + `POST /api/jobs/backfill-trust?batch=500`. Preview lane throughout: nothing merged, no production, no backfills executed.

## 14b · §14 live verification — deployment `H4mtm3bpDKSrAmBGaUuw9vwHXKK4` (2026-08-05)

Every surface verified on the preview alias after the cleanup. Doctrine-consequence rows (visible staleness, write-path healing) are labeled as such — they are the doctrine working, not regressions.

**Trust plane (C1/C2/C3/C4):**
- Audit-leader: "Listing signals **100** (at ceiling — signal sum **156**) · Opportunity evidence 55% · **unified 73**". Persisted score/signals displayed; ceiling marker = arithmetic over displayed signals (C4). 73 = 100·0.4 + 55·0.6 exactly — no decay/richness/provenance adjustments (C2), no render arbitration (A3).
- Video Editor: unified **45** with blocked-cap note (stored `evidence_state` governs — C3 presentation of the stored rule).
- Feed values 40/45/49/50/51/54/55 — **plateaus return (100-base)**. Doctrine-accepted: stale truth until the merge-gated rescore backfill (`TRUST_VERSION` 3, `POST /api/jobs/backfill-trust`) re-persists rows. Never masked at render.

**Africa eligibility (A1/A5):**
- Audit-leader (mali class): "Explicitly open to Africa · 75% confidence" — the stored (wrong) verdict displayed with its stored confidence + class provenance, NOT silently overruled. Heals via `africa-fp` backfill → verifier re-judges under the corpus (`corroborateAfricaClaim`, verifier domain).
- Evidence panel anchor "Explicitly open to Africa — From eligibility analysis" with NO excerpt (nothing traceable in posting → no fabricated-looking quote; claim still shows with provenance).

**Membership (A2):** Oben Romania back on `/remote-jobs/nigeria` and `/remote-jobs/search/open-to-africa` — stored-flag membership, honestly labeled "Likely open · unverified" (ingest tier, no AI row → neutral class ✓ P0-4). MindPlus 75% / Decision 55% stored claims back on both. Hostaway "Open to Africa" (stored ingest-explicit) intact ✓.

**Salary (A4/B3/B9):** Talent Ops card: chip "USD70k - USD110k" (feed) + panel "USD 50000 – 70000/year — Quoted from posting • 100%" (JAI) — both planes with provenance, no silent adjudication. Junk rows (Workflow Annotator ×2, BI Consultant, Gameplay): "Salary unclear", zero "USD0.03k"/"USD 0 – 0" strings anywhere. Autodesk (stored `disclosed` with no numbers): "Salary not disclosed" + stored "Transparency: disclosed 70%" still visible — nothing fabricated. Genuine ranges pass: Reddit "$217,000—$303,900".

**Kept presentation work (B):** quotes all word-aligned/traceable ("We use a hybrid work model…", "Location: Remote", "Job Type: Contractor"); skills unwrapped clean ("large-cohort onboarding at scale…", "Excel, Power Query…"); "Tagged in the feed:" honesty; crawler label "Page blocked — evidence unavailable, retrying later" byte-stable.

**Single-owner confirmation:** every displayed Africa verdict, salary figure, trust score, skills list, crawler state and confidence on these surfaces traces to exactly one canonical plane (persisted `jobs`/`job_ai_intelligence` rows computed by ingest/verifier/trust-engine), with render limited to junk-guards, quote traceability, de-duping and provenance labels. Harness suite 12 guards the boundary structurally (139/139).

## 15 · Evidence-plane audit + restore (2026-08-06, deployment `BjDj7EnzJ1f9RFZXNk9zo62KrMRt`)

**Trigger:** user report — most jobs showed empty evidence after the §14 cleanup. Ordered audit; cross-checked stored rows (via the public `/api/jobs` merge of persisted `jobs` + `job_ai_intelligence`) against rendered pages for a 7-job sample.

**Verdict: persistence was never broken.** `job_evidence_v1` writers untouched since `92c1191` (git log); `jobs.evidence_state` populated (blocked/null per collector state — state is only written together with a store row); `job_ai_intelligence` rows carry full evidence fields (quotes, urls, `evidence_refs` {sources, pageStatus, provenance, dimensionCount}, `evidence_provenance`, `last_verified_at`) — all verified present in raw rows. The disappearance was **two render-time suppressions** at the final quote boundary:

| Where evidence vanished | Root cause | Live proof (before → after) |
|---|---|---|
| Benefit/async/scope quotes on detail panels ("Quoted from the posting" with NO quote under it) | `traceableQuote` demanded strict full-containment; extractor-written stored excerpts are truncation-marked (`...`/"…") and can never satisfy it. Structural incompatibility, not missing evidence. | Veeam: healthcare/retirement/PTO rows had provenance label and zero quote → now show the real stored excerpts with marks. Hostaway healthcare likewise. |
| Card "Evidence" blocks (homepage + jobs page) | Block picked the FIRST stored quote string; when it failed traceability it rendered a bare "Evidence" heading with nothing under it — and hid traceable stored quotes positioned after it (salary/remote) in the same row. | Homepage intelligence cards: 3/8 quotes visible before → SPM MongoDB `“$136,000—$266,000”` and Pinterest `“$123,684—$254,644”` restored; MindPlus/Decision/Sourcer now show NO block — honest, because their stored rows contain no posting-quote (MindPlus `africa_evidence: null`, `salary_evidence: null`, `remote_evidence: "Marked as remote in source feed"` — its own stored quality row: "no strong evidence; hallucination risk detected"). |

**Fixes (render-plane, display-safety only — no recompute, no substitute text, no writes):**
1. `traceableQuote` is ellipsis-aware: a segment bounded by a truncation mark may start/end mid-word (that is exactly what the mark means); segments under 12 chars never pass; order is enforced; **unmarked mid-word slices still die** — Veeam "privat..." renders, mali stored "d AI to improve…" stays suppressed, "…United Stat" stays suppressed, "app) Worldwide…" href fragments stay suppressed.
2. Card Evidence block selects the first DISPLAY-SAFE stored quote among africa/remote/salary; when none survives, the block renders nothing (pipeline badge already communicates pending/degraded).

**Cross-check sample (stored ↔ displayed), all consistent post-restore:** video-editor (remote quote shown; africa unknown 0% — stored null; junk feed range guarded), talent-ops (both salary planes + traceable posting salary quote; skills unwrapped), audit-leader (stored explicit 75% shown; stored quote is an unmarked mid-word slice → not shown; africa-fp backfill heals at write path), Veeam (3 benefit quotes restored; blocked crawler honest), Oben (stored rule-based verdicts; EET timezone; blocked honest), MindPlus (claim without stored quote — honestly nothing to quote), Hostaway (equity quote shown; healthcare restored).

**Gates:** tsc clean; harness 148/148 (new suite 9f pins every restore/keep-dead vector from real stored rows). No rows written, no healers executed, no backfills, preview lane only.

## 16 · Data-plane audit — evidence completeness + company legitimacy (2026-08-06, audit only, render untouched)

**Trigger:** after §15 restored quote DISPLAY, most jobs still show no evidence and company legitimacy is inconsistent within the same company/source. Ordered audit of the two write planes; raw persisted rows cross-checked against the preview via the public `/api/jobs` merge (jobs + job_ai_intelligence + queue status). No code changed, no merges, no backfills, preview only. Gates after: tsc clean, harness 148/148.

**Headline counters (homepage, live):** 4,867 active · 1,981 "Nexa Intelligence" rows (41%, `model_version LIKE '%:%' AND NOT LIKE 'regex%'`) · 1,626 rule-based rows (33%, `model_version LIKE 'regex%' OR 'no-ai%'`) · 1 pending. ⇒ **~1,260 active jobs (26%) are in neither bucket** — no JAI row at all, or rows stamped with historical version strings (e.g. `rule-based-v1-fast`) that neither bucket counts.

### Sampled raw rows (via `/api/jobs`), all four planes visible

| Job | JAI model_version | company_legitimacy | evidence_state | evidence_refs | queue |
|---|---|---|---|---|---|
| Reddit Dir. FP&A `4b8cd491` | `regex-extracted-7880bytes` (7/29) | unknown · 0 | **null** | null | completed |
| Reddit Sr Staff DS `bc3598d8` | `mistral:mistral-medium-2505` (7/30, page 200) | unknown · 0 | **null** | null | completed |
| Reddit Staff PM Ads T&S `b52093f7` | `github_models:gpt-4o-mini` (7/30, page 200) | unknown · 0 | **null** | null | completed |
| MongoDB Solutions Architect `0a509e15` | `regex-extracted-45bytes` (8/1) | unknown · 0 | **null** | null | completed |
| MongoDB Assoc HR `e501432b` | `mistral:mistral-medium-2505` (7/29) | **verified · 90** | **null** | null | completed |
| MongoDB Dir Critical Comms `7b85bc41` (NEW 8/6) | `regex-extracted-33bytes` (**8/6 04:26**) | unknown · 0 | **fetched** | present (pageStatus 200, dimCount 3) | completed |
| Stripe Consultant `f234b74c` | `regex-extracted-8036bytes` (8/5 04:27) | unknown · 0 | **fetched** | present (dimCount 2) | completed |
| Stripe Consultant `9f32e3b0` | `regex-extracted-8169bytes` (**8/6 04:24**) | unknown · 0 | **fetched** | present (dimCount 2) | completed |

Simultaneously, every one of these rows' `jobs.trust_signals` asserts **"Verified employer" +15** (`employerLegitimacySignal`, curated-registry hit). Homepage intelligence section shows MongoDB "Company verified · 90/100" and MongoDB/Pinterest "Company legitimacy unknown" on cards **in the same section, same company** (`/`, 2026-08-06).

### Evidence completeness — exact reasons, in order

1. **The evidence plane works — only jobs drained after V1.1 carry it.** Signature is binary in the sample: every row processed after the V1.1 deploy has `evidence_state` + `evidence_refs`; every row processed before has both `null`. Nothing vanished — it was simply never collected for historical rows.
2. **Completed queue rows are sealed forever.** Ingest re-sight upsert uses `ignoreDuplicates: true` (lib/ingest/run.ts) and only resets `failed → pending`; `completed` rows (including every pre-V1 row and every regex row) are never re-drained. There is no requeue heuristic for "processed before the evidence plane existed".
3. **Provider failure is persisted as terminal success.** When the AI call fails, `consolidated.ts:597` returns `regex-extracted-<len>bytes`; the engine's `allProvidersFailed` guard only matches `no-ai-providers|failed-no-evidence|verifyJobReal-threw` (engine.ts). Regex rows are therefore upserted and the queue row marked `completed`. BOTH drains in this audit window (8/5 04:24-27, 8/6 04:24-26) sealed fresh rows at regex tier.
4. **Admission-rejected jobs skip evidence collection** (engine returns before `collectPageEvidence`) — by design, but it means "no evidence" on those rows conflates "never attempted" with "attempted and none".
5. **Jobs with no queue row at all never enter the pipeline.** Engine's orphan-heal requeues `completed`-without-JAI, but missing queue rows are invisible. The ~1,260 out-of-bucket population can't be enumerated from the public surface (service-role only).

### Company legitimacy — mis-owned across planes

Three writers, no canonical owner:
- **Trust plane (deterministic):** `employerLegitimacySignal` — "Verified employer +15" if `job.company` ∈ 22-company curated ingest registry. Per-company decision in the CODE, projected identically onto every job row.
- **JAI plane (nondeterministic):** consolidated single-call sets `company_legitimacy` per JOB run. `consolidated.ts` rule 5 zeroes any non-unknown verdict to `unknown · 0` whenever `fetchCompanyPage` failed for that run — and for ATS-hosted apply URLs the "company page" is a domain GUESS (`https://{company}.com|.io|.co/careers`). Guesses that succeed (mongodb.com, stripe.com) sometimes yield `verified · 90/100` ("MongoDB: The World's Leading Modern Data Platform" — a <title> quote); guesses that fail (reddit.com/careers unreachable, timeouts, transient errors) yield `unknown · 0`. Same company ⇒ different stored verdicts at 90%-per-fetch-luck fidelity.
- **Learning plane:** `company_intelligence` aggregates measured hiring metrics, renders facts, carries no legitimacy verdict.
Result: a company-level fact ("is this employer legitimate") is re-derived per job at AI-call time from liveness of a domain guess, then rendered side-by-side with a deterministic plane that asserts the opposite. **Canonical owner must be company-level**: one verdict per company, written once, read by every surface (cards, detail panel, trust signal); per-job AI should emit scam/evidence signals about the posting, not company identity verdicts.

### What must be fixed (write path / crawler path — none executed here)

1. **Engine:** treat `regex-extracted-*` like provider failure — no JAI upsert (or write with `pending + retry`), never `completed`. Terminal success must require a real provider model version. Also add `regex-extracted-*` to the engine's misleading-version list so future protection checks classify it correctly.
2. **Drain start:** requeue class — JAI rows with `model_version LIKE 'regex%' OR 'no-ai%'` (and rows with `evidence_refs IS NULL` from pre-V1 processing) set back to `pending` with capped attempts; orphan detection extended to jobs with NO queue row at all. Merge-gated; run as heal-backfill after merge, never silently.
3. **Ingest:** write the `ats_api` evidence row + set `jobs.evidence_state` at ingest time for every accepted job (the stored description IS preference-1 evidence per the evidence-service's own source order) — then no job ever has an empty evidence plane.
4. **Company legitimacy:** single company-plane owner. Short-term deterministic: verdict derives from the SAME curated registry the trust plane uses (one source of truth), per-job AI prohibited from emitting company identity verdicts (it may still attach posting-level scam evidence). Long-term: `company_intelligence` becomes the verdict store (verified_at, basis), job surfaces read it; `employerLegitimacySignal` reads it too instead of hardcoding the registry.
5. Priority honored: drain order stays `priority DESC, created_at ASC` with verified jobs first; Matching-Your-Experience remains verified-only; trust labels untouched.

No UI masking was added, no trust recomputed in render, nothing merged or deployed.

## 17 · Write-path repair — evidence plane + canonical company legitimacy (2026-08-06)

The §16 audit's fixes, built in the preview branch. No backfills executed, no drains invoked, no merges; the repairs execute on the next routine authorized drain (crons fire only on the production deployment — same merge-gated posture as the existing healers).

**1. Requeue instead of seal.** `lib/ai/queue-repair.ts` (pure): `isFailedModelVersion` now classifies `regex-extracted-*`, `rule-based-v1-fast`, `no-ai-providers`, `failed-no-evidence`, `verifyJobReal-threw` as failures. The engine's failure gate now fires for ANY existing-row state (previously a "failed" run could still upsert over an existing row, blanking its evidence) — failed runs always schedule a retry with backoff; the stored row is preserved untouched. `existingIsMisleading` now includes `regex-extracted-*`.

**Drain-start repairs (two new passes, both bounded + monotonic):** (a) completed queue rows joined to their JAI rows — `queueRepairDecision` requeues `thin_tier` (rule-based/AI-less models) and `pre_v1_evidence` (`evidence_refs null`) classes back to pending with labeled errors, capped 250/drain; admission rejections ("Rejected: … [gate]") stay terminal; completed-without-JAI stays with the pre-existing orphan-heal. (b) No-queue-row detection: oldest-1,000 active jobs anti-joined against the queue; missing rows inserted pending (priority 5, labeled). Both pools shrink monotonically — a healed row never returns to the repair set.

**2. Ingest-plane evidence.** `recordIngestEvidence` (lib/ai/evidence.ts) runs at ingest for every accepted job (both loops in run.ts): the stored ATS/feed description — source-preference #1 — becomes a `job_evidence_v1` ats_api verified row (content-hash versioned; identical content is a version, not an echo), and `jobs.evidence_state` is filled ONLY when null — a crawler-attested state (blocked/failed/partial) is never overwritten by ingest. Short/absent descriptions write nothing: honest absence.

**3. One canonical owner for company legitimacy.** `lib/company/legitimacy.ts`: `companyLegitimacyOwner()` — registry membership (source-authenticated via the company's own curated ATS feed) → verified·95 with an explicit basis sentence; posting-level scam evidence → suspicious (demotes, never promotes; cannot demote a channel-authenticated employer); measured learning (`company_intelligence` totals ≥3 roles and verification rate ≥15%) → bounded likely_legit (≤70 confidence); otherwise honest unknown·0. **Fetch liveness is not an input.** Wired: `employerLegitimacySignal` (trust plane) delegates to the owner; `enrichJobWithAI` overwrites the AI bundle's company dimension with the owner verdict (per-dimension model `company-plane:<basis>`), loading the learning row once per drain job; `consolidated.ts` hardening now zeroes every AI-emitted "verified"/"likely_legit" (invented identity) and keeps "suspicious" only with a verbatim posting quote; the prompt forbids identity verdicts outright. Render never calls the owner (suite 13g guards): cards/panels keep displaying the persisted JAI verdict.

**4. Preservation.** Engine upsert does a per-dimension merge over the existing row (africa/remote/visa/salary/company/quality): a stored quote survives a pass that lost it while the verdict is unchanged; a changed verdict never inherits the old quote (mis-provenance > honest absence). Failed runs never reach the upsert at all.

**5. Render untouched.** Zero edits under app/ or components/.

**Fixtures:** harness suite 13 (35 checks) — every seal/requeue vector uses the real live versions from §16's table (regex-extracted-33bytes/-8036bytes/-7880bytes, mistral:…, github_models:…); owner fixtures pin registry-verified immutable-vs-scam, AI-cannot-elevate, scam-demotes-with-quote, measured-likely bounded, placeholder guard, volatility guard; trust-signal parity (same owner → same +15 verified basis; logo stays +3 cosmetic; new employer 0); ingest evidence row shape + honest-absence; structural boundary (no render importer of the owner; seal guard precedes the upsert). **Suite: 183/183. tsc clean.**

## 18 · Fresh render-vs-storage audit + deterministic Africa/slug fixes (2026-08-06)

Ordered audit of the live preview (deployment 9CPfwReAd) using only rendered pages and the persisted `/api/jobs` merge. ~18 raw rows fully captured + ~25 rendered cards/catalog entries.

**Per-job evidence classification (stored ↔ rendered):**
- Renders correctly (salary/benefit quotes): MongoDB SPM `$136,000—$266,000`, Pinterest `$123,684—$254,644`, Reddit rows on /jobs with salary quotes, adoption detail benefit quotes, Hostaway healthcare/equity.
- Exists but hidden (display-safety traceability, §15): contract-sourcer africa quote "oss a broad range of functions…" (unmarked mid-word); audit-leader mali stored slice.
- Never written: 8/6 regex-sealed rows (MongoDB Dir Comms 7b85bc41, Stripe 9f32e3b0/f234b74c) — V1 evidence collected (evidence_state fetched, evidence_refs present) but intelligence dimensions sealed at regex tier; + historical pre-V1 rows (evidence_state null, evidence_refs null).
- OVERWRITTEN — proven once: adoption-duplicate 9fd3f065 was a real-model row (render snapshot: verified·100, overall 80, prose skills) overwritten 2026-07-29T16:51Z by `regex-extracted-8079bytes` (overall 22, dims nulled) via the failed-run-upserts-anyway hole closed in §17.
- Stale: all 7/29–8/4 real-model rows (llama/mistral/gpt) — pre-hardening prompt, fabricated-provenance evidence (llama company_evidence = About-boilerplate; PRS africa quote = marketing corpus; assoc-hr africa = EMEA-coverage sentence; contract sourcer queue error stale text "Retry #1 scheduled" on a completed row — fixed: completions now clear error).
- Collection failed: evidence_state blocked (MindPlus himalayas, Veeam, video-editor) — honest recorded state.

**Company-legitimacy/Africa variance root causes (≥20 same-company rows):**
1. Per-job AI verdict from per-run company-page fetch luck + prompt-version drift (proven: Reddit llama rows → verified·100 citing About-text; mistral/gpt/regex rows → unknown — one company, identical channel).
2. Two un-synced persistence points for Africa written by different judges (corpus at ingest vs AI hunches at drain; mali-marketing fabrications stood as africa_evidence).
3. Duplicate postings with identical display slugs (adoption pair j7997020 vs j8081271 — near-identical posted_at: 00:26:56 vs 00:26:53; distinct salaries) — the suspected render/cache divergence was DISPROVEN: no UI bug; surfaces rendered different ROWs behind one URL. Retracted honestly.
4. §16/§17 fixes are drain-gated; existing stored rows cannot become consistent without the authorized pipeline.

**Fixes (write path only, fixture-pinned 200/200, tsc clean):**
- `adjudicateAfricaEligibility` (lib/geo/eligibility.ts) — deterministic corpus owner of the Africa decision; `enrichJobWithAI` writes it into the JAI africa dimension (model `adjudicator:corpus-v1`), so ingest and JAI write ONE judge's verdict; per-run AI can never re-decide. Evidence differs honestly → verdicts differ honestly (eng-manager "any country…" likely vs adoption restricted).
- Queue hygiene: completed rows now store `error: null`.
- Slug identity (lib/slug.ts + run.ts both loops): oldest active base-slug row owns base; later dupes resolve deterministic `-dup-<key>` slugs (adoption case pinned verbatim).

No backfills, no drains invoked, no merges, preview-only code proof; healing executes on the next authorized ingest/drain.

## 19 · TRUTH LAYER V2 — VALIDATION (2026-08-06, preview-only, read-only)

Validation lane: new read-only endpoint `GET /api/validation/truth-layer-v2`
(provably no DML in source; provider names never leave the server — bucketed
real-model/rule-based/none; evidence excerpts never leave the DB —
counts/kinds/statuses only). Judges: the deterministic owners only
(Africa corpus adjudicator · canonical company owner · word-aligned quote
traceability · trust arithmetic). Same pure functions drive (a) this
endpoint, (b) the drain-start repair pass in lib/ai/engine.ts, (c) harness
suite 15 — simulated drain and real drain cannot diverge.

Audit: 122 jobs end-to-end — Reddit/Pinterest/MongoDB/Stripe × 20 each +
remoteok/greenhouse/ashby/lever × 12 each (deduped). Queue health at run:
pending 1 · processing 0 · completed 6,484 · failed 0.

### 1 · Zero contradictions — measured

| Kind (current stored lake) | Count | Heal class |
|---|---|---|
| company_vs_owner | 74 | drain_requeue |
| quote_untraceable | 71 | drain_requeue |
| africa_vs_adjudicator | 56 | drain_requeue |
| trust_signal_vs_owner | 3 | ingest_rescore |
| **Total** | **204** | **UNEXPLAINED: 0** |

Same-company cohorts today (stored verdicts): Reddit verified 4/unknown 9/
likely_legit 1/none 6 · MongoDB verified 2/unknown 16/none 2 · Stripe
verified 1/unknown 12/likely_legit 2/none 5 · Spotify likely_legit 8/unknown
2/none 2 → 4 divergent cohorts of 10 (the live flip the doctrine bans).
Africa determinism today: matches 27/83 (32%) — model-era values.

### 2 · Evidence coverage — measured

usable evidence: 75/122 (61.5%); eligible-only denominator (admission-
rejected rows are region-locked out of every UI gate): **75/84 = 89.3%**.
Missing reasons, classified per job: overwritten_by_thin_tier 50 (the
failed-run-sealed-regex era) · stale_pre_v1 27 · never_written 1 ·
collection_failed 0 in sample · admission_rejected 38 (none by design —
not part of the coverage promise).
Raise path (write-path only, merge-gated): 751 of the oldest-1,000 completed
queue rows requeue (thin_tier 490 + pre_v1_evidence 261), §17 ingest-plane
ats evidence lands at sight, drain collects page evidence → projected
eligible coverage **100%** (84/84).

### 3 · Pipeline validation — simulated drain (same decisions as the engine)

- Regex/thin rows → requeue thin_tier → become real-model rows on success;
  the §17 seal-guard makes regex re-persistence structurally impossible
  (fixture-pinned): a failed run never upserts, never seals completed.
- Pre-V1 rows → requeue pre_v1_evidence → gain the evidence plane
  (evidence_refs + job_evidence_v1) on their next pass.
- Contradiction classes (new §19) → rows that drifted from the deterministic
  owners requeue and converge in ONE pass (incl. when confidence-protection
  skips the wholesale upsert — canonical-plane sync).
- Projected post-drain over the same 122 jobs: company 84/84 owner-matched,
  0 divergent cohorts · africa 84/84 adjudicator-matched · quote integrity
  188/195 · contradictions 10, unexplained 0.

### 4 · End-to-end per-dimension findings (122 jobs)

- Company: 9/83 rows currently match the owner — mis-ownership era proven
  live at scale (§16/§17 carry the fix; lake awaits drains).
- Africa: 56/83 currently contradict the adjudicator (corpus bases observed:
  us-state-remote, location-lock, no-signal) — all drain-healable.
- Salary: 0 conflicts (jobs row ↔ intelligence) in sample; salary 0–0 junk
  absent from sample.
- Trust: arithmetic 122/122; employer-claim 119/122.
- Quote integrity: 72/163 traceable today; remote quotes are the dominant
  fabrication class (62) from the pre-verbatim-nulling verifier era — all
  drain-requeue healable (post-§15 verifier nulls non-verbatim).
- Remote: no canonical owner assigned (known debt) — divergences reported
  as notes, never counted unexplained.

### 5 · Metrics that prove it (current → projected)

- Evidence coverage: 89.3% eligible → 100% (simulated).
- Company consistency: 4 divergent cohorts → 0.
- Africa consistency: 27/83 → 84/84 stored-vs-adjudicator.
- Trust consistency: 119/122 → heals at ingest rescore.
- Salary consistency: 122/122 (stable).
- Quote integrity: 72/163 → 188/195 (residue explained below).
- Contradictions: 204, 0 unexplained → ≤10 residue classified.

### Proven root causes (new this phase)

1. **Admission-terminal requeue loop (latent)** — contradiction classes
   would have requeued terminally admission-rejected rows forever (requeue →
   reject → requeue). Caught by the simulated drain before any real drain
   ran; guard: `isAdmissionRejected` (status-aware: completed+Rejected is
   terminal; failed+Rejected is provider exhaustion, different semantics).
2. **Channel-vs-name registry breach** — the 3 trust_signal_vs_owner rows
   proved the §17 owner verified registry companies by NAME alone; a Reddit
   posting via himalayas (third-party board) inherited "verified" — an
   impersonation hole and a cross-channel flip cause.
3. **Checker-vs-owner quote churn (latent)** — 7 rows (mongodb
   executive-assistant, stripe deal-strategist/business-value×2/
   head-of-enterprise-sales/staff-full-stack/software-engineer-vuln) whose
   corpus quotes come from short location fields would requeue → re-mint
   the same deterministic corpus quote → fail the checker → requeue ∞.
4. PostgREST URL limits could silently no-op repair passes (engine `.in()`
   calls with up to 1,000 UUIDs) — chunked everywhere.
5. Historical causes reconfirmed at scale: thin-tier sealing, pre-V1 rows,
   pre-owner company writing, pre-verbatim nulling quote fabrication —
   every one routes to a drain requeue class (no orphans in policy).

### Exact write-path fixes (this phase)

- `lib/ai/queue-repair.ts` — three contradiction requeue classes
  (company_vs_owner, africa_vs_adjudicator, untraceable_quote) decided from
  shared pure flags; `isAdmissionRejected` loop-guard.
- `lib/validation/truth-v2.ts` — the measurement module (single judge):
  expected Africa/company, quote traceability (title+description+location
  surface, owner-sentence + corpus-quote + salary-range equivalence), trust
  arithmetic, six honest evidence cases, heal routing, fixture-tested
  `projectRecord` drain projection.
- `lib/ai/engine.ts` — repair pass extends to contradiction classes (same
  flags), canonical-plane sync on the protected path, chunked `.in()`.
- `lib/company/legitimacy.ts` — channel-authenticated registry
  (source `ats:slug` or legacy source_id prefix); name match alone never
  verifies; owner sentence now reads "this job arrived via…".
- `lib/trust/signals/employerLegitimacy.ts` — passes channel identity.
- `app/api/validation/truth-layer-v2/route.ts` — the read-only metrics
  endpoint (+ `?probe=<slug>`); cohorts key on company × channel class.
- Harness 254/254 (suite 15 incl. both loop-guards, channel-auth,
  impersonation, projection idempotence); tsc clean.

### Remaining known issues after the fixes

1. Two commits (channel-auth §19d, quote-churn guard §19e) verified locally
   (254/254, tsc clean) and pending push — GitHub auth dropped mid-session;
   live re-run of the endpoint with these two lands the residue classes:
   projected contradictions → 3 trust rows resolve (owner no longer
   over-claims; one becomes company_vs_owner[drain_requeue] on the
   himalayas row itself) and the 7 short-location quote rows drop out.
2. Stored-lake heal throughput: ≤250 requeues + batch window per drain;
   drains are production-cron-authorized and merge-gated. The old-code
   production deployment keeps writing its own rows into the shared DB
   until merge — every stored contradiction above is classified
   expected-stale-healable; none is architecture-surprising.
3. 5 orphan rows (completed, no JAI) inside the first 1,000-scan window —
   orphan-heal owns them; window advances monotonically.
4. Remote plane has no canonical owner (feed metadata vs JAI verdict
   divergences are notes, not contradictions) — needs an owner assignment
   decision before any write-path sync (not implemented by design).
5. jobs-row ingest eligibility/remote/salary fields remain ingest-plane
   values between ingest sights (heals each sight); render/list gates read
   the canonical planes — reconciled by design, not silently.
6. Corpus-scope judgment debt from §18 ("physical presence" outreach →
   likely) and duplicate detection beyond slugs remain documented debt.

## 19r · Post-push revalidation (2026-08-06, deployment FpJaraC6)

Recovery incident first (honest record): the sandbox workspace was re-cloned
mid-session and the three local-only commit objects (0d488e0/5f67221/926a2e1)
were lost with the local object DB. Disk content survived intact; every file
was verified byte-for-byte against pushed 9e14c08 before the commits were
recreated as 2ef9b1e (§19d write-path fixes) and 315aab4 (§19 doc). No
content altered. Pushed fast-forward 9e14c08 → 315aab4. Environment checks:
auth = arena-ai-coding-agent[bot], rate limit 4997/5000; IPv6 absent
(link-local only, curl -6 dead); GitHub api 200 over 140.82.116.5 (IPv4);
Vercel preview A-records IPv4-only, TLS blocked at sandbox proxy by design
(platform fetch tool used instead — verified, not assumed).

Fresh-run deltas vs the previous deployment (6kAVmgzf) — real changes only:

- Channel-aware owner is live: the Reddit cohort splits honestly into
  official-ATS ×17 (owner verified) + other-channel ×3 (owner likely_legit —
  himalayas/open-board rows). company_vs_owner 74 → 73; matchesOwner 9 → 10.
- Projected quote integrity: 188/195 with 7 africa failures → **195/195, 0
  failed** — the short-location self-churn class is eliminated in projection.
- Projected contradictions: 10 → **4**, all one classified residue kind:
  trust_signal_vs_owner[ingest_rescore] — persisted trust snapshot rows whose
  employer claim predates the channel-aware signal; every one named with
  channel + direction:
  · senior-staff-data-scientist-consumer-relevance-reddit-united-states
    (himalayas, admission-rejected, persisted claims +15 verified, owner
    likely_legit) — an OVER-claim the old name-matching signal wrote; the
    exact impersonation class §19d closed. Row is region-locked out of UI.
  · senior-technical-product-manager-ads-ml-platform-reddit-united-states
    (himalayas, admission-rejected, same class).
  · staff-sre-ads-reddit-07aeab (greenhouse:reddit via source_id, persisted
    claims new-employer, owner verified) — under-claim, rescore at sight.
  · head-of-backstage-marketing-spotify-66efd7 (lever:spotify, same).
  All four heal inside the EXISTING canonical owners (ingest-plane trust
  rescore writes calculateTrustScore with the channel-aware signal; no new
  owner, no render logic).
- Africa/adjudicator determinism: unchanged (27/83 → 84/84 projected) — the
  deterministic judge was unaffected by the company-plane change.
- Simulated drain: unchanged (thin 490 + pre-V1 261 of the first-1,000
  window; window advances per authorized drain).
- Rendering plane re-audit (same deployment): /jobs cards show the stored
  flips honestly (verified 4 / unknown 9 cards; evidence badges only where
  quotes are traceable — no masking added); the messaging-reddit detail page
  shows africa unknown + company verified + salary $190,800—$267,100 +
  Moderate-51 cap note — all matching stored canonical planes 1:1.

NEW live finding (remaining known issue, evidence-backed):
7. **Learning-plane cross-company contamination (Meta-on-Reddit).** The
   Reddit company card renders a stored verification-sources JSON blob about
   META ("NYSE: META … Mark Zuckerberg … #R123456789") on a REDDIT row —
   model-era fabrication that entered the company_intelligence plane.
   Canonical owner: the learning-plane writer that produces
   company_intelligence (not render — render shows the stored plane
   honestly). Next engineering task (below) owns it.

### Exact next engineering task
**§20 — learning-plane provenance gate + full-lake census.** (a) Locate the
writer(s) of company_intelligence verification-sources; add a write-time
gate: a source blob is stored only when traceable to fetched page evidence
for THAT company, else null (fabricated cross-company blobs die at the
write path; per-company recompute heals Reddit's row on the next pass).
(b) Add `?census=1` paged mode to the validation endpoint (1,000-row pages
over all ~4.8k active jobs) so the contradiction census covers the full
lake before merge, not only the 122-job sample. Both are preview-safe.
