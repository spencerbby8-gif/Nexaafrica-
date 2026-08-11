# NEXA — Production Truth Report

**Date:** 2026-08-05 · **Auditor:** Arena Agent Mode · **Method:** live re-verification (no prior audit reports trusted)
**Production host:** `https://v0-nexaafrica.vercel.app` · **Repo:** `spencerbby8-gif/Nexaafrica-`
**Rules followed:** read-only verification. Zero writes to Supabase, zero Vercel changes, zero deploys, zero code changes.

---

## 0. How this audit was verified (trust boundaries)

| Plane | Method | Status |
|---|---|---|
| Live web (home, jobs, role pages, hubs, search, sitemap, robots, guides, sign-in, OG, 404s) | Fresh render fetches, 2026-08-05 | ✅ Fully verified |
| GitHub (default branch, tip commit, push times, 41-branch divergence inventory) | `gh api` live calls, 2026-08-05 | ✅ Fully verified |
| Repository ↔ production drift | Deploy/build timestamp correlation + behavior probes | ✅ Verified: **zero drift** |
| Supabase internals (queue table, RLS, migrations applied, evidence store, traces, learning tables) | **Blocked** — sandbox egress terminates postgres TLS to the pooler after TCP connect (SNI filter); REST gateway is alive but key-gated and no anon key is recoverable from public surfaces | ⚠️ Not internally verifiable from this environment; verified-by-proxy through public API/admin-gated telemetry posture |
| Vercel plane (deployments, env, logs, build status) | **Blocked** — token is valid but `api.vercel.com` requires `Authorization: Bearer` header, which available fetch tooling cannot send | ⚠️ Verified-by-proxy (deploy freshness, crons firing) |

The provided credentials are **not wrong**; the audit environment structurally cannot reach those planes. Public-surface proxies confirm both planes are up and correctly gated (`/api/ingest/status` → `401 {"error":"Unauthorized"}`, `/api/ai/health` → `401`; Supabase REST → `No API key found in request`). Unlock path in §7.

---

## 1. Production topology — verified facts

- **GitHub production state:** default branch `arena/019f4801-freeborn` @ `3d2dc90` (*"feat(v1): evidence intelligence — evidence store, browser worker, dynamic trust"*, squashed, committed 2026-08-04T08:25:55Z, pushed 08:28:25Z). `pushedAt` unchanged since first check — no deploy activity during the audit.
- **Deployed build == repo tip == this audit's base commit.** Sitemap static-page `lastmod` = `2026-08-04T08:29:05.798Z` ⇒ production built ~40 s after push. **No repo↔prod code drift.**
- **Branch inventory (live `gh api compare`, all 41 non-default branches):** `feat/evidence-intelligence-v1` is *identical* to default; 34 branches are fully merged (behind-only); **6 diverged** — `fix/jobs-verified-first-ordering` (+1, 2026-07-31), `fix/trust-labels-and-ordering` (+1, 2026-07-31, same timestamp — likely siblings), `fix/smart-router-v2` (+1, 2026-07-29), `revert-4-fix/production-cron-auth-unblock` (+1), `revert-5-fix/ingest-placeholder-company-guard` (+1), `arena/019f4cd6-nexaafrica` (+2/−204, stale June line). **No significant unmerged production fixes exist in branches**; ~3 small unique commits need an adjudicate-or-delete decision.
- **Crons are live and firing:** `vercel.json` Hobby-limit 2 crons (ingest tier-1 04:00 UTC, AI drain batch=150 05:00 UTC). Both ran 2026-08-05: jobs ingested 04:21Z render "12h ago" at read time; JAI rows dated 8/5/2026; queue retry states observable in `/api/jobs` (`_queueStatus:"pending"`, `_queueError:"AI providers failed (verifyJobReal-threw). Retry #2 scheduled."`).
- **Scale in prod (homepage counters):** 4,665 active roles · 1,976 Nexa Intelligence rows (**42% coverage**) · 4 in queue · 1,571 rule-based · 667 last-7d. Caveat: `/api/seo-status` hard-caps several counts at exactly 1000 (`roles`, `rolesIndexable`, `rolesLast30d`) → endpoint under-reports; distribution stats across the 4.6k set need SQL.
- **Surfaces verified working:** homepage, `/jobs` (+`?q=`, `?verified=1`, category/type/eligibility filters, cursor pagination `posted_at|id` incl. page-2 fetch), `/companies` + `/companies/[slug]`, `/remote-jobs/nigeria` and country × category hubs, intent pages (`/remote-jobs/search/open-to-africa`, …), `/guides` (7 guides live), `/sitemap.xml` (12 chunks), `/robots.txt` (correct allow/disallow + Host + Sitemap), branded 404s (`/role/bogus`, `/p/bogus`), `/sign-in` (Google + magic link).

