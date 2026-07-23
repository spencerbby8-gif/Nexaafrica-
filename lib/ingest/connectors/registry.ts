import type { ConnectorMeta } from "./types"
import { INGEST_SOURCES } from "../companies"
import type { AtsKind } from "../companies"

// Convert existing INGEST_SOURCES to new ConnectorMeta with quality scoring
function qualityForAts(ats: AtsKind): "premium" | "verified" | "standard" {
  if (["greenhouse","lever","ashby"].includes(ats)) return "premium"
  if (["workable","smartrecruiters","recruitee"].includes(ats)) return "verified"
  return "standard"
}

function regionsForCompany(company: string): string[] {
  const lower = company.toLowerCase()
  if (["andela","flutterwave","paystack","chipper cash"].includes(lower)) return ["africa","global","africa-friendly"]
  return ["global"]
}

// Existing ATS connectors mapped to new architecture
export const ATS_CONNECTORS: ConnectorMeta[] = INGEST_SOURCES.map(s => ({
  id: `${s.ats}:${s.slug}`,
  ats: s.ats,
  slug: s.slug,
  company: s.company,
  logo: s.logo || null,
  category: "ats" as const,
  quality: qualityForAts(s.ats as AtsKind),
  regions: regionsForCompany(s.company),
  tags: ["engineering","remote"],
  rateLimitMs: 500,
  enabled: true,
  trustScore: qualityForAts(s.ats as AtsKind) === "premium" ? 90 : 70,
}))

// NEW CONNECTORS — prioritizing legitimate remote opportunities for African talent
// These are real public boards/APIs that require no key, suitable for African talent
// Categories: engineering, frontend, backend, mobile, UI/UX, graphic design, product design,
// customer support, virtual assistant, sales, marketing, content, copywriting, social media,
// project management, QA, data entry, bookkeeping, finance, HR, ops, no-code, low-code, AI, entry level

