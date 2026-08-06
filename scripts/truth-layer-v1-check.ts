/**
 * Truth Layer v1 — regression harness.
 *
 * Every fixture is a defect or a positive control taken VERBATIM from the
 * live production audit of 2026-08-05 (PRODUCTION_TRUTH_REPORT_2026-08-05,
 * PRODUCTION_AUDIT_LEDGER_2026-08-05). If this harness passes, the exact
 * failure classes that were live in production cannot silently return.
 *
 * Run:  npx tsx scripts/truth-layer-v1-check.ts
 */

import {
  AFRICA_RE,
  classifyGeoEligibility,
  eligibilityScanText,
  extractQuote,
  unescapeMarkdown,
} from "../lib/geo/eligibility"
import { classifyEligibility } from "../lib/ingest/normalize"
import { asSkillList, cleanEvidenceText } from "../lib/ai/normalize"
import { formatSalary } from "../lib/intelligence"
import { salaryDisplay } from "../lib/format"

let passed = 0
let failed = 0
const failures: string[] = []

// Tally prints on process exit — suite blocks may be appended anywhere in
// this file without ever stranding the summary above them again.
process.on("exit", () => {
  console.log(`\n${"═".repeat(60)}`)
  console.log(`Truth Layer v1 fixtures: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log("FAILURES:", failures.join(" | "))
    process.exitCode = 1
  }
})

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  ✗ ${name}${detail !== undefined ? ` — got: ${JSON.stringify(detail)}` : ""}`)
  }
}

/* -------------------------------------------------------------------- */
/* 1 · Word-boundary Africa matching (the live mali fabrication)         */
/* -------------------------------------------------------------------- */
console.log("\n1 · Word-boundary Africa matching")

// Live evidence: OpenAI Finance & Operations Audit Leader (SF, hybrid 3d/wk
// office) was rendered "Explicitly open to Africa • 75%" with the quote
// "…identifying anomalies, control weaknesses…" — `mali` ⊂ `anomalies`.
const OPENAI_AUDIT_TEXT = `About the Role
As the Finance & Operations Audit Leader, you will lead complex audits across financial reporting, accounting, finance, and business operations.
You will have opportunities to apply forensic accounting techniques to complex transactions, anomalies, and potential misconduct.
Use data analytics, automation, and AI to improve risk assessment, audit scoping, testing, continuous monitoring, and reporting, including identifying anomalies, control weaknesses, and emerging risks.
This role is based in San Francisco, CA. We use a hybrid work model of 3 days in the office per week and offer relocation assistance to new employees.`

check("AFRICA_RE does not match 'anomalies' (mali substring)", !AFRICA_RE.test(OPENAI_AUDIT_TEXT))
check("AFRICA_RE does not match 'normalize'", !AFRICA_RE.test("We normalize operational risk signals across the audit function."))
check("AFRICA_RE still matches a real mention", AFRICA_RE.test("This role is open to candidates in Nigeria and Kenya."))

const v1 = classifyGeoEligibility({ text: OPENAI_AUDIT_TEXT, locationField: "San Francisco" })
check("Audit-leader verdict is NOT explicit", v1.tier !== "explicit", v1.tier)
check("Audit-leader verdict is NOT likely", v1.tier !== "likely", v1.tier)

/* -------------------------------------------------------------------- */
/* 2 · Marketing / business-coverage dead zones                          */
/* -------------------------------------------------------------------- */
console.log("\n2 · Marketing dead zones")

// Live evidence: Decision Inc roles earned africa_eligibility "likely" (55%)
// from company marketing; MindPlus's DB row contained the scope_worldwide
// signal quoted from "partners with businesses worldwide".
const DECISION_INC_TEXT = `We are seeking a detail-oriented and experienced Microsoft Dynamics Supply Chain Support Consultant to join our ERP support team.
Decision Inc. is a global digital partner that enables businesses to reinvent themselves to realise their full potential and enables businesses worldwide.`
const v2 = classifyGeoEligibility({ text: DECISION_INC_TEXT, locationField: "United States" })
check("Decision Inc marketing → restricted (US location, coverage excluded)", v2.tier === "restricted", v1Reason(v2))

const MINDPLUS_TEXT = `Job Overview
Our Client is seeking an experienced Senior Project Manager to lead and deliver successful ERP implementation projects. The organization partners with businesses worldwide to deliver innovative, data-driven solutions that enhance operational efficiency and business growth.
Mandatory Requirements
Willingness to work on international projects across North America, Australia, Asia, and Europe.
Flexibility to align working hours according to different time zones when required.`
const v2b = classifyGeoEligibility({ text: MINDPLUS_TEXT, locationField: "Sri Lanka" })
check("MindPlus marketing/project-coverage → NOT likely", v2b.tier !== "likely", v1Reason(v2b))

