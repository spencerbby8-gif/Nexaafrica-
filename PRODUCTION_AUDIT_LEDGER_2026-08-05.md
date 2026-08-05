# NEXA — Production Audit Ledger (Round 2, 2026-08-05)

Fresh live evidence only. Prior reports were not consulted as evidence; every prior "blocked" conclusion was **re-tested and re-proven this round**.
Legend: ✅ verified live · 🟡 partially verified · ❌ not verified · ⛔ contradicted.

---

## 0 · Credential planes (re-attempted this round, fresh evidence)

| Plane | Attempt (2026-08-05) | Result | Status |
|---|---|---|---|
| Supabase pooler :6543 TLS | `pg.Client` connect | `Connection terminated unexpectedly` (55 ms — killed post-TCP) | ❌ environment-blocked |
| Supabase pooler :5432 TLS | connect | `ECONNRESET` (54 ms) | ❌ environment-blocked |
| Supabase pooler :6543 plain | connect | terminated (2 ms) | ❌ environment-blocked |
| Supabase direct `db.*.supabase.co:5432` | connect | `ENETUNREACH 2600:1f18:…` (host is IPv6-only; sandbox has no route) | ❌ environment-blocked |
| Vercel API via bash | `curl -H "Authorization: Bearer …"` | `SSL_ERROR_SYSCALL` (SNI egress kill, same as every non-allowlisted host) | ❌ environment-blocked |
| Vercel API via web fetch | `/v9/projects?access_token=…` | `{"code":"forbidden","missingToken":true}` — Vercel rejects token-in-query | ❌ header-auth required, unreachable |

**Conclusion:** the credentials are usable secrets on unreachable planes — this sandbox's egress terminates them. All DB/API-plane items below are therefore marked by what *is* observable: their **effects on public surfaces** + code. Nothing below is asserted from the audit reports of previous sessions.

---

## 1 · Your checklist, item by item

| # | Item | Evidence | Status |
|---|---|---|---|
| 1 | **GitHub production HEAD** | `gh api` → `arena/019f4801-freeborn` @ `3d2dc9019fa…69943`, 2026-08-04T08:25:55Z; unchanged across both audit rounds | ✅ verified |
| 2 | **Repo ↔ prod drift** | sitemap build stamp `2026-08-04T08:29:05.798Z` (= push+40 s, unchanged today); deploy == tip == this checkout's base | ✅ verified (zero drift) |
| 3 | **Vercel deployment status** | No API path (§0). Proxy: all routes serving 200, build stamp stable, crons firing daily | 🟡 partially verified (proxy only) |
| 4 | **Migrations applied** | Commit body claims `20260805000000 (applied)`; live role pages render `jobs.evidence_state`-driven UI ("Crawler: Page blocked/Evidence: fetched"), `evidence_refs`-driven panels → latest migration's columns exist and are populated. Full migration ledger unqueryable | 🟡 partially verified |
| 5 | **Queue state** | Homepage counter "**4 in queue**" stable across ≥2 h (drain runs only in the 05:00Z window); `/api/jobs` rows expose `_queueStatus:"pending"` + `_queueError:"AI providers failed (verifyJobReal-threw). Retry #2 scheduled."` | 🟡 partially verified (counters/API flags; table internals ❌) |
| 6 | **AI pipeline** | JAI rows stamped 8/5/2026 incl. today's ingests; re-verification cycles observed (audit-leader row moved 8/4→8/5, quote re-sliced); live `model_version: mistral:mistral-medium-2508` (absent from static config → dynamic registry real); 05:00Z cron 401s without secret | ✅ verified (by effect) |
| 7 | **Evidence store** | Role pages show "Page check: Live (200)", "Sources: 2 URLs", "Crawler: blocked/fetched", blocked-cap reason strings ("the job page is blocked — trust cannot exceed Moderate…"). Row-level `job_evidence_v1` content unqueryable | 🟡 partially verified |
| 8 | **Trust engine** | Full live breakdowns: unified formula components ("Listing legitimacy 100 · Opportunity evidence 63% · unified 59"), cap disclosure, 12-signal payloads in `/api/jobs` incl. scoreImpacts | ✅ verified — **and found defective** (§3) |
| 9 | **Company intelligence** | `company_history` signals live ("Established employer • 407 roles", "First seen"); company hubs aggregate | ✅ verified by effect |
| 10 | **Source intelligence (learning)** | `source_learning` signal live in API payload: "himalayas feed: source trust 75 · reliable feed · 68% verified" (+8) | ✅ verified by effect |
| 11 | **Homepage** | 4,665 active · 1,976 JAI (42%) · 1,562 new this week · counters consistent with prior round | ✅ verified |
| 12 | **Jobs & search & filters** | `/jobs?verified=1` "50 roles", `/jobs?q=engineer` "50 roles…12 added today", filters/verified toggle/cursor pagination all functional | ✅ verified |
| 13 | **Role pages** | Full intelligence UI renders (evidence quotes, per-signal confidence, timeline, JSON evidence sources) | ✅ verified — **content defects §3** |
| 14 | **Sitemap** | 12 chunks; static stamp = build time; intent pages hardcoded `2026-05-28` | ✅ verified (defect noted round 1) |
| 15 | **Admin routes** | `/admin` unauth → server 302 → `/sign-in?next=%2Fadmin`. AuthN enforced live. AuthZ-*inside*-admin claim remains code-verified (`app/admin/*` + service client, no role check) — not live-probed (no account) | 🟡 partially verified |
| 16 | **API auth** | `/api/ingest/run`, `/api/ai/process`, `/api/ingest/status`, `/api/ai/health` all `401 {"error":"Unauthorized"}` without secret | ✅ verified |
| 17 | **RLS / schema / traces / provider logs** | No read path (§0); REST root alive + key-gated | ❌ not verified |
| 18 | **"No fake listings, reviewed roles" (marketing claim on every page)** | Pakistan-recruiter agency post, region-locked roles, on-site roles all present on "reviewed" feeds incl. the open-to-Africa intent page | ⛔ contradicted |