---

## 2. What is genuinely working (verified credit)

1. **The full pipeline runs in production, today:** ingest → normalize/validate → deterministic extraction → 12-signal trust engine → upsert (`source,source_id`) → queue → atomic AI drain (backoff `next_retry_at`, 12-failure circuit breaker, stuck recovery, concurrency 3, self-chaining) → evidence collect → consolidated verifier → `job_ai_intelligence` → UI with verbatim evidence and per-signal confidence.
2. **Dynamic model discovery is actually live:** a 2026-08-05 JAI row carries `model_version: "mistral:mistral-medium-2508"` — a model string that does **not** exist in the static provider config → hourly catalog sync (`syncLiveModelRegistry`) + dynamic registry are functioning.
3. **Queue truth is honestly surfaced:** pending/retry/error states reach the public API verbatim; failed jobs visibly stay failed with reasons.
4. **Auth posture is correct where it must be:** all internal telemetry endpoints 401 without secrets; robots.txt is sane; bogus routes 404 cleanly; `/p/[token]` share pages 404 on unknown tokens.
5. **Second-plane quality metadata exists:** JAI rows contain `quality_breakdown` (8 dimensions), `evidence_refs`, `page_status`, crawler states — the right bones for a real intelligence system.

---

## 3. End-to-end traces (3 real jobs, fresh today)

### Trace A — `talent-operations-manager-micro1-worldwide` (Himalayas → DB → UI)
- **Ingest:** posted_at == created_at to the millisecond (2026-08-05T04:21:24) → adapter fabricates freshness (Himalayas provides no real posting date).
- **AI:** JAI present (confidence 63%), crawler blocked state visible, quality sub-50.
- **Failures surfaced:** skills rendered as **raw JSON objects** (`{"skill":"large-cohort onboarding at scale","evidence":"…"}` ×4); **two contradictory salaries on one page** — job-level `USD70k–110k` badge vs AI-verified panel "Salary disclosed: USD 50000–70000 • 100%" quoting the posting ($50–70k is correct); timeline says "12h ago ago".

### Trace B — `finance-operations-audit-leader-openai-worldwide` (Ashby → DB → UI)
- **Posting says:** San Francisco, *hybrid*, 3 days/week in office.
- **Nexa says:** TrustCard "Likely open", JAI "**Explicitly open to Africa • 75%**" — evidence quote: *"…identifying anomalies, control weaknesses…"* → the substring **`mali` inside "anomalies"** matched an unanchored country regex. Fabricated eligibility with fabricated verbatim evidence, highest confidence tier.
- **Also:** "Required skills: Finance, Finance" (duplicate category tokens), JAI "Company legitimacy unknown • 0%" beside trust card "Verified employer — OpenAI is in Nexa's curated list".

