/**
 * Truth Layer v1 — ONE shared geo / eligibility corpus.
 *
 * This module is the single source of truth for Africa-eligibility and
 * geo-restriction detection. It is consumed by:
 *   - the deterministic ingest tier   (lib/ingest/normalize.ts  → classifyEligibility)
 *   - the deterministic signals tier  (lib/intelligence.ts      → scope signals)
 *   - the AI verifier's regex ground truth (lib/ai/verifiers/consolidated.ts)
 *   - the truth-guard in the same file (TR.africa / TR.restrict / TR.worldwide)
 *   - the Truth Layer v1 backfill     (app/api/ai/backfill/route.ts)
 *
 * Proven production defects this module fixes (live evidence, audit 2026-08-05):
 *   1. `mali` matched inside "anomalies"/"normalize" → fabricated
 *      "Explicitly open to Africa • 75%" on an SF hybrid OpenAI role.
 *      → every country/region term is now word-boundary anchored (\b..\b).
 *   2. Company marketing ("enables businesses worldwide", "partners with
 *      businesses worldwide", "operations across the EMEA region") drove
 *      "likely" verdicts. → eligibility dead zones strip business-coverage
 *      phrasing before any outreach token counts.
 *   3. "Remote (Anywhere Romania)" / "EET Timeframe" roles classified as
 *      worldwide. → restriction corpus now includes the full EU-27 set plus
 *      every country observed in production (Romania, Bulgaria, Hungary, ...).
 *   4. US-state remote ("Remote, CA, US") passed at 90% confidence.
 *      → US state names + postal codes (US-anchored) are restriction terms
 *      in location fields.
 *   5. Stored evidence quotes were sliced mid-word ("d AI to improve…",
 *      "ues to ensure smooth opera…"). → extractQuote is word-aligned.
 *
 * Pure module: no imports, no I/O — safe for ingest, verifier, API, scripts.
 */

export type AfricaTier = "explicit" | "likely" | "restricted" | "unknown"

/* ------------------------------------------------------------------ */
/* Africa terms — word-boundary anchored (the mali-class fix)          */
/* ------------------------------------------------------------------ */

/**
 * Tokens that routinely appear INSIDE ordinary English words. Exported for
 * the backfill false-positive sniffer. They are safe ONLY with \b anchors.
 */
export const AFRICA_COLLISION_TOKENS = [
  "mali", // anoma-lies, norma-lize, abnorma-lities
  "togo", // (rare in English, kept for completeness)
  "chad", // a common personal name in author bylines
  "niger", // substring of "Nigeria(n)" — \b keeps both correct
  "benin",
  "guinea", // guinea pig; Papua New Guinea handled by ordering below
  "gabon",
  "congo",
  "sudan",
  "angola",
] as const

/** African countries + major hiring-hub cities. ALL terms \b-anchored. */
const AFRICA_TERMS =
  "nigeria|nigerian|kenya|kenyan|ghana|ghanaian|south\\s+africa|south\\s+african|egypt|egyptian|morocco|moroccan|rwanda|rwandan|uganda|ugandan|ethiopia|ethiopian|tanzania|tanzanian|tunisia|tunisian|senegal|senegalese|algeria|algerian|zimbabwe|zimbabwean|namibia|namibian|cameroon|cameroonian|ivory\\s+coast|c[ôo]te\\s+d['’]ivoire|mali|malian|niger|nigerien|burkina\\s+faso|benin|beninese|togo|togolese|sierra\\s+leone|liberia|liberian|guinea(?!\\s+pig)|gambia|gambian|mauritania|chad|chadian|sudan|sudanese|south\\s+sudan|somalia|somali|djibouti|eritrea|libya|libyan|botswana|lesotho|eswatini|swaziland|malawi|mozambique|angola|angolan|zambia|zambian|congo|congolese|\\bdrc\\b|gabon|gabonese|equatorial\\s+guinea|central\\s+african\\s+republic|comoros|madagascar|mauritius|seychelles|cabo\\s+verde|cape\\s+verde|" +
  "lagos|nairobi|accra|addis\\s+ababa|cairo|casablanca|kigali|kampala|dar\\s+es\\s+salaam|johannesburg|abuja|dakar|lusaka|harare|windhoek|gaborone|maputo|mombasa|tema|entebbe|pretoria|cape\\s+town|durban|ibadan|kumasi|douala|tunis|algiers|marrakech"

