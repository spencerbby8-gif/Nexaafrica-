/**
 * ATS (Applicant Tracking System) Compatibility Scoring
 * 
 * Analyzes profile for ATS-friendly patterns and keyword optimization.
 * Provides actionable suggestions to improve pass-through rates.
 */

import type { ParsedProfile } from "./types"

export interface ATSScore {
  overall: number // 0-100
  keywordDensity: { [key: string]: number }
  issues: ATSIssue[]
  suggestions: string[]
  breakdown: {
    formatting: number
    keywords: number
    completeness: number
  }
}

export interface ATSIssue {
  type: 'low_keyword_density' | 'unfriendly_format' | 'missing_section' | 'special_chars' | 'too_short'
  severity: 'error' | 'warning' | 'info'
  message: string
  field?: string
}

// Common ATS keywords by role category
const ROLE_KEYWORDS: { [key: string]: string[] } = {
  'software engineer': [
    'react', 'typescript', 'javascript', 'node', 'python', 'java', 'api', 'database',
    'agile', 'git', 'testing', 'debugging', 'architecture', 'microservices', 'cloud',
    'aws', 'azure', 'docker', 'kubernetes', 'ci/cd', 'sql', 'mongodb', 'postgresql'
  ],
  'product manager': [
    'roadmap', 'stakeholder', 'user research', 'analytics', 'strategy', 'agile',
    'prioritization', 'metrics', 'kpi', 'okr', 'user stories', 'backlog', 'sprint',
    'cross-functional', 'go-to-market', 'product lifecycle', 'user experience'
  ],
  'designer': [
    'figma', 'user experience', 'wireframe', 'prototype', 'design system', 'accessibility',
    'user research', 'usability', 'interaction design', 'visual design', 'sketch',
    'adobe', 'invision', 'user flows', 'information architecture', 'responsive design'
  ],
  'data scientist': [
    'python', 'r', 'machine learning', 'statistics', 'sql', 'pandas', 'numpy',
    'tensorflow', 'pytorch', 'data visualization', 'tableau', 'power bi', 'etl',
    'data pipeline', 'predictive modeling', 'regression', 'classification', 'clustering'
  ],
  'marketing': [
    'seo', 'sem', 'content marketing', 'social media', 'analytics', 'google analytics',
    'campaign', 'conversion', 'funnel', 'email marketing', 'brand', 'copywriting',
    'market research', 'customer acquisition', 'retention', 'roi', 'a/b testing'
  ],
  'sales': [
    'b2b', 'b2c', 'saas', 'crm', 'salesforce', 'hubspot', 'pipeline', 'quota',
    'revenue', 'account management', 'business development', 'negotiation',
    'cold calling', 'lead generation', 'closing', 'customer success'
  ],
  'customer support': [
    'customer service', 'ticketing', 'zendesk', 'intercom', 'sla', 'csat', 'nps',
    'troubleshooting', 'escalation', 'knowledge base', 'chat', 'email support',
    'phone support', 'customer satisfaction', 'retention', 'onboarding'
  ],
  'operations': [
    'process improvement', 'workflow', 'automation', 'efficiency', 'logistics',
    'supply chain', 'inventory', 'vendor management', 'budget', 'compliance',
    'risk management', 'project management', 'stakeholder', 'cross-functional'
  ],
  'finance': [
    'financial analysis', 'budgeting', 'forecasting', 'variance analysis', 'p&l',
    'cash flow', 'excel', 'financial modeling', 'audit', 'compliance', 'gaap',
    'ifrs', 'erp', 'sap', 'quickbooks', 'accounts payable', 'accounts receivable'
  ],
  'human resources': [
    'recruitment', 'talent acquisition', 'onboarding', 'performance management',
    'employee relations', 'hris', 'workday', 'bamboo hr', 'benefits administration',
    'compensation', 'training', 'development', 'diversity', 'inclusion', 'compliance'
  ]
}

// ATS-unfriendly patterns
const UNFRIENDLY_PATTERNS = [
  { pattern: /\|{2,}/, message: 'Multiple consecutive pipes (||)' },
  { pattern: /[^\x00-\x7F]/, message: 'Non-ASCII characters (except in names)' },
  { pattern: /\[.*\]\(.*\)/, message: 'Markdown links [text](url)' },
  { pattern: /<[^>]+>/, message: 'HTML tags' },
  { pattern: /\{[^}]+\}/, message: 'Curly braces (template syntax)' },
]

/**
 * Detect role category from profile content
 */
