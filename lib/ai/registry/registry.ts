/**
 * AI Registry — Single source of truth for all AI agents
 * Future AI features can be added by extending duties, not rewriting system
 */

export type AgentCategory = "observer" | "verifier" | "council" | "policy" | "action" | "audit"
export type AgentModel = "gemini" | "gpt-4o" | "claude-3.5-sonnet" | "rule-based"

export interface AIAgentDefinition {
  id: string // e.g. "observer:job-posts", "verifier:salary", "council:profile-transform"
  name: string
  category: AgentCategory
  description: string
  models: AgentModel[] // for council: multiple models cooperate
  inputs: string[] // e.g. ["job.description_md", "company.website", "apply_url"]
  outputs: string[] // e.g. ["africa_eligibility", "confidence", "evidence"]
  triggers: ("ingest" | "profile_edit" | "login" | "report" | "cron")[]
  rateLimitPerSec: number
  maxRetries: number
  timeoutMs: number
  requiresEvidence: boolean // must return evidence, not guess
  version: number
  enabled: boolean
}

export const AI_REGISTRY: AIAgentDefinition[] = [
  // Observers — watch, produce alerts only, no punishment
  {
    id: "observer:job-posts",
    name: "Job Post Observer",
    category: "observer",
    description: "Watches new job posts for suspicious patterns, spam, fake recruiters",
    models: ["rule-based"],
    inputs: ["job.title", "job.description_md", "job.company", "job.apply_url", "job.source"],
    outputs: ["alert", "suspicion_score", "evidence"],
    triggers: ["ingest"],
    rateLimitPerSec: 10,
    maxRetries: 2,
    timeoutMs: 5000,
    requiresEvidence: true,
    version: 1,
    enabled: true,
  },
  {
    id: "observer:recruiter-actions",
    name: "Recruiter Actions Observer",
    category: "observer",
    description: "Watches recruiter actions, employer behavior, profile edits, login patterns",
    models: ["rule-based"],
    inputs: ["user.login_history", "profile.edits", "company.job_post_frequency"],
    outputs: ["alert", "anomaly_score"],
    triggers: ["login", "profile_edit", "ingest"],
    rateLimitPerSec: 5,
    maxRetries: 1,
    timeoutMs: 5000,
    requiresEvidence: true,
    version: 1,
    enabled: true,
  },
  // Verifiers — verify with evidence, never guess, return UNKNOWN when missing
  {
    id: "verifier:salary",
    name: "Salary Verifier",
    category: "verifier",
    description: "Verifies salary truthfulness, range, currency, period, transparency",
    models: ["gemini"],
    inputs: ["job.description_md", "job.salary_range", "job.apply_url"],
    outputs: ["salary_min", "salary_max", "salary_currency", "salary_is_estimated", "salary_transparency", "confidence", "evidence", "source_urls"],
    triggers: ["ingest"],
    rateLimitPerSec: 2,
    maxRetries: 3,
    timeoutMs: 15000,
    requiresEvidence: true,
    version: 1,
    enabled: true,
  },
  {
    id: "verifier:africa-eligibility",
    name: "Africa Eligibility Verifier",
    category: "verifier",
    description: "Verifies Africa eligibility, country restrictions, visa sponsorship",
    models: ["gemini"],
    inputs: ["job.description_md", "job.location", "job.company"],
    outputs: ["africa_eligibility", "country_restrictions", "visa_sponsorship", "confidence", "evidence"],
    triggers: ["ingest"],
    rateLimitPerSec: 2,
    maxRetries: 3,
    timeoutMs: 15000,
    requiresEvidence: true,
    version: 1,
    enabled: true,
  },
  {
    id: "verifier:remote-policy",
    name: "Remote Policy Verifier",
    category: "verifier",
    description: "Verifies remote policy, timezone requirements, relocation",
    models: ["rule-based", "gemini"],
    inputs: ["job.description_md", "job.location", "job.is_remote"],
    outputs: ["remote_eligibility", "timezone_requirements", "confidence", "evidence"],
    triggers: ["ingest"],
    rateLimitPerSec: 3,
    maxRetries: 2,
    timeoutMs: 10000,
    requiresEvidence: true,
    version: 1,
    enabled: true,
  },
  {
    id: "verifier:company-legitimacy",
    name: "Company Legitimacy Verifier",
    category: "verifier",
    description: "Verifies company legitimacy via website, LinkedIn, logo, curated list",
    models: ["rule-based", "gemini"],
    inputs: ["job.company", "job.company_logo", "job.apply_url"],
    outputs: ["company_legitimacy", "confidence", "evidence"],
    triggers: ["ingest"],
    rateLimitPerSec: 2,
    maxRetries: 3,
    timeoutMs: 15000,
    requiresEvidence: true,
    version: 1,
    enabled: true,
  },
  // Council — route same task to multiple models, check, challenge, resolve
  {
    id: "council:profile-transform",
    name: "Profile Transform Council",
    category: "council",
    description: "Uses 2-3 models together for profile transformation: one checks, another challenges, third resolves. Stores disagreements and consensus.",
    models: ["gemini", "gpt-4o", "claude-3.5-sonnet"],
    inputs: ["profile.raw_cv_text", "profile.skills", "profile.experience"],
    outputs: ["headline", "summary", "skills", "experience", "consensus", "disagreements", "confidence"],
    triggers: ["profile_edit"],
    rateLimitPerSec: 1,
    maxRetries: 2,
    timeoutMs: 30000,
    requiresEvidence: true,
    version: 1,
    enabled: false, // Not yet, plugs into control plane later
  },
  {
    id: "council:fraud-detection",
    name: "Fraud Detection Council",
    category: "council",
    description: "Detects fake recruiters, suspicious employers, spam jobs via multi-model consensus",
    models: ["gemini", "gpt-4o"],
    inputs: ["job", "company", "recruiter.actions", "reports"],
    outputs: ["is_fraud", "confidence", "evidence", "disagreement", "consensus"],
    triggers: ["ingest", "report"],
    rateLimitPerSec: 1,
    maxRetries: 3,
    timeoutMs: 20000,
    requiresEvidence: true,
    version: 1,
    enabled: true,
  },
  // Policy Engine — decides what happens next
  {
    id: "policy:engine",
    name: "Policy Engine",
    category: "policy",
    description: "Decides action from evidence and confidence: allow, warn, hide, soft lock, limit, queue for review, suspend. No permanent bans without review.",
    models: ["rule-based"],
    inputs: ["trust.score", "ai.confidence", "reports.count", "observer.alerts"],
    outputs: ["action", "reason", "next_steps", "appeal_path"],
    triggers: ["ingest", "report", "cron"],
    rateLimitPerSec: 10,
    maxRetries: 0,
    timeoutMs: 2000,
    requiresEvidence: true,
    version: 1,
    enabled: true,
  },
  // Action Engine — executes action
  {
    id: "action:engine",
    name: "Action Engine",
    category: "action",
    description: "Executes chosen action on jobs, recruiters, employers, users. Writes clear user-facing explanations and next steps.",
    models: ["rule-based"],
    inputs: ["policy.action", "job.id", "user.id"],
    outputs: ["executed_action", "explanation", "next_steps", "appeal_path"],
    triggers: ["ingest", "report", "cron"],
    rateLimitPerSec: 10,
    maxRetries: 1,
    timeoutMs: 5000,
    requiresEvidence: true,
    version: 1,
    enabled: true,
  },
  // Audit Log
  {
    id: "audit:logger",
    name: "Audit Logger",
    category: "audit",
    description: "Records every decision, evidence set, model used, confidence, action taken, timestamp. Makes every AI decision traceable.",
    models: ["rule-based"],
    inputs: ["decision", "evidence", "model", "confidence", "action", "timestamp"],
    outputs: ["audit_log_id"],
    triggers: ["ingest", "report", "cron", "profile_edit", "login"],
    rateLimitPerSec: 20,
    maxRetries: 3,
    timeoutMs: 3000,
    requiresEvidence: true,
    version: 1,
    enabled: true,
  },
]

export function getAgentsByCategory(cat: AgentCategory) {
  return AI_REGISTRY.filter(a => a.category === cat && a.enabled)
}

export function getAgentById(id: string) {
  return AI_REGISTRY.find(a => a.id === id)
}

export function getEnabledAgents() {
  return AI_REGISTRY.filter(a => a.enabled)
}
