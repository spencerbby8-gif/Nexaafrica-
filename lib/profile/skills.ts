/**
 * Skill Categorization
 * 
 * Categorizes skills into technical, soft, tools, languages, and other.
 * Helps recruiters quickly assess skill depth and relevance.
 */

export interface CategorizedSkills {
  technical: string[]
  soft: string[]
  tools: string[]
  languages: string[]
  other: string[]
}

// Technical skill patterns
const TECHNICAL_PATTERNS = [
  // Programming languages
  /\b(javascript|typescript|python|java|c\+\+|c#|ruby|php|go|rust|swift|kotlin|scala|r|matlab)\b/i,
  // Web technologies
  /\b(react|angular|vue|svelte|next\.js|nuxt\.js|node\.js|express|django|flask|spring|laravel)\b/i,
  /\b(html|css|sass|less|tailwind|bootstrap|webpack|vite|babel)\b/i,
  // Databases
  /\b(sql|mysql|postgresql|mongodb|redis|elasticsearch|dynamodb|cassandra|oracle|sqlite)\b/i,
  // Cloud & DevOps
  /\b(aws|azure|gcp|docker|kubernetes|terraform|ansible|jenkins|circleci|github actions|gitlab ci)\b/i,
  /\b(cloud|microservices|api|rest|graphql|grpc|serverless|lambda|ec2|s3)\b/i,
  // Data & ML
  /\b(machine learning|deep learning|artificial intelligence|ai|ml|data science|data analytics)\b/i,
  /\b(tensorflow|pytorch|scikit-learn|pandas|numpy|spark|hadoop|kafka)\b/i,
  /\b(regression|classification|clustering|neural networks|nlp|computer vision)\b/i,
  // Mobile
  /\b(ios|android|react native|flutter|swift|kotlin|xamarin|ionic)\b/i,
  // Security
  /\b(cybersecurity|encryption|authentication|authorization|oauth|jwt|ssl|tls)\b/i,
  // Testing
  /\b(unit testing|integration testing|e2e testing|jest|mocha|cypress|selenium|junit)\b/i,
  // Architecture
  /\b(system design|architecture|scalability|performance|optimization|caching|load balancing)\b/i,
]

// Soft skill patterns
const SOFT_PATTERNS = [
  /\b(leadership|team leadership|people management|mentoring|coaching)\b/i,
  /\b(communication|verbal communication|written communication|presentation|public speaking)\b/i,
  /\b(teamwork|collaboration|cross-functional|interpersonal|relationship building)\b/i,
  /\b(problem solving|critical thinking|analytical|strategic thinking|decision making)\b/i,
  /\b(project management|program management|agile|scrum|kanban|waterfall|pmp)\b/i,
  /\b(time management|organization|prioritization|multitasking|attention to detail)\b/i,
  /\b(adaptability|flexibility|resilience|change management|continuous learning)\b/i,
  /\b(creativity|innovation|design thinking|brainstorming|ideation)\b/i,
  /\b(negotiation|persuasion|influence|conflict resolution|diplomacy)\b/i,
  /\b(customer service|client relations|stakeholder management|account management)\b/i,
  /\b(emotional intelligence|empathy|active listening|cultural awareness)\b/i,
  /\b(work ethic|reliability|accountability|integrity|professionalism)\b/i,
]

// Tools & software patterns
const TOOLS_PATTERNS = [
  // Design tools
  /\b(figma|sketch|adobe xd|invision|framer|balsamiq|axure)\b/i,
  /\b(photoshop|illustrator|indesign|after effects|premiere|lightroom)\b/i,
  // Project management
  /\b(jira|confluence|trello|asana|monday\.com|notion|clickup|basecamp|wrike)\b/i,
  // Communication
  /\b(slack|microsoft teams|zoom|google meet|discord|webex)\b/i,
  // Development
  /\b(github|gitlab|bitbucket|vscode|visual studio|intellij|eclipse|sublime|vim|emacs)\b/i,
  /\b(postman|insomnia|swagger|openapi|curl)\b/i,
  // Analytics & BI
  /\b(google analytics|mixpanel|amplitude|segment|heap|hotjar)\b/i,
  /\b(tableau|power bi|looker|metabase|superset|excel|google sheets)\b/i,
  // Marketing
  /\b(hubspot|salesforce|marketo|mailchimp|constant contact|sendgrid)\b/i,
  /\b(google ads|facebook ads|linkedin ads|sem|seo|ahrefs|semrush|moz)\b/i,
  // CRM & Support
  /\b(zendesk|intercom|freshdesk|help scout|drift|livechat)\b/i,
  // Productivity
  /\b(microsoft office|google workspace|office 365|outlook|gmail|calendar)\b/i,
  /\b(dropbox|google drive|onedrive|box|evernote)\b/i,
]

// Language patterns
const LANGUAGE_PATTERNS = [
  // Language names
  /\b(english|spanish|french|german|italian|portuguese|dutch|russian|chinese|mandarin|cantonese)\b/i,
  /\b(japanese|korean|arabic|hindi|urdu|bengali|punjabi|tamil|telugu|marathi|gujarati)\b/i,
  /\b(yoruba|hausa|igbo|swahili|amharic|zulu|xhosa|afrikaans|somali|oromo)\b/i,
  /\b(turkish|persian|hebrew|greek|polish|czech|hungarian|romanian|bulgarian|croatian|serbian)\b/i,
  // Proficiency levels
  /\b(native|fluent|proficient|advanced|intermediate|beginner|basic|conversational)\b/i,
  /\b(bilingual|multilingual|polyglot)\b/i,
  // Certifications
  /\b(toefl|ielts|tefl|tesol|celpip|cambridge)\b/i,
]

/**
 * Categorize a list of skills
 */
export function categorizeSkills(skills: string[]): CategorizedSkills {
  const categorized: CategorizedSkills = {
    technical: [],
    soft: [],
    tools: [],
    languages: [],
    other: []
  }
  
  for (const skill of skills) {
    const lower = skill.toLowerCase()
    
    // Check each category in order of specificity
    if (TECHNICAL_PATTERNS.some(p => p.test(lower))) {
      categorized.technical.push(skill)
    } else if (SOFT_PATTERNS.some(p => p.test(lower))) {
      categorized.soft.push(skill)
    } else if (TOOLS_PATTERNS.some(p => p.test(lower))) {
      categorized.tools.push(skill)
    } else if (LANGUAGE_PATTERNS.some(p => p.test(lower))) {
      categorized.languages.push(skill)
    } else {
      categorized.other.push(skill)
    }
  }
  
  // Sort each category alphabetically
  categorized.technical.sort()
  categorized.soft.sort()
  categorized.tools.sort()
  categorized.languages.sort()
  categorized.other.sort()
  
  return categorized
}

/**
 * Get skill category breakdown as percentages
 */
export function getSkillBreakdown(categorized: CategorizedSkills): { [key: string]: number } {
  const total = 
    categorized.technical.length +
    categorized.soft.length +
    categorized.tools.length +
    categorized.languages.length +
    categorized.other.length
  
  if (total === 0) {
    return {
      technical: 0,
      soft: 0,
      tools: 0,
      languages: 0,
      other: 0
    }
  }
  
  return {
    technical: Math.round((categorized.technical.length / total) * 100),
    soft: Math.round((categorized.soft.length / total) * 100),
    tools: Math.round((categorized.tools.length / total) * 100),
    languages: Math.round((categorized.languages.length / total) * 100),
    other: Math.round((categorized.other.length / total) * 100)
  }
}

/**
 * Format categorized skills for display
 */
export function formatCategorizedSkills(categorized: CategorizedSkills): string {
  const sections: string[] = []
  
  if (categorized.technical.length > 0) {
    sections.push(`**Technical:** ${categorized.technical.join(', ')}`)
  }
  
  if (categorized.soft.length > 0) {
    sections.push(`**Soft Skills:** ${categorized.soft.join(', ')}`)
  }
  
  if (categorized.tools.length > 0) {
    sections.push(`**Tools:** ${categorized.tools.join(', ')}`)
  }
  
  if (categorized.languages.length > 0) {
    sections.push(`**Languages:** ${categorized.languages.join(', ')}`)
  }
  
  if (categorized.other.length > 0) {
    sections.push(`**Other:** ${categorized.other.join(', ')}`)
  }
  
  return sections.join('\n\n')
}

/**
 * Suggest missing skill categories
 */
export function suggestMissingCategories(categorized: CategorizedSkills): string[] {
  const suggestions: string[] = []
  const breakdown = getSkillBreakdown(categorized)
  
  if (breakdown.technical < 30 && categorized.technical.length < 5) {
    suggestions.push('Consider adding more technical skills relevant to your target role')
  }
  
  if (breakdown.soft < 20 && categorized.soft.length < 3) {
    suggestions.push('Add soft skills like leadership, communication, or teamwork')
  }
  
  if (breakdown.tools < 15 && categorized.tools.length < 3) {
    suggestions.push('List specific tools and software you use (e.g., Jira, Figma, Slack)')
  }
  
  if (categorized.languages.length === 0) {
    suggestions.push('Add language skills if you speak multiple languages')
  }
  
  return suggestions
}