const scan2 = eligibilityScanText(MINDPLUS_TEXT)
check("scan text drops the marketing line", !/partners with businesses worldwide/i.test(scan2))
check("scan text drops the project-coverage line", !/international projects across North America/i.test(scan2))

/* -------------------------------------------------------------------- */
/* 3 · Region-coverage holes (Romania/EU set + US-state remote)          */
/* -------------------------------------------------------------------- */
console.log("\n3 · Restriction coverage")

// Live evidence: Oben Technology "Remote (Anywhere Romania)", EET, Romanian
// language — classified worldwide and listed on the Nigeria hub.
const OBEN_TEXT = `Job details Job Location: Remote (Anywhere Romania) Effort Schedule:8 Hours/Day Business Hours: EET Timeframe Language: English, Romanian Customers Background: (EU, WorldWide) Client Facing Role: Yes`
const v3 = classifyGeoEligibility({ text: OBEN_TEXT, locationField: "Romania" })
check("Oben Romania role → restricted", v3.tier === "restricted", v1Reason(v3))

// Live evidence: Pinterest role at "Los Angeles, CA, US; Remote, CA, US"
// was "Likely open to Africa • 90%".
const v4 = classifyGeoEligibility({ text: "About Pinterest: Millions of people around the world come to our platform.", locationField: "Los Angeles, CA, US; Remote, CA, US" })
check("Pinterest US-state remote → restricted", v4.tier === "restricted", v1Reason(v4))
check("Pinterest verdict carries the us-state-remote reason", v4.reason === "us-state-remote" || v4.reason === "location-lock", v4.reason)

// Live evidence: MongoDB Gurugram hybrid EMEA HR role → "Likely open to
// Africa • 80%" (coverage-context EMEA misread).
const GURUGRAM_TEXT = `The EMEA HR Shared Services team comprises five members, including the team lead, and supports operations across 19 countries in the EMEA region. The team manages end-to-end employee lifecycle processes. Comfortable with working in a shift of 2PM-10PM.`
const v5 = classifyGeoEligibility({ text: GURUGRAM_TEXT, locationField: "Gurugram" })
check("Gurugram EMEA-coverage role → NOT likely", v5.tier !== "likely", v1Reason(v5))

/* -------------------------------------------------------------------- */
/* 4 · Positive controls — genuine eligibility must survive               */
/* -------------------------------------------------------------------- */
console.log("\n4 · Positive controls")

// Live evidence: Hostaway Staff PM — FULLY remote, "candidate must be
// within EMEA", recruit countries include Ghana/Nigeria/South Africa.
const HOSTAWAY_TEXT = `NOTE: This is a FULLY remote role, but the candidate must be within EMEA to collaborate with their team, peers, and internal customers. You do not have to be in the specific country or city shown in this listing, but please only apply if you are within EMEA.`
const v6 = classifyGeoEligibility({ text: HOSTAWAY_TEXT, locationField: "Australia, Canada, Ghana, India, Ireland, New Zealand, Nigeria, South Africa, United Kingdom, United States" })
check("Hostaway (Africa countries named in location) → explicit", v6.tier === "explicit", v1Reason(v6))

const v7 = classifyGeoEligibility({ text: HOSTAWAY_TEXT, locationField: "Remote - EMEA" })
check("Hostaway without country list → likely (hiring-context EMEA)", v7.tier === "likely", v1Reason(v7))

const v8 = classifyGeoEligibility({ text: "Work from anywhere in the world. We hire globally across all time zones.", locationField: null })
check("Genuine 'work from anywhere' → likely", v8.tier === "likely", v1Reason(v8))

/* -------------------------------------------------------------------- */
/* 5 · Deterministic ingest tier shares the SAME corpus                  */
/* -------------------------------------------------------------------- */
console.log("\n5 · Ingest tier parity")

check("classifyEligibility(audit JD) agrees with corpus", classifyEligibility("San Francisco", "Finance & Operations Audit Leader", OPENAI_AUDIT_TEXT) === v1.tier, classifyEligibility("San Francisco", "Finance & Operations Audit Leader", OPENAI_AUDIT_TEXT))
check("classifyEligibility(Oben) → restricted", classifyEligibility("Romania", "GCP Senior Consultant", OBEN_TEXT) === "restricted")

/* -------------------------------------------------------------------- */
/* 6 · Persistence contract — skills, evidence, salary display            */
/* -------------------------------------------------------------------- */
console.log("\n6 · Persistence contract")