export const NEW_CONNECTORS: ConnectorMeta[] = [
  // Remote-first job boards (public APIs or RSS that are legitimate)
  { id: "remoteok:api", ats: "remoteok", slug: "remoteok", company: "Remote OK Aggregator", category: "remote_board", quality: "verified", regions: ["global","africa-friendly"], tags: ["engineering","design","marketing","remote-first"], rateLimitMs: 1000, enabled: true, trustScore: 75 },
  { id: "weworkremotely:api", ats: "weworkremotely", slug: "weworkremotely", company: "We Work Remotely Aggregator", category: "remote_board", quality: "verified", regions: ["global"], tags: ["programming","design","customer-support","devops"], rateLimitMs: 1000, enabled: false, trustScore: 70 }, // disabled until scraper built
  { id: "remotive:api", ats: "remotive", slug: "remotive", company: "Remotive Aggregator", category: "remote_board", quality: "verified", regions: ["global","africa-friendly"], tags: ["software-dev","customer-support","marketing","design"], rateLimitMs: 1000, enabled: true, trustScore: 75 },

  // Additional Greenhouse boards — curated for Africa-friendly remote
  { id: "greenhouse:doordash", ats: "greenhouse", slug: "doordash", company: "DoorDash", category: "ats", quality: "premium", regions: ["global"], tags: ["engineering"], rateLimitMs: 500, enabled: true, trustScore: 90 },
  { id: "greenhouse:coinbase", ats: "greenhouse", slug: "coinbase", company: "Coinbase", category: "ats", quality: "premium", regions: ["global"], tags: ["engineering","finance"], rateLimitMs: 500, enabled: true, trustScore: 90 },
  { id: "greenhouse:datadog", ats: "greenhouse", slug: "datadog", company: "Datadog", category: "ats", quality: "premium", regions: ["global"], tags: ["engineering","data"], rateLimitMs: 500, enabled: true, trustScore: 90 },
  { id: "greenhouse:elastic", ats: "greenhouse", slug: "elastic", company: "Elastic", category: "ats", quality: "premium", regions: ["global"], tags: ["engineering"], rateLimitMs: 500, enabled: true, trustScore: 90 },
  { id: "greenhouse:hashicorp", ats: "greenhouse", slug: "hashicorp", company: "HashiCorp", category: "ats", quality: "premium", regions: ["global"], tags: ["engineering","devops"], rateLimitMs: 500, enabled: true, trustScore: 90 },
  { id: "greenhouse:gitlab", ats: "greenhouse", slug: "gitlab", company: "GitLab", category: "ats", quality: "premium", regions: ["global","africa-friendly"], tags: ["engineering","remote-first"], rateLimitMs: 500, enabled: true, trustScore: 92 },
  { id: "greenhouse:openai", ats: "greenhouse", slug: "openai", company: "OpenAI", category: "ats", quality: "premium", regions: ["global"], tags: ["ai","engineering"], rateLimitMs: 500, enabled: false, trustScore: 90 }, // use Ashby openai instead
  { id: "greenhouse:sourcegraph", ats: "greenhouse", slug: "sourcegraph", company: "Sourcegraph", category: "ats", quality: "premium", regions: ["global"], tags: ["engineering","ai"], rateLimitMs: 500, enabled: true, trustScore: 88 },

  // Additional Ashby boards — high quality remote-first
  { id: "ashby:zapier", ats: "ashby", slug: "zapier", company: "Zapier", category: "ats", quality: "premium", regions: ["global","africa-friendly"], tags: ["engineering","no-code","automation"], rateLimitMs: 500, enabled: true, trustScore: 92 },
  { id: "ashby:doordash", ats: "ashby", slug: "doordash", company: "DoorDash", category: "ats", quality: "premium", regions: ["global"], tags: ["engineering"], rateLimitMs: 500, enabled: false, trustScore: 90 },
  { id: "ashby:notion", ats: "ashby", slug: "notion", company: "Notion", category: "ats", quality: "premium", regions: ["global","africa-friendly"], tags: ["engineering","product","design"], rateLimitMs: 500, enabled: true, trustScore: 90 },
  { id: "ashby:figma", ats: "ashby", slug: "figma", company: "Figma", category: "ats", quality: "premium", regions: ["global"], tags: ["design","engineering"], rateLimitMs: 500, enabled: true, trustScore: 90 },
  { id: "ashby:deel", ats: "ashby", slug: "deel", company: "Deel", category: "ats", quality: "premium", regions: ["global","africa-friendly"], tags: ["fintech","hr","global-payroll"], rateLimitMs: 500, enabled: true, trustScore: 90 },
  { id: "ashby:remote", ats: "ashby", slug: "remote", company: "Remote", category: "ats", quality: "premium", regions: ["global","africa-friendly"], tags: ["hr","global"], rateLimitMs: 500, enabled: true, trustScore: 92 },

  // Lever — additional
  { id: "lever:affirm", ats: "lever", slug: "affirm", company: "Affirm", category: "ats", quality: "premium", regions: ["global"], tags: ["fintech","engineering"], rateLimitMs: 500, enabled: true, trustScore: 88 },
  { id: "lever:atlassian", ats: "lever", slug: "atlassian", company: "Atlassian", category: "ats", quality: "premium", regions: ["global"], tags: ["engineering","product"], rateLimitMs: 500, enabled: true, trustScore: 88 },

  // Entry level & non-tech remote (suitable for Africa)
  { id: "greenhouse:zapier", ats: "greenhouse", slug: "zapier", company: "Zapier", category: "ats", quality: "premium", regions: ["global","africa-friendly"], tags: ["customer-support","no-code","marketing"], rateLimitMs: 500, enabled: true, trustScore: 90 },
  { id: "greenhouse:invision", ats: "greenhouse", slug: "invisionapp", company: "InVision", category: "ats", quality: "standard", regions: ["global"], tags: ["design","product-design"], rateLimitMs: 500, enabled: true, trustScore: 70 },
]

export const ALL_CONNECTORS: ConnectorMeta[] = [...ATS_CONNECTORS, ...NEW_CONNECTORS]

export function getEnabledConnectors(): ConnectorMeta[] {
  return ALL_CONNECTORS.filter(c => c.enabled)
}

export function getConnectorsByCategory(cat: string): ConnectorMeta[] {
  return ALL_CONNECTORS.filter(c => c.tags.includes(cat) || c.category === cat)
}

export function getAfricaFriendlyConnectors(): ConnectorMeta[] {
  return ALL_CONNECTORS.filter(c => c.regions.includes("africa-friendly") || c.regions.includes("africa") || c.regions.includes("global"))
}