/** Word-boundary Africa matcher (safe for truth-guard + verifier). */
export const AFRICA_RE = new RegExp(`\\b(?:africa|african|africa[- ]focused|africa[- ]wide|sub[- ]saharan(?:\\s+africa)?|${AFRICA_TERMS})\\b`, "i")

/* ------------------------------------------------------------------ */
/* Restricted regions — full EU-27 + US/UK/CA/AU/NZ + observed states  */
/* ------------------------------------------------------------------ */

/** EU-27 (complete) — Romania/Bulgaria gap closed, every member named. */
const EU27 =
  "austria|belgium|bulgaria|croatia|cyprus|czechia|czech\\s+republic|denmark|estonia|finland|france|germany|greece|hungary|ireland|italy|latvia|lithuania|luxembourg|malta|netherlands|holland|poland|portugal|romania|slovakia|slovenia|spain|sweden"

/** Other non-African hiring regions observed or likely in the corpus. */
const OTHER_REGIONS =
  "united\\s+states|usa|u\\.?s\\.?a?|america|uk|u\\.?k\\.?|united\\s+kingdom|britain|england|scotland|wales|canada|eu|europe|european\\s+union|australia|new\\s+zealand|india|singapore|japan|israel|uae|dubai|abu\\s+dhabi|qatar|saudi\\s+arabia|turkey|brazil|mexico|argentina|colombia|chile|philippines|indonesia|vietnam|thailand|malaysia|south\\s+korea|korea|taiwan|hong\\s+kong|latam|latin\\s+america|apac|pakistan|bangladesh|sri\\s+lanka|nepal|kazakhstan|georgia|armenia|azerbaijan|serbia|ukraine|bahrain|kuwait|oman|jordan|qatar"

/** US state names — restriction terms (in context), e.g. "based in Connecticut". */
const US_STATE_NAMES =
  "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new\\s+hampshire|new\\s+jersey|new\\s+mexico|new\\s+york|north\\s+carolina|north\\s+dakota|ohio|oklahoma|oregon|pennsylvania|rhode\\s+island|south\\s+carolina|south\\s+dakota|tennessee|texas|utah|vermont|virginia|washington|west\\s+virginia|wisconsin|wyoming|district\\s+of\\s+columbia"

/** US state postal codes — ONLY trusted when a US anchor is nearby. */
const US_POSTAL_RE = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/
const US_ANCHOR_RE = /\b(united\s+states|usa|u\.s\.a?|u\.s\.|us)\b/i

const REGION_ALT = `${EU27}|${OTHER_REGIONS}|${US_STATE_NAMES}`

/** Text-level restriction language — region/residency/work-authorization limits. */
export const RESTRICT_RE = new RegExp(
  "\\b(?:us only|uk only|eu only|europe only|canada only|" +
    `(?:${REGION_ALT})\\s+(?:based\\s+)?only\\b` +
    "|us\\s+\\-\\s*remote|remote\\s*[-—,]\\s*(?:us|usa|united states|u\\.s\\.)" +
    "|must\\s+(?:be\\s+)?(?:reside|residing|live|be\\s+based|be\\s+located|be\\s+resident)" +
    "|residents?\\s+only|citizens?\\s+only" +
    "|must\\s+be\\s+authorized" +
    "|work\\s+authori[sz]ation\\s+(?:in|for|required)" +
    "|authorized\\s+to\\s+work\\s+in\\s+(?:the\\s+)?" + `(?:${REGION_ALT})` +
    "|eligible\\s+to\\s+work\\s+in\\s+(?:the\\s+)?" + `(?:${REGION_ALT})` +
    "|no\\s+(?:visa\\s+)?(?:sponsorship|sponsoring)|cannot\\s+(?:provide\\s+)?sponsorship" +
    "|(?:green\\s+card|citizenship|security\\s+clearance)\\s+required" +
    "|candidates?\\s+(?:must|need|should|will)\\s+(?:be|to\\s+be)\\s+(?:based|located|residing|in)\\b" +
    "|(?:located|based|residing|resident)\\s+in\\s+(?:the\\s+)?" + `(?:${REGION_ALT})` +
    "|within\\s+(?:the\\s+)?" + `(?:united states|usa|uk|united kingdom|canada|eu|europe)` +
    ")\\b",
  "i",
)