// Live evidence: skills rendered as raw JSON objects with markdown escapes.
const dirtySkills = [
  { skill: "large-cohort onboarding at scale", evidence: "Run large-cohort onboarding at scale." },
  "\\*\\*5+ years building internet-scale software\\*\\*",
  "Finance",
  "finance",
  { skill: "Finance" },
  "distributed talent pool management",
] as unknown
check("asSkillList extracts object skills", asSkillList(dirtySkills).includes("large-cohort onboarding at scale"), asSkillList(dirtySkills))
check("asSkillList unescapes markdown", asSkillList(dirtySkills).includes("**5+ years building internet-scale software**"), asSkillList(dirtySkills))
check("asSkillList dedupes case-insensitively", asSkillList(dirtySkills).filter((s) => s.toLowerCase() === "finance").length === 1, asSkillList(dirtySkills))
check("asSkillList never returns objects", asSkillList(dirtySkills).every((s) => typeof s === "string"))

check("cleanEvidenceText unescapes quotes", cleanEvidenceText("ek evidence: \\*\\*'Location: Remote'\\*\\* in header") === "ek evidence: **'Location: Remote'** in header")

const q = extractQuote(OPENAI_AUDIT_TEXT, /\bmali\b/i)
check("extractQuote returns null when nothing matches (no fabrication)", q === null)
const q2 = extractQuote(OPENAI_AUDIT_TEXT, /anomalies/)
check("extractQuote is word-aligned (no '…mali'-style fragments)", q2 !== null && !/\bali\b/.test(q2 || "") && (q2!.includes("anomalies") || q2!.includes("…")), q2)

// Live evidence: $13–36/hr displayed as "USD0.013k - USD0.036k"; "USD 0 – 0"
// displayed as disclosed.
check("formatSalary hourly renders honestly", formatSalary({ min: 13, max: 36, currency: "USD", period: "hour", raw: "" }) === "$13 - $36/hour", formatSalary({ min: 13, max: 36, currency: "USD", period: "hour", raw: "" }))
check("formatSalary annual still k-formats", formatSalary({ min: 50000, max: 70000, currency: "USD", period: "year", raw: "" }) === "$50k - $70k", formatSalary({ min: 50000, max: 70000, currency: "USD", period: "year", raw: "" }))
check("salaryDisplay rejects k-collapsed junk", salaryDisplay("USD0.013k - USD0.036k").isExplicit === false)
check("salaryDisplay rejects 0–0 as disclosed", salaryDisplay("USD 0 – 0").isExplicit === false)
check("salaryDisplay keeps real values", salaryDisplay("$123,684—$254,644").isExplicit === true)

/* -------------------------------------------------------------------- */

function v1Reason(v: { tier: string; reason: string }) {
  return `${v.tier}/${v.reason}`
}


/* -------------------------------------------------------------------- */
/* 7 · Trust differentiation (truth plane must not be static)            */
/* Live evidence 2026-08-05: ~30/30 JAI-unknown cards at flat 59; queued  */
/* MongoDB hub all "Low 32"; first-seen recruiter raw trust_score 100.    */

import {
  unifiedTrustScore,
  softCapTrust,
  correctedTrustSignals,
  displayLegitimacy,
} from "../lib/trust/engine"

console.log("7 · Trust differentiation")

function mkJob(over: Record<string, any>): any {
  return {
    id: "j1",
    slug: "x",
    title: "Senior Operations Manager",
    company: "Acme Corp",
    company_logo: "https://cdn.example.com/logo.png",
    description_md: "A real role. Run operations well.",
    apply_url: "https://himalayas.app/companies/acme/jobs/x",
    category: "operations",
    location: "Remote",
    country: "Worldwide",
    salary_range: "USD50k - USD70k",
    salary_min: 50000,
    salary_max: 70000,
    salary_currency: "USD",
    salary_period: "year",
    employment_type: "full_time",
    tags: ["ops"],
    is_remote: true,
    is_open_to_africa: true,
    eligibility: "likely",
    posted_at: "2026-08-01T10:00:00.000Z",
    created_at: "2026-08-05T10:00:00.000Z",
    expires_at: null,
    source: "himalayas",
    source_id: "himalayas:abc",
    ...over,
  }
}

// 7a · soft cap math: monotone, bounded, order-preserving
{
  const s70 = softCapTrust(70)
  const s90 = softCapTrust(90)
  const s100 = softCapTrust(100)
  check("softCap keeps ceiling ≤ 59", s100 <= 59)
  check("softCap preserves ordering (70 < 90 < 100)", s70 < s90 && s90 < s100)
  check("softCap spreads identical-plateau raws (73 vs 80)", softCapTrust(73) !== softCapTrust(80))
  check("softCap leaves below-cap untouched", softCapTrust(45) === 45)
}

// 7b · Africa-unknown: different evidence depths MUST surface differently
// (prod: evidence 19% and 95% both displayed 59)
{
  const job = mkJob({})
  const thin = unifiedTrustScore(job, { overall_confidence: 19, africa_eligibility: "unknown" } as any)
  const deep = unifiedTrustScore(job, { overall_confidence: 95, africa_eligibility: "unknown" } as any)
  check("unknown-Africa stays capped (deep ≤ 59)", deep <= 59)
  check("unknown-Africa variance restored (thin ≠ deep)", thin !== deep, { thin, deep })
  check("deeper evidence reads higher", deep > thin, { thin, deep })
}

