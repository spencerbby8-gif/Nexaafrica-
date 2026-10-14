/** Role-specific source evidence, not mentions of markets/customers or generic company reach. */
const REGION = String.raw`(?:u\.?s\.?a?\.?|united\s+states|u\.?k\.?|united\s+kingdom|canada|europe(?:an\s+union)?|eu|germany|france|spain|italy|netherlands|ireland|portugal|australia|new\s+zealand|india|singapore|japan|china|brazil|mexico)`
const ROLE_RESTRICTIONS = [
  new RegExp(String.raw`\b(?:remote(?:ly)?\s*(?:[-—:]\s*|(?:in|within|from)\s+)|anywhere\s+(?:in|within)\s+)(?:the\s+)?${REGION}(?=\W|$)`, 'i'),
  new RegExp(String.raw`\b(?:must\s+(?:be\s+)?(?:based|located|resid(?:e|ing)|live)|(?:candidates?|applicants?)\s+(?:must|need\s+to)\s+(?:be\s+)?(?:based|located|resid(?:e|ing)|live))\s+in\s+(?:the\s+)?${REGION}(?=\W|$)`, 'i'),
  new RegExp(String.raw`\b(?:authorized\s+to\s+work|work\s+authori[sz]ation\s+(?:required\s+)?)\s+(?:in|for)\s+(?:the\s+)?${REGION}(?=\W|$)`, 'i'),
  new RegExp(String.raw`\b${REGION}\s+(?:only|residents?\s+only|citizens?\s+only)(?=\W|$)`, 'i'),
]

export function roleRestriction(text: string): string | null {
  for (const pattern of ROLE_RESTRICTIONS) {
    const match = pattern.exec(text)
    if (match) return match[0]
  }
  return null
}

const GLOBAL_HIRING = /\b(?:(?:hire|hiring|recruiting|recruit)\s+(?:remotely\s+|candidates?\s+|talent\s+|people\s+|from\s+|across\s+)*(?:worldwide|globally|anywhere|emea|any\s+time\s*zone)|(?:open\s+to|accepting|welcome)\s+(?:remote\s+)?(?:candidates?|applicants?|applications|talent)\s+(?:from\s+|across\s+|in\s+)*(?:worldwide|globally|anywhere|emea|africa)|(?:you\s+can\s+)?work\s+from\s+anywhere|globally\s+remote\s+(?:role|position|job)|remote\s*[\[(—,:-]?\s*(?:worldwide|global|anywhere|international|emea))\b/i
const AFRICAN_HIRING = /\b(?:hire|hiring|recruiting|recruit|open\s+to|accepting|welcome|candidates?\s+(?:in|from)|applicants?\s+(?:in|from)|(?:must\s+be\s+)?(?:based|located)\s+in|remote\s+(?:in|from)|work\s+from|location\s*:)\b[^.!?\n]{0,65}\b(?:africa|african|nigeria|kenya|ghana|south\s+africa|egypt|morocco|rwanda|uganda|ethiopia|tanzania|senegal|cameroon|zambia|zimbabwe|tunisia|algeria)\b/i

export function globalHiringEvidence(text: string): string | null {
  if (/\b(?:within|in)\s+(?:your|the)\s+country\s+of\s+employment\b/i.test(text)) return null
  if (roleRestriction(text) || /\banywhere\s+compan(?:y|ies)\b/i.test(text)) return null
  const match = GLOBAL_HIRING.exec(text)
  if (!match) return null
  const sentenceStart = Math.max(text.lastIndexOf('.', match.index), text.lastIndexOf('\n', match.index)) + 1
  const context = text.slice(sentenceStart, match.index).toLowerCase()
  if (/\b(?:customers?|clients?|products?|platform|software\s+enables|users?)\b/.test(context)) return null
  return match[0]
}

export function africanHiringEvidence(text: string): string | null {
  if (roleRestriction(text)) return null
  return AFRICAN_HIRING.exec(text)?.[0] ?? null
}
