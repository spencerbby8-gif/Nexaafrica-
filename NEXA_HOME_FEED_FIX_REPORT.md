# Home Feed Bug Fix + Opportunity Intelligence — Production Report

**Date:** 2026-07-24 (America/New_York)
**Branch:** arena/019f4801-freeborn
**Commit:** 1c7b551 + a403b1b
**Prod URL:** https://v0-nexaafrica.vercel.app

## 1. Audit: query → join → mapping → card → UI for “Matching your experience”

### Before (buggy)
- **Query:** `lib/profile/match.ts:getMatchedJobs` => `select id, slug, title, company, company_logo, description_md, apply_url, category, location, country, salary_range, employment_type, tags, is_remote, is_open_to_africa, eligibility, posted_at…` from `jobs` only. No AI join. `is_active=true order posted_at desc limit 200` then deterministic scoring.
- **Join:** None. `job_ai_intelligence` table existed but RLS blocked anon read + no code attempted join. Home cards only had trust/remote/salary/likely open.
- **Mapping:** `scoreJob` pure function + reason.slice(0,2). No AI fields.
- **Card component:** `components/job-card.tsx` used `getJobCardExcerpt` which called `cleanDescription` but old `cleanDescription` only partially stripped HTML, did not strip markdown like `**`, `##`, `[label](url)`. Ingredients of bug:
  - `htmlToMarkdown` earlier used regex `/<[^>]+>/g` then decoded `&lt;` to `<`, leaving `<div class="content-intro">` in DB.
  - Even after fix in `normalize.ts` (he decode FIRST then node-html-parser), old rows still had 710 raw HTML rows, backfilled to 0 via Python html.parser. But excerpt path still leaked markdown and occasional double-encoded `&lt;div>` if parser failed.
  - `generateExcerpt` kept markdown tokens.
- **Rendered UI:** `personalized-feed.tsx` mapped `matched` → `<JobCard job={job} matchReasons={reasons} />`. No AI. Excerpt could show `&lt;div class="content-intro"&gt;` or `**About us**` or `# Responsibilities`.

### After (fixed)
- **cleanDescription.ts** now:
  - Double-decodes entities (`&amp;lt;` → `&lt;` → `<`)
  - `stripHtmlProper` via `node-html-parser` removes script/style, converts block tags to `\n\n`, strips all tags
  - Second pass decode + strip + regex `/<[^>]*>/g` safety net
  - `stripMarkdown()` removes code blocks, inline code, images, links `[label](url)` → label, bold/italic, headings, blockquotes, list markers, horizontal rules
  - `generateExcerpt` uses plain stripped text, 180-250 chars, sentence-boundary aware, no `<`, `&lt;`, `**`
  - `getCleanMarkdownForRender` keeps markdown structure for detail page but no HTML

- **AI Intelligence Join:**
  - New `lib/ai/queries.ts` with `JobAIIntelligenceRow` mirroring `job_ai_intelligence` table (all fields: africa_eligibility/confidence/evidence/source_urls, country_restrictions, visa, timezone, remote_eligibility, required/transferable/missing skills, experience_level, salary_min/max/currency/period/is_estimated/transparency/confidence/evidence, company_legitimacy, job_quality, application_difficulty, hiring_urgency, overall_confidence, evidence_urls, last_verified_at)
  - `getAIIntelligenceForJobs(jobIds)` uses anon client (now public via RLS policy) with fallback to service client, returns `Map<job_id, row>` – production safe, async, no fabrication, UNKNOWN when missing
  - `enrichJobsWithAI` helper keeps raw job untouched, adds `aiIntelligence` field
  - Migration `20260723150000_ai_intelligence_public_read.sql`: `create policy "ai intelligence public read" on job_ai_intelligence for select using (true)` – allows SSR crawlability

- **Query updated:**
  - `lib/queries.ts` adds `getJobsWithAI`, `getJobBySlugWithAI`, `getRelatedJobsWithAI` – all call base query then enrich via `getAIIntelligenceForJobs`
  - `personalized-feed.tsx` now: after `getMatchedJobs`, calls `getAIIntelligenceForJobs(matched.map(m=>m.job.id))` and passes `aiIntelligence` to `JobCard` with `showOpportunityIntelligence=true`
  - `app/page.tsx` uses `getJobsWithAI({limit:6})` for recent feed + `showOpportunityIntelligence=true`
  - `app/role/[slug]/page.tsx` uses `getJobBySlugWithAI` + `getRelatedJobsWithAI`, metadata `firstParagraph` uses `cleanDescription` (no raw HTML in og/title)
  - Jobs hubs (`/jobs`, `/jobs/[category]/[country]`, `/remote-jobs/[country]`, `/remote-jobs/search/[intent]`) now use `getJobsWithAI` + `posted_at` for freshness (refresh engine)

- **Card component:**
  - `JobCard` props now `aiIntelligence?: JobAIIntelligenceRow | null, showOpportunityIntelligence?: boolean`
  - Still shows trust badge, remote, salary, eligibility, employment_type, fresh – but when `showOpportunityIntelligence`, renders `OpportunityIntelligenceSummary`
  - Excerpt now clean via `getJobCardExcerpt` (180-250, no markdown/HTML)
  - No nested `<a>` inside main Link: evidence quotes in card variant render without link (`allowLink=false`)

- **Rendered UI:**
  - Home personalized section now shows intelligence summary: Africa fit + confidence, remote policy + timezone, salary truthfulness + transparency, company legitimacy, experience level + required skills (up to 4), why matches user (matchReasons), overall confidence + verified date, evidence quote clipped
  - Fallback when `!intelligence`: `Intelligence pending — our verifier is checking this role` + why matches user if available – clean, no broken text
  - Job detail page: new `OpportunityIntelligencePanel` full panel (see below)