// 7c · Explicit Africa is NOT capped and outranks unknown with same evidence
{
  // [V1.2] "explicit" is only meaningful when Africa is traceably named in
  // the posting held today — genuine explicit evidence, not a stored claim.
  const job = mkJob({ description_md: "A real role. Open to applicants in Nigeria, Ghana, and worldwide. Run operations well." })
  // unknown = stored unknown AND no Africa evidence in the posting held today.
  const silentJob = mkJob({})
  const unknown63 = unifiedTrustScore(silentJob, { overall_confidence: 63, africa_eligibility: "unknown" } as any)
  const explicit63 = unifiedTrustScore(job, { overall_confidence: 63, africa_eligibility: "explicit" } as any)
  check("corpus-visible Africa evidence outranks a stale stored unknown", explicit63 > unknown63, { explicit63, unknown63 })
  check("explicit can exceed the cap (mod-high land)", explicit63 > 59, explicit63)
  check("explicit outranks unknown at equal evidence", explicit63 > unknown63, { explicit63, unknown63 })
}

// 7c-bis · [V1.2] mali-class regression: a stored "explicit" the corpus
// cannot find in the current posting caps like unverified — fabricated
// explicit claims can never outrank the evidence plane again.
{
  const maliRow = mkJob({ description_md: "Use data analytics, and AI to improve risk assessment, scoping, testing, continuous monitoring, and reporting, including identifying anomalies, control weaknesses, and emerging risks." })
  const stored = unifiedTrustScore(maliRow, { overall_confidence: 75, africa_eligibility: "explicit" } as any)
  check("stored explicit with no Africa in posting is capped ≤ 59 (mali class)", stored <= 59, stored)
}

// 7d · blocked evidence_state caps even strong evidence
{
  const job = mkJob({ evidence_state: "blocked", description_md: "Open to applicants across Africa. Run operations well." })
  const s = unifiedTrustScore(job, { overall_confidence: 95, africa_eligibility: "explicit" } as any)
  check("blocked explicit role capped ≤ 59", s <= 59, s)
}

// 7e · fabricated posted_at (== created_at) yields honest zero-impact signal
{
  const fabricated = mkJob({ posted_at: "2026-08-05T04:21:24.938Z", created_at: "2026-08-05T04:21:24.938Z", trust_signals: [
    { id: "posting_freshness", label: "Fresh • 0 days ago", scoreImpact: 12, confidence: "high", tone: "positive", explanation: "x", source: "freshness" },
  ] })
  const { signals, score } = correctedTrustSignals(fabricated)
  const freshSig = signals.find((s: any) => s.id === "posting_freshness") as any
  check("fabricated freshness gets 0 impact", freshSig?.scoreImpact === 0, freshSig && { label: freshSig.label, scoreImpact: freshSig.scoreImpact })
  check("fabricated freshness is labeled honestly (no date from source)", /no date|cannot verify freshness/i.test((freshSig?.label || "") + " " + (freshSig?.explanation || "")))
  check("the +12 illusion is removed from the number", score <= 100 - 12 + 1, score)
}

// 7f · learning entries survive the read-time rebuild (ctx-free renders)
{
  const job = mkJob({ trust_signals: [
    { id: "company_history", label: "Established employer • 407 roles", scoreImpact: 8, confidence: "high", tone: "positive", explanation: "x", source: "history" },
    { id: "source_learning", label: "Source track record", scoreImpact: 8, confidence: "medium", tone: "positive", explanation: "x", source: "learning" },
  ] })
  const { signals } = correctedTrustSignals(job)
  check("company_history kept from persisted set", signals.some((s: any) => s.id === "company_history"))
  check("source_learning kept from persisted set", signals.some((s: any) => s.id === "source_learning"))
}

// 7g · first-seen logo employer no longer pins legitimacy at 100
// (rot-era: MindPackets/MindPlus raw 100 with logo+8 & board-domain +8)
{
  const legit = displayLegitimacy(mkJob({}))
  check("legitimacy for logo-first-seen feed job < 100", legit < 100, legit)
  check("legitimacy still lands in a sane band (>= 60)", legit >= 60, legit)
}

// 7h · queued (no AI): legitimacy differences flow through 0.4 weighting
{
  const a = unifiedTrustScore(mkJob({ company_logo: null, apply_url: "https://jobs.ashbyhq.com/x/1" }), null)
  const b = unifiedTrustScore(mkJob({}), null)
  check("queued rows differentiate by evidence (a ≠ b)", a !== b, { a, b })
}