/** Full-string matcher for a single location-field part, e.g. "Romania", "United States". */
export const LOCATION_RESTRICTED_PART_RE = new RegExp(
  // Bare "US"/"U.S." country codes included here (location-field context
  // only) — deliberately NOT in REGION_ALT, where "us only" would false-
  // positive on prose ("contact us only if…").
  `^(?:${REGION_ALT}|us|u\\.?s\\.?)$`,
  "i",
)

/**
 * US-state-remote location parts: "Remote, CA, US", "Los Angeles, CA, US",
 * "US - Remote", "California, US", "Remote - United States".
 */
export function isUSStateRemoteLocation(part: string): boolean {
  const p = part.trim()
  if (!p) return false
  if (/\b(?:us|u\.s\.)\s*[-—]\s*remote\b/i.test(p)) return true
  if (/\bremote\s*[-—,]\s*(?:us|usa|u\.s\.|united\s+states)\b/i.test(p)) return true
  const hasUS = US_ANCHOR_RE.test(p)
  const cleaned = p.replace(/\bremote\b/gi, " ")
  new RegExp(US_POSTAL_RE.source, "").lastIndex = 0
  const postalHit = US_POSTAL_RE.test(cleaned)
  if (hasUS && postalHit) return true
  const stateNameRe = new RegExp(`\\b(?:${US_STATE_NAMES})\\b`, "i")
  if (hasUS && stateNameRe.test(cleaned)) return true
  // "based in Connecticut" style: state name + remote but no Africa/global anchor
  if (/\bremote\b/i.test(p) && stateNameRe.test(cleaned)) return true
  return false
}

/** Countries named in restriction context — drives country_restrictions UI. */
export function extractRestrictions(text: string): string[] {
  if (!text) return []
  const re = new RegExp(`\\b(?:${REGION_ALT})\\b`, "gi")
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const norm = m[0].trim().replace(/\s+/g, " ")
    if (norm.length <= 3) found.add(norm.toUpperCase())
    else found.add(norm[0].toUpperCase() + norm.slice(1))
    if (found.size >= 8) break
  }
  return Array.from(found)
}

/* ------------------------------------------------------------------ */
/* Outreach — genuine hiring outreach vs marketing/business coverage   */
/* ------------------------------------------------------------------ */

const EMEA_RE = /\bemea\b/i

/** EMEA in HIRING context → the candidate may be in EMEA (includes Africa). */
const EMEA_HIRING_CTX_RE = new RegExp(
  "\\b(?:remote|hiring|hire|hires|role|roles|position|candidate|candidates|applicant|applicants|based|located|reside|residing|live|living|work|working|open|within|anywhere)\\b[^.!?\\n]{0,60}\\bemea\\b" +
    "|\\bemea\\b[^.!?\\n]{0,50}\\b(?:remote|based|hiring|location|preferred|required|only|wide|open|candidates|residents|time ?zones?)\\b",
  "i",
)