### Trace C — `electrical-commissioning-lead-openai-worldwide` (Ashby → DB → UI)
- **Posting says:** hyperscale datacenter commissioning, "travel frequently to global project sites" — an inherently on-site role.
- **Nexa says (JAI, verified 8/5/2026, 28% conf):** "**Fully remote (from feed)**" with evidence quote "Marked as remote in source feed" — the verifier *confirmed the feed boolean* instead of reading the text. Trust card simultaneously asserts "Listing legitimacy **100**" (signals: curated employer, "Ashby = high trust source", "407 roles") while JAI shows "Company legitimacy unknown • 0%". Unified score 59 with disclosed cap reason.
- **Also:** source citation is the Ashby **`/application`** URL + a bare `https://jobs.ashbyhq.com/` "Source 2"; slug ends `-worldwide`; role appears in the "Open at OpenAI" company hub; "Fieldother", "12h ago ago" ×3.

---

## 4. Confirmed failures, ranked by impact

### P0 — Fabricated truth shown to users at scale (brand-killing)

**P0-1 · False "explicitly open to Africa" via unanchored country substrings.**
`AFRICA_RE` in `lib/ai/verifiers/consolidated.ts` has **no word boundaries** (`mali|niger|togo|benin|chad|guinea`…). `anomalie`**`s`**, `normali`**`ze`** both contain `mali`. The truth-guard consumes the same regex, so the guard *propagates* the lie at confidence 75 with a "verbatim" evidence quote. Any posting containing those English words can be classified Africa-explicit. **Same class of bug likely in the deterministic tier:** the SF datacenter role from Trace C passed the ingest-time `explicit|likely` gate (`is_open_to_africa=true`, `lib/ingest/normalize.ts:349` + adapter eligibility from location+remote-flag).

**P0-2 · Company pages fabricate "100% open to Africa" by construction.**
Live: "MongoDB **237 open roles · 237 open to Africa**", "Stripe 214 · 214", "Pinterest 102 · 102", "OpenAI 71 · 71", "GitLab 48 · 48" — equality is **structural**: `getCompanies` pre-filters `jobs.eq('is_open_to_africa', true)` (`lib/companies.ts:53`), then renders both `jobCount` ("open roles") and `africaFriendlyCount` over the *same pre-filtered rows*. Two labels implying different measurements of one identical set. On a platform whose product is truth, every company card is guaranteed to print a false implied statistic ("all of this company's roles are open to Africa").

**P0-3 · Salary data plane is incoherent.**
Same page, two different salaries (Trace A). Root cause chain: ingest salary extraction produced `USD70k–110k` for a posting that says $50–70k; the AI correctly verified $50–70k; the AI→`jobs` sync migration (`20260726160000_sync_ai_salary_to_jobs`) only writes when `jobs.salary_min IS NULL` → **the wrong ingest value is protected from correction forever**, and the UI badge shows the wrong number. Companions: "Business Intelligence Consultant" card renders "**Salary disclosed: USD 0 – 0 • 100%**"; hourly gigs ($13–36/hr) render as "USD0.013k – USD0.036k" (hourly→annual-k collapse); one JAI row's own summary line copies the mangled display string ("Salary disclosed: USD0.05k – USD0.12k") → the verifier is ingesting the broken presentation layer as ground truth and re-confirming it.

**P0-4 · Affirmative claims on unverified jobs ("likely" shown as fact-shaped chips).**
Queued/rule-based cards across `/jobs`, company hubs, country hubs — and the flagship intent page `/remote-jobs/search/open-to-africa` titled *"Remote jobs open to applicants in Africa"* — affirm "Fully remote · Likely open to Africa" for: a "Pakistan TECH Recruiter" Power BI role (Asia timezone office hours), a Cyprus crypto CTO whose queue state is *currently broken*, a Romania-restricted consultancy (see P1-3), a Hungary and an Armenia agency role, and every OpenAI SF/hybrid/on-site listing. "Unknown" is rendered as an affirmative green-chip guess, not as "unverified". The single highest-stakes SEO page is ~90% guesses today.

