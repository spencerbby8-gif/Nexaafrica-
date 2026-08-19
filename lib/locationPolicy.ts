/**
 * [PHASE-2] ONE shared location-eligibility policy, used by both the ingest
 * classifier (lib/ingest/normalize.ts) and the pre-AI admission gate
 * (lib/ai/admission.ts). Created because the two copies drifted and both only
 * understood WESTERN restriction patterns — a Guangzhou-bound role passed as
 * remote/Africa-open ("likely") simply because China is not on the Western
 * list while the source feed claimed is_remote=true.
 *
 * Generic rule (no hardcoded countries-of-concern):
 *   A posting whose location names a SPECIFIC place (anything that is not a
 *   global token and not an African location) is location-bound UNLESS the
 *   description carries STRONG global outreach (worldwide/anywhere/EMEA/
 *   Africa/any timezone/remote-global). Weak boilerplate ("global team",
 *   "remote friendly") does not unlock a specific location — same standard
 *   the Western location lock already applied.
 *
 * Truth rules honored:
 *   - 'unknown' is never promoted: a bound job becomes restricted (excluded),
 *     never likely/explicit.
 *   - Worldwide/Africa-compatible postings pass: global location tokens and
 *     African locations are never bound; description outreach unlocks.
 */

/** Location parts that mean "not tied to one place". */
export const GLOBAL_LOCATION_RE =
  /\b(worldwide|anywhere|remote|africa|emea|global|international|earth|world)\b/i

/** Locations on the African continent are our market — never location-bound.
 * Countries + major hiring hubs (inclusion list — extending it only ever
 * KEEPS more jobs eligible). */
export const AFRICA_LOCATION_RE =
  /\b(africa|nigeria|kenya|south\s+africa|ghana|egypt|morocco|rwanda|uganda|ethiopia|tanzania|ivory\s+coast|cote\s+d'ivoire|senegal|cameroon|zimbabwe|zambia|botswana|namibia|mozambique|malawi|angola|congo|somalia|sudan|libya|algeria|tunisia|mauritius|madagascar|lagos|abuja|accra|nairobi|mombasa|kigali|kampala|addis\s+ababa|dar\s+es\s+salaam|cairo|alexandria|casablanca|rabat|cape\s+town|johannesburg|pretoria|durban|tunis|algiers|dakar|kumasi|abenk?)\b/i

/** Western-style restricted regions (unchanged legacy list — kept for reason clarity). */
export const LOCATION_RESTRICTED_RE = /^(?:us|usa|u\.?s\.?|united\s+states|uk|u\.?k\.?|united\s+kingdom|canada|eu|europe|germany|france|spain|italy|netherlands|poland|sweden|norway|denmark|finland|belgium|austria|switzerland|ireland|portugal|australia|new\s+zealand|india|singapore|japan|israel|uae|dubai|qatar|saudi\s+arabia|turkey|brazil|mexico|argentina|colombia|chile|philippines|indonesia|vietnam|thailand|malaysia|south\s+korea|taiwan|hong\s+kong|latam|apac)$/i

/** Strong global outreach in the posting text. */
const STRONG_GLOBAL_RE =
  /\b(worldwide|anywhere|emea|africa\b|any\s+(time\s*zone|location|country)|remote\s*[-—,]?\s*(global|worldwide|anywhere|international))\b/i

/** A strong token qualified back to a restricted region is NOT outreach. */
const LOCAL_QUALIFIER_RE =
  /\b(?:anywhere|worldwide|remote|global(?:ly)?)\b[^.!?\n]{0,50}\b(?:in|within|across|throughout|based)\s+(?:the\s+)?(?:us|usa|united\s+states|uk|u\.?k\.?|united\s+kingdom|canada|europe|eu|germany|france|spain|italy|netherlands|poland|sweden|norway|denmark|finland|belgium|austria|switzerland|ireland|portugal|australia|new\s+zealand|india|singapore|japan|israel|uae|dubai|qatar|saudi\s+arabia|turkey|brazil|mexico|argentina|colombia|chile|philippines|indonesia|vietnam|thailand|malaysia|south\s+korea|taiwan|hong\s+kong|latam|apac)\b/i

/** "Anywhere Company" is a US firm name, not outreach. */
const FALSE_TOKEN_RE = /\banywhere\s+compan(y|ies)\b/i

/** Country values that are normalization defaults / global buckets, not evidence of a specific place. */
const GLOBAL_COUNTRY_VALUES = new Set([
  '', 'worldwide', 'anywhere', 'remote', 'africa', 'emea', 'global', 'international', 'world',
])

export function hasStrongGlobalOutreach(descriptionText: string): boolean {
  return (
    STRONG_GLOBAL_RE.test(descriptionText) &&
    !LOCAL_QUALIFIER_RE.test(descriptionText) &&
    !FALSE_TOKEN_RE.test(descriptionText)
  )
}

function isGlobalPart(part: string): boolean {
  return GLOBAL_LOCATION_RE.test(part)
}

function isAfricaPart(part: string): boolean {
  return AFRICA_LOCATION_RE.test(part)
}

export type LocationVerdict =
  | { bound: false }
  | { bound: true; kind: 'restricted_region' | 'specific_location' }

/**
 * Evaluate location-bound status.
 *
 * @param locationField raw posting location (may be comma list); may be null
 * @param countryField  normalized country value; may be null
 * @param descriptionText joined posting text (description + title etc.)
 */
export function evaluateLocationPolicy(
  locationField: string | null | undefined,
  countryField: string | null | undefined,
  descriptionText: string,
): LocationVerdict {
  const outreach = hasStrongGlobalOutreach(descriptionText)

  // ── Legacy Western restriction lock (behavior preserved) ─────────────
  // Location parts and the country value are tested SEPARATELY against the
  // anchored restricted-region list (never as one concatenated string).
  const locPartsWest = (locationField || '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean)
  const countryTrimmed = (countryField || '').trim()
  const anyRestrictedPart =
    locPartsWest.some((p) => LOCATION_RESTRICTED_RE.test(p)) ||
    (countryTrimmed.length > 0 && LOCATION_RESTRICTED_RE.test(countryTrimmed))
  const anyGlobalPart =
    locPartsWest.some((p) => isGlobalPart(p)) || isGlobalPart(countryTrimmed)
  if (anyRestrictedPart && !anyGlobalPart && !outreach) {
    return { bound: true, kind: 'restricted_region' }
  }

  // ── Generic location-bound rule (Phase 2) ────────────────────────────
  // A specific place anywhere in the location field binds the posting,
  // regardless of the (often defaulted) country value.
  // A list with ANY African part is Africa-anchored (e.g. "Lagos, Nigeria");
  // only lists with no global AND no African parts are location-bound.
  const anyAfricaPart = locPartsWest.some((p) => isAfricaPart(p))
  const specificLocPart = !anyAfricaPart && locPartsWest.some((p) => !isGlobalPart(p))

  // A non-global country value also names a specific place — except the
  // normalization defaults ('Worldwide' etc.) which prove nothing.
  const c = (countryField || '').trim().toLowerCase()
  const specificCountry = c.length > 0 && !GLOBAL_COUNTRY_VALUES.has(c) && !isAfricaPart(c)

  if ((specificLocPart || specificCountry) && !outreach) {
    return { bound: true, kind: 'specific_location' }
  }

  return { bound: false }
}