function detectRoleCategory(profile: ParsedProfile): string | null {
  const text = `${profile.headline} ${profile.summary} ${profile.skills.join(' ')} ${profile.experience.map(e => `${e.title} ${e.description}`).join(' ')}`.toLowerCase()
  
  // Simple keyword matching to detect role
  const roleScores: { [key: string]: number } = {}
  
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    let score = 0
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score++
      }
    }
    if (score > 0) {
      roleScores[role] = score
    }
  }
  
  // Return role with highest score
  const sortedRoles = Object.entries(roleScores).sort((a, b) => b[1] - a[1])
  return sortedRoles.length > 0 ? sortedRoles[0][0] : null
}

/**
 * Score ATS compatibility of a profile
 */
export function scoreATSCompatibility(
  profile: ParsedProfile,
  targetRole?: string
): ATSScore {
  const issues: ATSIssue[] = []
  const suggestions: string[] = []
  
  // Detect role if not provided
  const detectedRole = targetRole || detectRoleCategory(profile)
  const targetKeywords = detectedRole ? ROLE_KEYWORDS[detectedRole] || [] : []
  
  // Combine all text for analysis
  const text = `${profile.headline} ${profile.summary} ${profile.skills.join(' ')} ${profile.experience.map(e => e.description).join(' ')}`
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0)
  const wordCount = words.length
  
  // 1. Check for ATS-unfriendly patterns
  let formattingScore = 100
  for (const { pattern, message } of UNFRIENDLY_PATTERNS) {
    if (pattern.test(text)) {
      issues.push({
        type: 'unfriendly_format',
        severity: 'warning',
        message: `ATS-unfriendly pattern detected: ${message}`,
      })
      formattingScore -= 10
    }
  }
  
  // 2. Keyword density analysis
  const keywordDensity: { [key: string]: number } = {}
  let keywordScore = 100
  
  for (const keyword of targetKeywords) {
    const count = words.filter(w => w.includes(keyword.toLowerCase())).length
    const density = wordCount > 0 ? (count / wordCount) * 100 : 0
    keywordDensity[keyword] = density
    
    if (density < 0.5) {
      issues.push({
        type: 'low_keyword_density',
        severity: 'info',
        message: `Keyword "${keyword}" appears ${count} time${count !== 1 ? 's' : ''} (${density.toFixed(2)}% density)`,
      })
      suggestions.push(`Consider adding "${keyword}" to your profile for ${detectedRole} roles`)
      keywordScore -= 2
    } else if (density > 5) {
      issues.push({
        type: 'low_keyword_density',
        severity: 'warning',
        message: `Keyword "${keyword}" may be overused (${density.toFixed(2)}% density)`,
      })
      keywordScore -= 5
    }
  }
  
  // 3. Section completeness
  let completenessScore = 100
  
  if (!profile.headline || profile.headline.length < 20) {
    issues.push({
      type: 'missing_section',
      severity: 'error',
      message: 'Headline is missing or too short (minimum 20 characters)',
      field: 'headline'
    })
    completenessScore -= 20
  } else if (profile.headline.length > 80) {
    issues.push({
      type: 'too_short',
      severity: 'warning',
      message: `Headline is too long (${profile.headline.length} characters, maximum 80)`,
      field: 'headline'
    })
    completenessScore -= 5
  }
  
  if (!profile.summary || profile.summary.length < 200) {
    issues.push({
      type: 'missing_section',
      severity: 'warning',
      message: `Summary is too short (${profile.summary?.length || 0} characters, target 300-600)`,
      field: 'summary'
    })
    completenessScore -= 15
  }
  
  if (profile.skills.length < 8) {
    issues.push({
      type: 'missing_section',
      severity: 'warning',
      message: `Only ${profile.skills.length} skills listed (target: 12-24)`,
      field: 'skills'
    })
    completenessScore -= 10
  } else if (profile.skills.length > 30) {
    issues.push({
      type: 'missing_section',
      severity: 'info',
      message: `${profile.skills.length} skills listed (consider focusing on top 15-20)`,
      field: 'skills'
    })
    completenessScore -= 5
  }
  
  if (profile.experience.length === 0) {
    issues.push({
      type: 'missing_section',
      severity: 'error',
      message: 'No experience listed',
      field: 'experience'
    })
    completenessScore -= 30
  } else if (profile.experience.length < 2) {
    issues.push({
      type: 'missing_section',
      severity: 'warning',
      message: `Only ${profile.experience.length} experience entr${profile.experience.length === 1 ? 'y' : 'ies'} listed`,
      field: 'experience'
    })
    completenessScore -= 10
  }
  
  // Check experience descriptions
  for (let i = 0; i < profile.experience.length; i++) {
    const exp = profile.experience[i]
    if (!exp.description || exp.description.length < 100) {
      issues.push({
        type: 'too_short',
        severity: 'warning',
        message: `Experience #${i + 1} (${exp.title}) has short description (${exp.description?.length || 0} characters, target 200-400)`,
        field: `experience[${i}]`
      })
      completenessScore -= 5
    }
  }
  
  // Calculate overall score
  formattingScore = Math.max(0, formattingScore)
  keywordScore = Math.max(0, keywordScore)
  completenessScore = Math.max(0, completenessScore)
  
  const overall = Math.round(
    formattingScore * 0.3 +
    keywordScore * 0.3 +
    completenessScore * 0.4
  )
  
  return {
    overall,
    keywordDensity,
    issues,
    suggestions,
    breakdown: {
      formatting: formattingScore,
      keywords: keywordScore,
      completeness: completenessScore
    }
  }
}