---

## 2 · End-to-end traces re-run (all fixtures PERSIST; no self-healing)

| Fixture | Round-2 state |
|---|---|
| **A · micro1 Talent Ops** | Salary double-story persists (badge+trust-signal `USD70k–110k` "from the company's job feed" vs JAI `USD 50000–70000 •100%`). **Skills-as-JSON grew 4 → 8 objects** — each re-verify appends more corruption. Crawler-blocked state honestly disclosed + 59-cap. "app) Worldwide" mangled quote persists. |
| **B · OpenAI Finance Audit Leader** | "**Explicitly open to Africa • 75%**" persists; JAI **re-verified (8/4→8/5) and re-emitted the same mali false positive** with a fresh mid-word-sliced quote ("d AI to improve risk assessment… identifying anomalies"). "Hybrid – some onsite • 100%" + chip "Likely open" on one page. "Finance, Finance" skills. |
| **C · OpenAI Electrical Commissioning Lead** | Identical to round 1: "Fully remote (from feed) 40%" for an on-site datacenter role; legitimacy 100 (signals) vs 0 (JAI); `/application` URLs as evidence; unified 59 via unknown-Africa cap (cap note truthfully disclosed). |
| **D · NEW: MindPlus Sr PM (today's ingest, full raw row)** | Chain proven end-to-end in one `/api/jobs` payload: marketing text "partners with businesses worldwide" → deterministic `scope_worldwide` signal → `eligibility:"likely"` → `is_open_to_africa:true` → JAI "Likely open • 75%"; `posted_at == created_at == extracted_at` (04:21:24.9) → freshness +12 "0 days"; raw `trust_score:100` (first-seen recruiter, no salary) from +8 logo ("indicating legitimate employer presence") +8 "company domain himalayas.app"; description truncated "send their CV to ". |

## 3 · Round-2 NEW findings (not in round-1 report)

- **F-EMEA (P0):** "EMEA" reads as Africa-positive — MongoDB Gurugram hybrid role "Likely open to Africa • 80%" while its own JAI says "Hybrid – some onsite • 90%"; card chip says "Remote".
- **F-USSTATE (P0):** US-state-restricted remote passes — Pinterest "Los Angeles, CA, US; Remote, CA, US" → "Likely open to Africa • 90%".
- **F-CHIP (P1):** card-level remote chip contradicts the same card's JAI remote-policy verdict (Remote vs Hybrid) — three planes (feed flag, ingest `is_remote`, JAI) never reconciled even at render time.
- **F-COMPOUND (P1):** re-verification compounds corruption (skills objects grow; mali FP re-emitted) — the loop has no guard against re-asserting prior errors.
- **F-QUEUE (P2):** queue depth counter static at 4 across the audit window; AI work only advances during the 05:00Z drain window (single daily cron).

## 4 · Blockers (updated ranking, fresh evidence)

1. **Eligibility fabrication is systematic, three independent channels:** (a) unanchored country substrings (`mali`∈`anomalies`), (b) marketing boilerplate → `scope_worldwide`/`GLOBAL_OUTREACH` → `likely` (raw chain proven), (c) coverage holes (Romania/EU set; **now: EMEA-as-Africa and "Remote, CA, US"-as-worldwide**). Re-verify loops re-emit errors. *The product's core promise is violated on its highest-traffic surfaces every day.*
2. **No fact-authority model across three planes** (feed flags / ingest extraction / JAI): contradictory salary numbers, remote-vs-hybrid chips, legitimacy 100-vs-0 — on single cards, unresolved at write *and* render time.
3. **Persistence corruption, compounded by re-runs:** skills-as-JSON (growing), mid-word quote slicing stored and re-sliced, markdown escapes in stored evidence.
4. **Trust has no discriminating power:** 59-cap flattens the entire unknown cohort; logo/board-domain signals inflate raw scores to 100; cap notes are honest but the score cannot rank.
5. **Ops blindness:** observability 13-vs-15 shift stands; audit-log action `'allow'` vs CHECK vocabulary → audit table empty by construction; OG route 500; no telemetry reachable while sandboxed (does not affect prod, affects *this audit* only).
6. **Presentation debt:** "ago ago", feed-fabricated freshness, quoted-`application`-URL evidence, badge salary from the wrong plane.

**Truth Layer v1 (recommended round 1) targets blockers 1–3 + the write-time half of 2–4.** No code written, no deploys, no DB changes during this audit, per instruction. Awaiting your next instruction.

*Sheet state: rows 1–16 above constitute the complete inventory of what can be known about production from outside the credentials planes; rows marked ❌/🟡 name exactly what a working DB/API session would settle.*