/** EMEA in BUSINESS-COVERAGE context → operations/market, not eligibility. */
const EMEA_COVERAGE_CTX_RE = new RegExp(
  "\\b(?:operations|operates|customers|clients|users|teams|employees|staff|business|projects?|markets?|regions?|presence|footprint|offices?|delivery|deployments|support(?:ing|s)?|covers?|serving|servicing)\\b[^.!?\\n]{0,80}\\bemea\\b" +
    "|\\bemea\\b[^.!?\\n]{0,80}\\b(?:region|regions|market|markets|operations|team|customers|clients|coverage|business|presence|offices?)\\b",
  "i",
)

/** Genuine global-hiring outreach language (post dead-zone stripping). */
export const GLOBAL_OUTREACH_RE =
  /\b(?:worldwide|work(?:ing)?\s+from\s+anywhere|anywhere\s+in\s+the\s+world|any\s+(?:location|country|time\s*zone)|remote\s*[-—,]?\s*(?:worldwide|global|globally|anywhere|international)|global(?:ly)?\s+remote|distributed\s+(?:team|workforce)|open\s+(?:to|in)\s+(?:all|any)\s+(?:countries|locations)|hiring\s+(?:globally|worldwide)|work\s+from\s+(?:anywhere|home)\s+(?:globally|worldwide))\b|\bworldwide\b/i

/** A strong global token immediately qualified back to a region is not outreach. */
const LOCAL_QUALIFIER_RE = new RegExp(
  "\\b(?:anywhere|worldwide|remote|global(?:ly)?)\\b[^.!?\\n]{0,50}\\b(?:in|within|across|throughout|based)\\s+(?:the\\s+)?" +
    `(?:${REGION_ALT})\\b`,
  "i",
)

/** "Anywhere Company/Companies" is a US firm name, not outreach. */
const FALSE_OUTREACH_TOKEN_RE = /\banywhere\s+compan(?:y|ies)\b/i

/* ------------------------------------------------------------------ */
/* Eligibility dead zones — text that must never drive eligibility      */
/* ------------------------------------------------------------------ */

/** Remote-board platform filter UI (RemoteOK-style "Regions: …" blocks). */
const REGIONS_BOILER_RE = /Regions?[^\n]{0,200}?(Worldwide|North America|Latin America|Europe|Africa|Middle East|Asia|Oceania)[\s\S]{0,400}?Countries?[:\s]/i

/** Lines that describe business coverage, not hiring eligibility. */
const MARKETING_COVERAGE_LINE_RE = new RegExp(
  "\\b(?:customers?|clients?|businesses|users|partners|companies|organizations|organisations|enterprises|startups|brands|audiences|communities|employers|employees)\\b[^.!?\\n]{0,140}\\b(?:worldwide|global(?:ly)?|around\\s+the\\s+world|across\\s+the\\s+globe|everywhere|international|all\\s+over\\s+the\\s+world)\\b" +
    "|\\b(?:worldwide|global(?:ly)?|around\\s+the\\s+world)\\b[^.!?\\n]{0,90}\\b(?:customers?|clients?|businesses|users|partners?|audience|markets?|operations|footprint|presence|regions?\\s+served|companies|organizations|organisations)\\b",
  "i",
)

/** Lines that are legal/EEO machinery — never eligibility evidence. */
const LEGAL_LINE_RE =
  /\b(equal\s+(?:opportunity|employment)|affirmative\s+action|reasonable\s+accommodation|background\s+checks?|fair\s+chance\s+ordinance|do\s+not\s+discriminate|regard(?:less)?\s+to\s+(?:race|religion|color|national\s+origin)|workplace\s+accommodation|right\s+to\s+work\s+in\s+the\s+country\s+where)\b/i

/** Project/market coverage phrasing ("projects across North America, Asia, and Europe"). */
const PROJECT_COVERAGE_LINE_RE =
  /\b(?:projects?|engagements?|deployments?|implementations?|mandates?|assignments?)\s+(?:across|in|spanning)\s+(?:(?:north|south|latin)\s+)?(?:america|australia|asia|europe|emea|apac|latam|middle\s+east)\b/i