// 7i · ceiling honesty: rich-signal listings report their overrun out loud
{
  const rich = correctedTrustSignals(mkJob({}) as any)
  check("clamped score stays ≤ 100", rich.score <= 100, rich.score)
  check("rawSum exposed for ceiling marking", typeof rich.rawSum === "number")
  check("score equals min(100, rawSum)", rich.score === Math.min(100, Math.max(0, rich.rawSum)), { score: rich.score, rawSum: rich.rawSum })
}

console.log("8 · Evidence crawler states (Evidence Intelligence V1.1)")

import {
  EVIDENCE_STATES,
  crawlerStateLabel,
  isEvidenceState,
  sameContentHash,
  shouldDeferLiveFetch,
  workerStateFor,
} from "../lib/ai/evidence"

// 8a · state vocabulary — every writer must stay inside the legal set
{
  check("vocabulary has exactly the 8 migrated states", EVIDENCE_STATES.length === 8, EVIDENCE_STATES)
  check("every vocabulary entry passes the guard", EVIDENCE_STATES.every((s) => isEvidenceState(s)))
  check("'timeout' is NOT a legal crawler state", !isEvidenceState("timeout"))
  check("garbage is rejected by the guard", !isEvidenceState("Evidence: verified") && !isEvidenceState("") && !isEvidenceState(null))
}

// 8b · worker nav failure maps to failed, never the made-up 'timeout' state
{
  const navTimeout = workerStateFor("timeout", 0, "anything")
  check("nav timeout resolves to failed", navTimeout === "failed", navTimeout)
  check("nav timeout stays in-vocabulary", isEvidenceState(navTimeout))
  const refused = workerStateFor(null, 403, "")
  check("server 403 still blocked", refused === "blocked", refused)
  const challenge = workerStateFor(null, 200, "<html>Just a moment… cloudflare challenge-platform</html>")
  check("challenge page still blocked", challenge === "blocked", challenge)
  const clean = workerStateFor(null, 200, "Senior Engineer role description with real content")
  check("healthy page yields no block state", clean === null, clean)
}

// 8c · honest human copy — raw enums never reach the UI
{
  for (const st of EVIDENCE_STATES) {
    const { label } = crawlerStateLabel(st)
    check(`label for '${st}' is not the raw enum`, label !== st && !label.includes(`Evidence: ${st}`), label)
    check(`label for '${st}' carries real words`, label.length > 12, label)
  }
  check("blocked copy preserved verbatim (regression)", crawlerStateLabel("blocked").label === "Page blocked — evidence unavailable, retrying later")
  check("failed state admits the failure and the retry", /could not be read/.test(crawlerStateLabel("failed").label) && /retry/i.test(crawlerStateLabel("failed").label), crawlerStateLabel("failed").label)
  check("unknown state degrades honestly, not to jargon", crawlerStateLabel("weird").label === "Page evidence state not recorded", crawlerStateLabel("weird").label)
  check("tone map complete", EVIDENCE_STATES.every((s) => ["red", "green", "amber"].includes(crawlerStateLabel(s).tone)))
}

// 8d · retry_at deference — a refused page is not re-hit inside its window
{
  const future = new Date(Date.now() + 6 * 3_600_000).toISOString()
  const past = new Date(Date.now() - 60_000).toISOString()
  check("blocked + future retry defers", shouldDeferLiveFetch({ status: "blocked", retry_at: future }))
  check("failed + future retry defers", shouldDeferLiveFetch({ status: "failed", retry_at: future }))
  check("blocked + window open refetches", !shouldDeferLiveFetch({ status: "blocked", retry_at: past }))
  check("verified evidence never defers", !shouldDeferLiveFetch({ status: "verified", retry_at: future }))
  check("blocked without retry_at refetches (no schedule to respect)", !shouldDeferLiveFetch({ status: "blocked", retry_at: null }))
  check("no evidence yet refetches", !shouldDeferLiveFetch(null))
  check("garbage retry_at does not defer", !shouldDeferLiveFetch({ status: "blocked", retry_at: "not-a-date" }))
}

// 8e · evidence store holds versions, not echoes
{
  check("identical hash is a duplicate", sameContentHash("abc123", "abc123"))
  check("changed content is not a duplicate", !sameContentHash("abc123", "def456"))
  check("missing hashes never dedupe away evidence", !sameContentHash(null, "abc123") && !sameContentHash("abc123", null) && !sameContentHash(null, null))
}

console.log("9 · Evidence Intelligence V1.2 — quote integrity + eligibility arbitration")

import { plainifyPosting, traceableQuote, deriveEvidence } from "../lib/evidence"
import { renderEligibility, eligibleForAfricaSurfaces, excludeFromCountryHub } from "../lib/geo/render-eligibility"