**P0-5 · Feed `is_remote` boolean outranks posting text.**
Trace C: a field-commissioning role "verified" as "Fully remote (from feed) • 40%" — the verifier's evidence is the feed flag itself. The hybrid SF audit role (3 days/wk office) likewise stays listed with `is_remote:true`. Text-level remote/onsite semantics never override vendor metadata, and the admission gate only rejects the explicit `is_remote===false` case.

### P1 — The engine measures and stores the wrong things (intelligence integrity)

**P1-1 · Persisted artifact corruption rendered raw.**
Skills stored as `{skill, evidence, confidence}` objects and serialised to users (multiple companies; second instance: Reddit "Senior Software Engineer – Messaging" incl. markdown escape garbage `\*5+ years…\*` inside stored evidence). Root cause: `triggerSecondOpinionIfNeeded` persist path in `lib/ai/engine.ts` lacks the `asStringArray` normalisation the main upsert has. Separately, stored evidence excerpts are **mid-word mangled at write time** ("ues to ensure smooth opera…", "app) Worldwide", "app/companies/micro1) provides…" — fixed-offset slicing, no word-boundary alignment) and presented as verbatim quotes.

**P1-2 · Trust score is degenerate (three plateaus dressed as 0–100).**
Every JAI'd role with unverified Africa eligibility displays exactly **Trust 59** (code: `lib/trust/engine.ts:154` `africa ∈ {unknown,restricted} → min(score,59)`; live: ~30/30 sampled cards = 59). Queued roles = **Low 32** (legitimacy×0.4 attractor, `engine.ts:116`). Explicit-Africa = 75. Within a plateau the "score" has **zero variance** — it cannot rank anything. Signal rot beneath it: `employerLegitimacy` grants +8 for merely having a logo; `applicationMethod` copy tells users "Apply link is on company domain himalayas.app — direct application" (a job board asserted to be the company's own domain); and legitimacy-100-vs-0 cross-plane contradictions (Trace B/C) show the two scoring planes are never reconciled.

**P1-3 · Region-restriction corpora have country-sized holes; marketing copy passes as eligibility evidence.**
Romania (and Bulgaria, and other EU states) absent from `RESTRICT_RE`/`LOCATION_RESTRICTED_RE` → "Job Location: Remote (Anywhere Romania)", "EET Timeframe", Romanian-language requirement classified **worldwide**, slugged `…-worldwide`, listed on the Nigeria hub and the open-to-Africa intent page as "Likely open". Decision Inc roles earn `africa_eligibility:"likely" (55%)` because `GLOBAL_OUTREACH_RE` matches the company's own marketing boilerplate ("global digital partner that enables businesses worldwide") — `stripRegionBoilerplate` does not cover this phrasing.

**P1-4 · Operations are flying blind.**
`app/admin/observability/page.tsx:23-26` destructures **13 names from a 15-query `Promise.all`** — every panel from position 2 is shifted: `providerAnalytics` receives the queue *completed-count*, `orchHealth` receives the analytics rows, `jaiRes` receives `ai_orch_health`, … and `queue.completed` literally renders the pending count. Additionally `lib/ai/gateway.ts:214` calls `logAudit({action:"allow"})` → insert into `trust_audit_log` whose CHECK (`20260723120000_trust_engine.sql:61`) permits only `flagged|unflagged|score_updated|report_reviewed|auto_flagged` → **every gateway audit row is rejected by the database, silently** (`as any` cast at `logger.ts:35` hides it at compile time). The audit-trail table is empty by construction. `/api/og` 500s in production for a valid documented request (`?kind=default&title=…`; edge ImageResponse route) → broken social cards sit unseen because nobody can see anything.

**P1-5 · `/admin/*` has authentication but no authorization.**
Admin pages gate on *any* signed-in session (Supabase auth middleware), then query via service role — any registered user can read internal pipeline/aggregates. (Code-verified; admin pages not probed live — audit had no account, deliberately.)

### P2 — Product/data quality debt