/**
 * Backwards-compatible export kept for consolidated.ts's existing import.
 * Region-boilerplate stripping is a subset of eligibilityScanText.
 */
export function stripRegionBoilerplate(text: string): string {
  if (!text) return text
  return text.replace(REGIONS_BOILER_RE, " ")
}

/**
 * The eligibility scan view of a posting: verbatim text minus every zone
 * that is known to fabricate eligibility signal. Only eligibility/remote
 * decisions and their quotes may be derived from this view — everything
 * else (benefits, skills, salary) continues to use the original text.
 */
export function eligibilityScanText(text: string): string {
  if (!text) return ""
  // 1) Remote-board platform filter UI blocks (can span multiple lines).
  let t = text.replace(REGIONS_BOILER_RE, " ")
  const kept: string[] = []
  for (const line of t.split("\n")) {
    if (REGIONS_BOILER_RE.test(line)) continue
    if (MARKETING_COVERAGE_LINE_RE.test(line)) continue
    if (LEGAL_LINE_RE.test(line)) continue
    if (PROJECT_COVERAGE_LINE_RE.test(line)) continue
    // Coverage-context EMEA with no hiring context on the same line: the
    // "operations across the EMEA region" class — drop the whole line.
    if (EMEA_RE.test(line) && EMEA_COVERAGE_CTX_RE.test(line) && !EMEA_HIRING_CTX_RE.test(line)) continue
    kept.push(line)
  }
  let out = kept.join("\n")
  // Neutralize coverage-context EMEA mentions kept in mixed lines.
  out = out.replace(EMEA_COVERAGE_CTX_RE, (m) =>
    EMEA_HIRING_CTX_RE.test(m) ? m : m.replace(EMEA_RE, "this region"),
  )
  return out
}

/* ------------------------------------------------------------------ */
/* Word-aligned quote extraction                                        */
/* ------------------------------------------------------------------ */

/**
 * Extract a displayable quote around the first match of `re` — aligned to
 * word boundaries at both ends. Proven defect fixed: offset slicing
 * produced "d AI to improve…" / "ues to ensure smooth opera…" inside the
 * database, then rendered to users as verbatim quotes.
 */
export function extractQuote(text: string, re: RegExp, maxLen = 220): string | null {
  if (!text) return null
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g"
  const m = new RegExp(re.source, flags).exec(text)
  if (!m) return null
  const i = m.index ?? 0
  const len = m[0]?.length ?? 0
  const half = Math.floor(maxLen / 2)
  let start = Math.max(0, i - half)
  let end = Math.min(text.length, i + len + half)
  if (start > 0) {
    const sp = text.indexOf(" ", start)
    if (sp !== -1 && sp < i) start = sp + 1
  }
  if (end < text.length) {
    const sp = text.lastIndexOf(" ", end)
    if (sp > i + len) end = sp
  }
  let out = text.slice(start, end).replace(/\s+/g, " ").trim()
  if (!out) return null
  if (start > 0) out = "…" + out
  if (end < text.length) out = out + "…"
  return out.slice(0, 400)
}

/* ------------------------------------------------------------------ */
/* Markdown unescape — models echo source markdown with literal escapes */
/* ------------------------------------------------------------------ */