// 9a · plain rendering — hrefs and escapes can never leak into prose
{
  const md = "Trusted by 20,000+ property managers worldwide, [Hostaway](https://himalayas.app/companies/hostaway) is an industry leading platform. \\*\\*NOTE: fully remote.\\*\\*"
  const plain = plainifyPosting(md)
  check("links collapse to their label", plain.includes("Hostaway is an industry"), plain)
  check("no URL survives in plain text", !/https?/.test(plain), plain)
  check("markdown escapes resolve and emphasis stays out of prose", plain.includes("NOTE: fully remote.") && !plain.includes("\\") && !plain.includes("*"), plain)
}

// 9b · live-case quotes: the mangled classes die, the genuine ones survive
{
  // Real posting shape (Hostaway, live 2026-08-05): URL-adjacent prose.
  const hostawayPlain = plainifyPosting("Trusted by 20,000+ property managers worldwide, [Hostaway](https://himalayas.app/companies/hostaway) is an industry leading, AI-powered vacation rental management platform.")
  const sig = deriveEvidence({ description_md: "Trusted by 20,000+ property managers worldwide, [Hostaway](https://himalayas.app/companies/hostaway) is an industry leading, AI-powered vacation rental management platform.", location: "Australia, Canada, Ghana, India, Ireland, New Zealand, Nigeria, South Africa, United Kingdom, United States", eligibility: "explicit", is_remote: true } as any)
  const worldwide = sig.find((x: any) => x.id === "scope-worldwide")
  check("worldwide excerpt has no href contamination", worldwide?.excerpt ? !/https?|\(|\[/.test(worldwide.excerpt) : false, worldwide?.excerpt)
  const elig = sig.find((x: any) => x.id === "eligibility-explicit")
  check("explicit quote is word-aligned (no 'app)' prefix)", !!elig?.excerpt && !elig.excerpt.startsWith("app)"), elig?.excerpt)
  check("explicit quote names an African country", !!elig?.excerpt && /Nigeria|Ghana|South Africa/.test(elig.excerpt), elig?.excerpt)
  check("quotes never slice mid-word", sig.every((x: any) => !x.excerpt || !/\p{L}\p{N}…$|^\p{L}\p{N}*app\)/u.test(x.excerpt)), sig.map((x: any) => x.excerpt).filter(Boolean))
  check("traceability drops href fragment quotes", traceableQuote("app/companies/micro1) provides a comprehensive benefits package, including up to 100% reimbursement for health-insurance premiums, paid time off, a 401(K) pl", hostawayPlain) === null)
  check("traceability keeps a genuine verbatim quote", traceableQuote("Trusted by 20,000+ property managers worldwide, Hostaway is an industry leading, AI-powered vacation rental management platform.", hostawayPlain) !== null)
  check("traceability drops mid-word-start fragments (mali class)", traceableQuote("d AI to improve risk assessment, audit scoping, testing", plainifyPosting("Use data analytics, and AI to improve risk assessment, scoping, testing, continuous monitoring, and reporting, including identifying anomalies, control weaknesses, and emerging risks.")) === null)
  check("escaped stored quote still verifies after unescape", traceableQuote("\\*\\*NOTE: fully remote.\\*\\*", plainifyPosting("\\*\\*NOTE: fully remote.\\*\\* Apply now.")) !== null)
  check("short fragments are not quotes", traceableQuote("app) Worldwide", hostawayPlain) === null)
}

// 9c · arbitration matrix — every case from the live audit
{
  // Positive control: Africa named in location -> explicit, regardless of stored.
  const hostaway = { description_md: "**NOTE: FULLY remote, must be within EMEA to collaborate.** Trusted by 20,000+ property managers worldwide.", location: "Australia, Canada, Ghana, India, Ireland, New Zealand, Nigeria, South Africa, United Kingdom, United States", eligibility: "likely" as const }
  const ha = renderEligibility(hostaway, "likely")
  check("Africa named in location is explicit (positive control)", ha.tier === "explicit", ha)
  // Oben Romania (live): stale stored likely CANNOT outrank Romania lock.
  const oben = { description_md: "Job details Job Location: Remote (Anywhere Romania) Effort Schedule:8 Hours/Day Business Hours: EET Timeframe Language: English, Romanian Customers Background: (EU, WorldWide) Client Facing Role: Yes Project Team Size:+10 members.", location: "Romania", eligibility: "likely" as const, is_open_to_africa: true }
  const ob = renderEligibility(oben, null)
  check("Romania-locked role renders restricted despite stored likely", ob.tier === "restricted", ob)
  check("Romania-locked role excluded from Africa intent surfaces", !eligibleForAfricaSurfaces(oben, null))
  check("Romania-locked role excluded from country hubs", excludeFromCountryHub(oben, null))
  // mali FP (live audit-leader): stored explicit, no Africa in posting -> NOT explicit.
  const mali = { description_md: "This role is based in San Francisco, CA. We use a hybrid work model of 3 days in the office per week and offer relocation assistance to new employees.", location: "San Francisco", eligibility: "likely" as const }
  const ma = renderEligibility(mali, "explicit")
  check("stored explicit with no Africa in posting is NOT rendered explicit", ma.tier !== "explicit", ma)
  check("mali-class row is not corroborated", ma.corroborated === false)
  // MindPlus (live): marketing worldwide is a dead zone; old stored likely degrades honestly.
  const mind = { description_md: "The organization partners with businesses worldwide to deliver innovative, data-driven solutions that enhance operational efficiency and business growth.", location: "Sri Lanka", eligibility: "likely" as const }
  const mi = renderEligibility(mind, null)
  check("marketing worldwide is not a verified likely", mi.corroborated === false, mi)
  check("marketing worldwide does not qualify for Africa intent surfaces", !eligibleForAfricaSurfaces(mind, null))
  // Genuine worldwide hiring (corpus likely) + stored likely -> corroborated claim.
  const genuine = { description_md: "This is a fully remote role. Work from anywhere in the world. We hire globally across all time zones.", location: "Worldwide", eligibility: "likely" as const }
  const ge = renderEligibility(genuine, "likely")
  check("genuine worldwide hiring corroborates stored likely", ge.tier === "likely" && ge.corroborated === true, ge)
  check("genuine worldwide hiring qualifies for Africa surfaces", eligibleForAfricaSurfaces(genuine, "likely"))
  // Feed region lock suppresses affirmative claims even when corpus reads likely.
  const locked = { ...genuine, is_open_to_africa: false as const }
  check("feed region lock still suppresses affirmative tier", renderEligibility(locked, "likely").tier === "unknown")
}

// 9d · skills rendered deduped, never JSON, never tags-as-'Required'
{
  check("'Finance, Finance' dedupes at render boundary", asSkillList(["Finance", "Finance"]).length === 1, asSkillList(["Finance", "Finance"]))
  check("stored skill-objects never render as JSON", asSkillList([{ skill: "onboarding at scale", evidence: "x" }] as any)[0] === "onboarding at scale", asSkillList([{ skill: "onboarding at scale", evidence: "x" }] as any))
}

// 9e · one plane: chip, panel, and trust read the same arbitrated tier
{
  const corpus = renderEligibility({ description_md: "Open to applicants in Nigeria and Kenya. Fully remote.", location: "Worldwide", eligibility: "unknown" as const }, "unknown")
  check("corpus-visible Africa beats stored unknown on every surface", corpus.tier === "explicit", corpus)
  const score = unifiedTrustScore(mkJob({ description_md: "Open to applicants in Nigeria and Kenya. Fully remote.", eligibility: "unknown" }), { overall_confidence: 75, africa_eligibility: "unknown" } as any)
  check("trust plane follows the same arbitration (no cap on real evidence)", score > 59, score)
}

console.log("10 · V1.2 consistency — skills JSON, salary authority, segment quotes")

import { jaiSalaryDisplay } from "../lib/evidence"

// 10a · the exact stored micro1 payload never renders JSON again
{
  const liveStored = [
    "{\"skill\":\"large-cohort onboarding at scale\",\"evidence\":\"Run large-cohort onboarding at scale (fast, clean, zero chaos).\"}",
    "{\"skill\":\"distributed talent pool management\",\"evidence\":\"Activate and manage distributed talent pools powering AI training + data ops.\"}",
    "{\"skill\":\"enterprise client relationship management\",\"evidence\":\"Build and maintain high-trust enterprise client relationships.\"}",
  ]
  const out = asSkillList(liveStored as any)
  check("stringified skill objects unwrap to names", out.join("|") === "large-cohort onboarding at scale|distributed talent pool management|enterprise client relationship management", out)
  check("no JSON syntax survives the boundary", !out.some((s) => s.includes("{") || s.includes("\"evidence\"")), out)
  check("broken JSON text is dropped, not rendered", asSkillList(["{broken json" as any]).length === 0, asSkillList(["{broken json" as any]))
}

// 10b · salary authority — evidence-backed number wins, everything else stands down
{
  const micro1Plain = plainifyPosting("Scale the human data engine behind frontier AI systems. The national pay range for this full-time position is base salary of $50,000 –$70,000 USD. All employees are eligible for equity compensation.")
  const jai = { salary_transparency: "disclosed", salary_min: 50000, salary_max: 70000, salary_currency: "USD", salary_evidence: "The national pay range for this full-time position is base salary of $50,000 –$70,000 USD." }
  check("traceable disclosed JAI salary wins", jaiSalaryDisplay(jai as any, micro1Plain) === "USD50k - USD70k", jaiSalaryDisplay(jai as any, micro1Plain))
  check("untraceable quote disqualifies the override", jaiSalaryDisplay({ ...jai, salary_evidence: "not in the posting at all, completely different words" } as any, micro1Plain) === null)
  check("undisclosed never overrides", jaiSalaryDisplay({ ...jai, salary_transparency: "undisclosed" } as any, micro1Plain) === null)
  check("zero-max junk never overrides", jaiSalaryDisplay({ ...jai, salary_max: 0 } as any, micro1Plain) === null)
  check("missing ai never overrides", jaiSalaryDisplay(null, micro1Plain) === null)
  const sigs = deriveEvidence(mkJob({ salary_range: "USD70k - USD110k", description_md: "The national pay range for this full-time position is base salary of $50,000 –$70,000 USD. Other text." }) as any, { ai: jai } as any)
  const sal = sigs.find((x: any) => x.id === "salary-disclosed")
  check("evidence panel shows ONE number — the posting-verbatim one", !!sal?.reason?.includes("USD50k - USD70k") && !sal.reason.includes("USD70k - USD110k"), sal?.reason)
}

// 10c · quotes never splice across the description/location join
{
  const sigs = deriveEvidence(mkJob({ description_md: "Role overview. Originally posted on Himalayas", location: "Worldwide" }) as any)
  const worldwide = sigs.find((x: any) => x.id === "scope-worldwide")
  check("no cross-segment splice ('Originally posted on Himalayas Worldwide')", worldwide?.excerpt === undefined || worldwide.excerpt !== "Originally posted on Himalayas Worldwide", worldwide?.excerpt)
}

console.log("11 · V1.2 salary hygiene + copy honesty")

// Reproduce the label logic boundary via a tiny probe of the same rules
// (component renders these exact decisions — fixtures pin the semantics).
function probeSalaryLabel(row: any): { junk: boolean; disclosed: boolean } {
  const nmin = typeof row.salary_min === "number" ? row.salary_min : null
  const nmax = typeof row.salary_max === "number" ? row.salary_max : null
  const currency = row.salary_currency || ""
  const period = row.salary_period ?? null
  const zeroRange = (nmax != null && nmax <= 0) && (nmin == null || nmin <= 0)
  const kCollapsed = nmax != null && nmax > 0 && nmax < 500 && (period == null || period === "year") && (currency === "" || currency === "USD")
  return { junk: zeroRange || kCollapsed, disclosed: row.salary_transparency === "disclosed" && !zeroRange && !kCollapsed }
}

{
  // Live 2026-08-05: BI Consultant card rendered "Salary disclosed: USD 0 – 0 • 100%".
  const zero = probeSalaryLabel({ salary_transparency: "disclosed", salary_min: 0, salary_max: 0, salary_currency: "USD" })
  check("'USD 0 – 0' is junk, not disclosure", zero.junk === true && zero.disclosed === false, zero)
  // Live 2026-08-05: three micro1 cards rendered "USD0.03k – USD0.1k"-style rows.
  const k1 = probeSalaryLabel({ salary_transparency: "disclosed", salary_min: 30, salary_max: 100, salary_currency: "USD", salary_period: "year" })
  check("k-collapsed 'yearly' range is junk", k1.junk === true, k1)
  const k2 = probeSalaryLabel({ salary_transparency: "disclosed", salary_min: 30, salary_max: 100, salary_currency: "USD", salary_period: null })
  check("k-collapsed no-period range is junk", k2.junk === true, k2)
  // Genuine cases must survive untouched.
  const hourly = probeSalaryLabel({ salary_transparency: "disclosed", salary_min: 13, salary_max: 36, salary_currency: "USD", salary_period: "hour" })
  check("genuine hourly range survives ($13–36/hour)", hourly.junk === false && hourly.disclosed === true, hourly)
  const yearly = probeSalaryLabel({ salary_transparency: "disclosed", salary_min: 120000, salary_max: 150000, salary_currency: "USD", salary_period: "year" })
  check("genuine yearly range survives (USD120–150k)", yearly.junk === false && yearly.disclosed === true, yearly)
  const eurSmall = probeSalaryLabel({ salary_transparency: "disclosed", salary_min: 50, salary_max: 90, salary_currency: "EUR", salary_period: "hour" })
  check("non-USD hourly survives", eurSmall.junk === false, eurSmall)
}

// 11b · feed-range fallback inherits the chip's junk guard (same-card truth)
{
  const junk = salaryDisplay("USD0.03k - USD0.1k" as any, {} as any)
  check("stored 'USD0.03k - USD0.1k' is junk-guarded (same test the chip uses)", junk.isExplicit === false, junk)
  const zero = salaryDisplay("USD 0 – 0" as any, {} as any)
  check("stored 'USD 0 – 0' is junk-guarded", zero.isExplicit === false, zero)
  const real = salaryDisplay("USD120k - USD150k" as any, {} as any)
  check("genuine range stays explicit", real.isExplicit === true, real)
}
