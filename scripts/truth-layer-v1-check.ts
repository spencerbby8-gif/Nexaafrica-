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

console.log(`\n${"═".repeat(60)}`)
console.log(`Truth Layer v1 fixtures: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("FAILURES:", failures.join(" | "))
  process.exit(1)
}