- **P2-1** Relative-time rendering: "12h ago ago", "6d ago ago", "1d ago ago" (Timeline double-suffixes).
- **P2-2** Freshness illusion: Himalayas sets `posted_at` = ingest timestamp; every card says "12h ago", freshness signal grants +12 "Fresh • 0 days", and `getProofStats`/seo freshness counts inherit the fiction.
- **P2-3** Junk skills layer: "Finance, Finance", "Research, Research", "Datacenter Design, Scaling" — deterministic extraction emits duplicated category tokens as skills; rendered even when `skills_coverage=0`.
- **P2-4** Ingest encoding/content defects: mojibake companies in DB ("Citywire EspaÃ±a" → slug `citywire-espa-a`, "Casa TrÃ¨s Events", "Infiterra" fine but "Casa Très" double-decoded) — UTF-8 double-decode; a MindPlus description truncated mid-sentence ("Interested candidates may send their CV to " — email stripped).
- **P2-5** Sitemap lies: every lastmod = deploy build time (or 2026-05-28 hardcoded for intents), not content change; `seo-status` 1000-caps; role slugs `-worldwide` assigned to on-site/region-locked roles (index concern given rolesIndexable volume).

### P3 — Engineering hygiene (context for the build plan)

- 40 stale branches (6 diverged; `fix/jobs-verified-first-ordering`, `fix/trust-labels-and-ordering`, `fix/smart-router-v2` hold unique small commits → adjudicate then delete all).
- Duplicate migration versions (`20260727000000_*` ×2, `20260728000000_*` ×2) → clean-replay impossible; migration provenance unauditable without DB access.
- `npm run lint` non-functional (no eslint config/deps) — CI has no static-analysis gate; `tsc --noEmit` passes.
- Serverless anti-patterns: in-memory rate limiter + module-level `setInterval` in `lib/rate-limit.ts`.
- Dead/parasite subsystems: `lib/intelligence/` collectors writing to nonexistent `jobs.updated_at`; 18 superseded `real*AI.ts` verifiers; `lib/ai/council` simulating models with `Math.random()`; `policy/`, `actions/`, `observers/`, `providerProfiles`, `model-verification` orphans — confusion and reviewer-drag risk.

---

## 5. Blockers → why Nexa Intelligence is not yet "a real intelligence system", by impact

| # | Blocker | Impact |
|---|---|---|
| 1 | **Eligibility facts are fabricated, then quoted as evidence** (P0-1, P1-3, P0-4) | Core promise ("verified open to Africa") is violated on the most-visible surfaces; false positives are stored, quoted, SEO-indexed, and fed back as ground truth. Compounding. |
| 2 | **Fact planes disagree with no authority model** (P0-2, P0-3, legitimacy 100-vs-0) | Users see two contradictory numbers for the same fact on the same page; nothing designates which plane owns a fact, so drift is permanent. |
| 3 | **Persisted artifacts are corrupted at write and rendered raw** (P0-4 partial, P1-1) | Even correct AI verdicts reach users as JSON blobs / mangled "quotes" — reads as broken, not intelligent. |
| 4 | **Trust has no discriminating power** (P1-2) | Ranking, badges, caps all key off a 3-state ordinal masquerading as a score; legitimacy is inflated by logos and curated lists. |
| 5 | **Operations are blind** (P1-4, P3-lint) | The dashboard lies, the audit table cannot accept rows, OG 500s unnoticed. Failures 1–4 persisted for days undetected *because of this*. |
| 6 | **Freshness and marketing surfaces overstate reality** (P2-1, P2-2, P2-5) | "12h ago" everywhere, build-time lastmod, 1000-cap stats — erodes crawler and user trust quietly. |

---

## 6. Recommended next build (single highest impact)

### **Truth Layer v1 — eligibility & fact-integrity pass** *(one build, no new providers, no new surfaces)*