export function unescapeMarkdown(s: string): string {
  if (!s) return s
  return s.replace(/\\([*_~`#[\](){}\-.+!>])/g, "$1")
}

/* ------------------------------------------------------------------ */
/* Canonical classifier                                                 */
/* ------------------------------------------------------------------ */

export interface GeoVerdict {
  tier: AfricaTier
  reason:
    | "africa-named"
    | "restriction-language"
    | "location-lock"
    | "us-state-remote"
    | "emea-hiring-context"
    | "global-outreach"
    | "no-signal"
  quote: string | null
  restrictions: string[]
}

/**
 * The ONE canonical eligibility verdict. Tiers:
 *   explicit   — Africa/an African country named (word-safe)
 *   restricted — restriction language, location lock, or US-state remote
 *   likely     — hiring-context EMEA or genuine global outreach (dead-zone free)
 *   unknown    — silence is never evidence of openness
 */
export function classifyGeoEligibility(opts: {
  text: string
  locationField?: string | null
  extraFields?: Array<string | null | undefined>
}): GeoVerdict {
  const rawText = [opts.text, ...(opts.extraFields ?? []).filter(Boolean)].join("\n")
  const scan = eligibilityScanText(rawText)
  const scanLower = scan.toLowerCase()
  const locField = (opts.locationField ?? "").trim()
  // Africa terms may live in the location field itself (positive control:
  // Hostaway lists "Ghana, Nigeria, South Africa" as recruit countries).
  const scanLoc = `${scan}\n${locField}`

  // 1) Africa named → explicit (wins even over region carve-outs).
  if (AFRICA_RE.test(scanLoc)) {
    return { tier: "explicit", reason: "africa-named", quote: extractQuote(rawText, AFRICA_RE) || extractQuote(scanLoc, AFRICA_RE), restrictions: [] }
  }

  // 2) Restriction language in the posting.
  if (RESTRICT_RE.test(scanLower)) {
    return { tier: "restricted", reason: "restriction-language", quote: extractQuote(rawText, RESTRICT_RE), restrictions: extractRestrictions(scan) }
  }

  // 3) Location-field lock: every non-global part is a restricted region.
  //    A part that is ITSELF region-locked ("Remote, CA, US") must never
  //    count as the global escape hatch — proven live as the Pinterest
  //    "Remote, CA, US → 90% open to Africa" class.
  // Multi-part locations ("Los Angeles, CA, US; Remote, CA, US") separate on
  // ';' — a comma belongs INSIDE one location phrase, so lock semantics are
  // evaluated on the whole phrase plus its comma segments.
  const locParts = locField.split(";").map((p) => p.trim()).filter(Boolean)
  const segmentsOf = (p: string) => p.split(",").map((x) => x.trim()).filter(Boolean)
  const partIsRestricted = (p: string) =>
    LOCATION_RESTRICTED_PART_RE.test(p) ||
    isUSStateRemoteLocation(p) ||
    segmentsOf(p).some((seg) => LOCATION_RESTRICTED_PART_RE.test(seg))
  const anyRestrictedPart = locParts.some(partIsRestricted)
  const anyGlobalPart = locParts.some(
    (p) => /\b(worldwide|anywhere|remote|africa|african|emea|global|distributed)\b/i.test(p) && !partIsRestricted(p),
  )
  const strongGlobal =
    GLOBAL_OUTREACH_RE.test(scanLower) && !LOCAL_QUALIFIER_RE.test(scanLower) && !FALSE_OUTREACH_TOKEN_RE.test(scanLower)

  if (locField && anyRestrictedPart && !anyGlobalPart && !strongGlobal) {
    const usState = locParts.some((p) => isUSStateRemoteLocation(p))
    return {
      tier: "restricted",
      reason: usState ? "us-state-remote" : "location-lock",
      quote: locField,
      restrictions: extractRestrictions(`${scan} ${locField}`),
    }
  }

  // 4) Hiring-context EMEA → likely (EMEA includes African countries).
  //    Coverage-context EMEA was already stripped/neutralized by scan text.
  if (EMEA_RE.test(scan) && EMEA_HIRING_CTX_RE.test(scan)) {
    return { tier: "likely", reason: "emea-hiring-context", quote: extractQuote(rawText, /\bemea\b/i), restrictions: [] }
  }

  // 5) Genuine global outreach (post dead-zone strip) → likely.
  if (strongGlobal) {
    return { tier: "likely", reason: "global-outreach", quote: extractQuote(rawText, /worldwide|work\s+from\s+anywhere|any\s+(?:location|country|time\s*zone)|globally\s+remote|global\s+remote/i), restrictions: [] }
  }

  return { tier: "unknown", reason: "no-signal", quote: null, restrictions: [] }
}