/**
 * Format ATS score for display
 */
export function formatATSScore(score: ATSScore): string {
  const emoji = score.overall >= 80 ? '🟢' : score.overall >= 60 ? '🟡' : '🔴'
  return `${emoji} ATS Score: ${score.overall}/100`
}

/**
 * Legacy ATS result type for backward compatibility
 */
export interface AtsResult {
  score: number
  breakdown: {
    keywords: number
    clarity: number
    impact: number
    recruiterFit: number
    remoteReadiness: number
  }
  reasons: string[]
  improvements: Array<{ type: string; field: string; after: string; reason: string }>
}

/**
 * Legacy calculateAtsScore function for backward compatibility
 */
export function calculateAtsScore(
  profile: ParsedProfile,
  rawText?: string
): AtsResult {
  const result = scoreATSCompatibility(profile)
  
  // Map new breakdown to old structure
  // Old: keywords (25), clarity (20), impact (25), recruiterFit (15), remoteReadiness (15) = 100
  // New: formatting (30), keywords (30), completeness (40) = 100
  
  const keywords = Math.round(result.breakdown.keywords * 0.25)
  const clarity = Math.round(result.breakdown.formatting * 0.20)
  const impact = Math.round(result.breakdown.completeness * 0.25)
  const recruiterFit = Math.round((result.breakdown.keywords + result.breakdown.completeness) * 0.15 / 2)
  const remoteReadiness = Math.round(result.breakdown.formatting * 0.15)
  
  // Generate reasons from suggestions
  const reasons = result.suggestions.slice(0, 5)
  
  // Generate improvements list with proper structure
  const improvements: Array<{ type: string; field: string; after: string; reason: string }> = []
  
  if (profile.headline && profile.headline.length > 0) {
    improvements.push({
      type: 'headline',
      field: 'headline',
      after: profile.headline.slice(0, 100),
      reason: 'Crafted compelling headline with role + superpower formula'
    })
  }
  
  if (profile.summary && profile.summary.length >= 300) {
    improvements.push({
      type: 'summary',
      field: 'summary',
      after: profile.summary.slice(0, 200) + '...',
      reason: 'Wrote rich 3-4 sentence summary with remote-readiness focus'
    })
  }
  
  if (profile.skills.length >= 12) {
    improvements.push({
      type: 'skills',
      field: 'skills',
      after: profile.skills.slice(0, 10).join(', ') + (profile.skills.length > 10 ? '...' : ''),
      reason: `Extracted ${profile.skills.length} relevant skills (target: 12-24)`
    })
  }
  
  if (profile.experience.length > 0) {
    const avgDescLength = profile.experience.reduce((sum, exp) => sum + (exp.description?.length || 0), 0) / profile.experience.length
    if (avgDescLength >= 200) {
      improvements.push({
        type: 'experience',
        field: 'experience',
        after: `${profile.experience.length} roles with detailed descriptions`,
        reason: 'Transformed experience into STAR-format achievements'
      })
    }
  }
  
  // Add suggestions as improvements
  for (const suggestion of result.suggestions.slice(0, 2)) {
    improvements.push({
      type: 'suggestion',
      field: 'general',
      after: suggestion,
      reason: 'ATS optimization recommendation'
    })
  }
  
  return {
    score: result.overall,
    breakdown: {
      keywords,
      clarity,
      impact,
      recruiterFit,
      remoteReadiness,
    },
    reasons,
    improvements: improvements.slice(0, 6), // Top 6 improvements
  }
}

/**
 * Get ATS label and color for display
 */
export function getAtsLabel(score: number): { label: string; color: string } {
  if (score >= 80) {
    return { label: 'Excellent', color: 'text-green-600' }
  } else if (score >= 60) {
    return { label: 'Good', color: 'text-yellow-600' }
  } else if (score >= 40) {
    return { label: 'Fair', color: 'text-orange-600' }
  } else {
    return { label: 'Needs Improvement', color: 'text-red-600' }
  }
}