**Scope:**
1. **One shared geo/eligibility corpus** (`lib/geo-eligibility.ts`) consumed by deterministic tier, AI ground-truth regexes, and the truth-guard (kill the triplicated regexes): word-boundary country matching with an explicit collision blacklist (`mali`, `togo`, `chad`, `niger`, `benin`, `guinea`, `georgia`, `turkey`…), complete UN+EU restriction corpora (add Romania, Bulgaria, and the full EU set), and a marketing/EEO/benefits **exclusion zone** so "businesses worldwide" / "global partner" phrasing can never generate eligibility evidence.
2. **Fact-authority model:** per-field precedence — AI-corrected salary **overwrites** ingest values when disclosed (drop the `IS NULL` guard for conflict cases, log corrections); `is_remote` requires text-level confirmation, feed flags demoted to hints; `unknown` eligibility renders as "Unverified" everywhere (no affirmative chips on queued/rule-based cards); company hubs stop printing "N open roles" over Africa-filtered slices (show true totals or relabel).
3. **Persistence contract at the upsert boundary:** single normalisation point for skills (`asStringArray` applied on *all* persist paths incl. second-opinion), unit-aware salary (hourly vs annual, currency, no k-collapse, 0–0 never "disclosed"), word-aligned excerpt slicing, markdown unescaping before storage.
4. **Backfill re-verification:** requeue all JAI rows whose Africa evidence matches the new false-positive detectors + all salary-conflict rows; one controlled drain (existing self-chaining machinery) with force-refresh.
5. **Same-PR hygiene** (files already touched by this build): observability destructure fix, audit-action mapping to the CHECK vocabulary, "ago ago" template, OG route error surfacing.
6. **Regression harness:** the nine live failures below become permanent fixtures; CI diffs verifier output pre/post.

**Acceptance fixtures (all live-verified today):**
`finance-operations-audit-leader-openai-worldwide` (mali-FP + hybrid), `electrical-commissioning-lead-openai-worldwide` (feed-flag remote vs on-site text; legitimacy 100-vs-0), `talent-operations-manager-micro1-worldwide` (skills JSON; salary 70–110 vs 50–70), `business-intelligence-consultant-excel-micro1-worldwide` (USD 0–0), `junior-electronic-engineer-qucs-s-micro1-worldwide` (k-collapse + verifier echo), `gcp-senior-consultant-tech-lead-…-oben-technology-worldwide` (Romania), `microsoft-dynamics-supply-chain-support-consultant-decision-inc-…` (marketing-driven likely), `companies/openai` + `companies/mongodb` (N/N cards, on-site roles in hub), `staff-product-manager-ai-100-remote-emea-hostaway-africa` (**positive control** — genuinely explicit, must stay explicit).

**Why this and not telemetry/admin-authz first:** blockers #5/#6 are internal-facing; blockers #1–#4 are *users being shown false statements, right now, on every surface* — including the pages Google indexes. This build removes fabrication at the root rather than patching 16 symptoms one by one, and it makes every subsequent intelligence build measurable. Telemetry unlock (#5) is folded in as the same-PR hygiene + the §7 handoff.

---

## 7. To complete the internal-plane verification (need from owner)

One of: (a) `CRON_SECRET` / `INGEST_TOKEN` values (unlocks `/api/ingest/status`, `/api/ai/health`, `/api/ai/analytics`, `/api/providers/status`, `/api/ai/registry` via authorized probes), **or** (b) the Supabase anon key + RLS-safe read session, **or** (c) screenshots/exports of: migration history, `ai_processing_queue` status histogram, `ai_provider_log` (24 h), `ai_orch_health`, `job_evidence_v1` row counts/`page_status` distribution, `job_ai_intelligence` distribution by `model_version`/`africa_eligibility`/salary-disclosed, `company_intelligence`/`source_intelligence` aggregates. Vercel: deployments list + latest build log + env-var *names* (not values). All read-only.

*Every claim above was re-derived from a live artifact or current code on 2026-08-05; prior audit documents were not consulted as evidence.*