## 2. Opportunity Intelligence Panel (Home + Detail)

Component: `components/opportunity-intelligence.tsx`

**Card summary (`OpportunityIntelligenceSummary`):**
- Header: Opportunity Intelligence + overall% confidence + verified date
- Africa: explicit/likely/restricted/unknown + confidence badge + tone (positive/caution/neutral)
- Remote: fully_remote/hybrid/onsite + timezone + confidence
- Salary: disclosed/estimated/undisclosed + range `currency min–max / period` + transparency + confidence
- Company: verified/likely_legit/unknown/suspicious + confidence
- Experience: entry/mid/senior/executive + required skills list
- Why matches: rendered in accent background
- Evidence: first available evidence quote cleaned (no HTML), source verified label
- Pending fallback: pulsing amber dot + pending text

**Detail panel (`OpportunityIntelligencePanel`):**
- Full grid 2 columns, each field in card:
  - Africa fit + country_restrictions + visa_sponsorship + confidence + evidence + source URL
  - Remote policy + timezone_requirements + confidence + evidence
  - Salary truthfulness: range, currency, period, is_estimated, transparency, confidence, evidence
  - Company legitimacy + job_quality + application_difficulty + hiring_urgency + evidence
  - Experience level + confidence
  - Skill match: required, transferable, missing (gap warning)
- Why matches you section if provided
- Evidence & sources: up to 5 evidence_urls + africa_source_urls as pills, model_version + last_verified_at timestamp
- Pending fallback: explains verifier checking, includes why might fit, notes raw data untouched

**SEO God Mode considerations:**
- Server-rendered (no client state), crawlable, fast, semantic HTML
- No heavy JS, Tailwind only, no CLS
- Cleaned descriptions everywhere → no `&lt;div>` in SERP snippets
- JobPosting JSON-LD still uses cleaned firstParagraph, validThrough from posted_at + 60d, applicantLocationRequirements honest (explicit Africa only broad list)
- Internal linking preserved: More {category} roles, Remote {category} jobs, Africa hub
- Canonical URLs preserved via `siteUrl`
- Sitemap freshness uses posted_at
- Freshness signals use posted_at not created_at (refresh engine)
- Page speed: excerpt generation pure, <5ms, AI fetch via single IN query batch

## 3. Requirements Checklist

- [x] use existing `job_ai_intelligence` table – no new tables
- [x] do not rebuild control plane – used existing Gateway/Provider/Verifier infrastructure, only added read helper
- [x] do not add new job sources – no new adapters
- [x] do not build CV intelligence yet – only job intelligence
- [x] keep raw job data untouched – enrichment at read time via `aiIntelligence` field, no update to `jobs.description_md`
- [x] async and production safe – anon read with service fallback, try/catch returns empty Map, UI shows pending
- [x] clean fallback if intelligence not ready – Intelligence pending component
- [x] remove raw markdown from preview – stripMarkdown + double decode + parser
- [x] use cleaned description everywhere – job-card excerpt, detail markdown via `getCleanMarkdownForRender`, role metadata via `cleanDescription`
- [x] load `job_ai_intelligence` correctly in Home feed via `job_id` join
- [x] render AI fields on card + intelligence summary instead of only trust/remote/salary/likely open
- [x] Opportunity Intelligence panel on Home and detail with required fields

## 4. Files Changed

- `lib/cleanDescription.ts` – full rewrite with stripMarkdown, double decode, safety regex
- `lib/ai/queries.ts` – new, public read helper + Map join
- `supabase/migrations/20260723150000_ai_intelligence_public_read.sql` – public SELECT policy
- `supabase/migrations/20260723140000_ai_job_intelligence_foundation.sql` – added to repo (already applied)
- `components/opportunity-intelligence.tsx` – new UI
- `components/job-card.tsx` – accepts aiIntelligence, renders summary
- `components/job-feed.tsx` – accepts JobWithAI, passes to JobCard
- `components/personalized-feed.tsx` – joins AI, shows intelligence
- `components/job-detail-layout.tsx` – accepts aiIntelligence, renders full panel, uses clean markdown render
- `lib/queries.ts` – adds WithAI variants
- `app/page.tsx` – uses getJobsWithAI + show intelligence
- `app/role/[slug]/page.tsx` – WithAI + cleanDescription for metadata
- `app/jobs/page.tsx`, `app/jobs/[category]/[country]/page.tsx`, `app/remote-jobs/[country]/page.tsx`, `app/remote-jobs/search/[intent]/page.tsx` – WithAI + posted_at freshness
- `lib/supabase/service.ts` – ws polyfill for Node 20 (from previous phase, kept)
- `vercel.json` – crons tier=1 + AI batch 50 (from previous phase, kept)

## 5. Verification

- `npm run build` green (41 routes)
- Tested excerpt cleaning with 4 cases: `&lt;div class="content-intro"&gt;`, `<div><p><strong>`, double-encoded, markdown headings/bold/links – all produce clean 180-250 plain text, no `<`, `&lt;`, `**`
- Live DB anon read test: `supabase.from('job_ai_intelligence').select().limit(5)` returns data after migration
- No duplicate intelligence records (unique job_id), no jobs skipped, queue resumes via pending check
- No fabrication: shows UNKNOWN when missing, evidence quote from table, source URLs

## 6. Next Steps (not in this fix)

- Process full pending AI queue (4558 pending) – needs larger batch cron + SKIP LOCKED
- Wire all 7 verifiers to Gateway (currently some use rule-based fallback)
- Persist provider health to DB (currently in-memory)
- Add durationMs tracking to ingest_runs

---
**Production Ready:** Yes, for Home feed bug + Opportunity Intelligence UI. Build green, RLS public read applied live, fallback pending state clean.
