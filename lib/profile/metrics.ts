/**
 * Metric Extraction
 * 
 * Extracts quantifiable achievements from profile text.
 * Identifies percentages, numbers, timeframes, and currency values.
 */

export interface ExtractedMetric {
  value: string
  type: 'percentage' | 'number' | 'timeframe' | 'currency' | 'comparison'
  context: string
  impact?: 'high' | 'medium' | 'low'
}

export interface MetricSummary {
  total: number
  byType: {
    percentage: number
    number: number
    timeframe: number
    currency: number
    comparison: number
  }
  metrics: ExtractedMetric[]
  suggestions: string[]
}

/**
 * Extract metrics from text
 */
export function extractMetrics(text: string): ExtractedMetric[] {
  const metrics: ExtractedMetric[] = []
  
  // 1. Percentages (e.g., "increased by 25%", "reduced costs by 40%")
  const percentageRegex = /(\d+(?:\.\d+)?)\s*%/g
  let match
  while ((match = percentageRegex.exec(text)) !== null) {
    const start = Math.max(0, match.index - 80)
    const end = Math.min(text.length, match.index + match[0].length + 80)
    const context = text.slice(start, end).trim()
    
    // Determine impact based on percentage value
    const value = parseFloat(match[1])
    const impact = value >= 50 ? 'high' : value >= 20 ? 'medium' : 'low'
    
    metrics.push({
      value: match[0],
      type: 'percentage',
      context,
      impact
    })
  }
  
  // 2. Numbers with context (e.g., "managed 15 projects", "led team of 8")
  const numberContextPatterns = [
    /(\d+)\s+(projects?|team members?|employees?|people|staff|developers?|engineers?|designers?|analysts?)/gi,
    /(\d+)\s+(clients?|customers?|users?|accounts?|partners?|stakeholders?)/gi,
    /(\d+)\s+(countries?|regions?|markets?|locations?|offices?|branches?)/gi,
    /(\d+)\s+(products?|services?|features?|applications?|systems?|platforms?)/gi,
    /(\d+)\s+(awards?|certifications?|publications?|patents?)/gi,
  ]
  
  for (const pattern of numberContextPatterns) {
    while ((match = pattern.exec(text)) !== null) {
      const start = Math.max(0, match.index - 60)
      const end = Math.min(text.length, match.index + match[0].length + 60)
      const context = text.slice(start, end).trim()
      
      const value = parseInt(match[1])
      const impact = value >= 50 ? 'high' : value >= 10 ? 'medium' : 'low'
      
      metrics.push({
        value: match[0],
        type: 'number',
        context,
        impact
      })
    }
  }
  
  // 3. Timeframes (e.g., "reduced time by 2 weeks", "delivered in 3 months")
  const timeframePatterns = [
    /(\d+)\s+(days?|weeks?|months?|years?|hours?|minutes?)/gi,
    /(reduced|saved|cut|shortened|accelerated|sped up|fast-tracked).{0,30}(\d+)\s+(days?|weeks?|months?|years?|hours?)/gi,
    /(delivered|completed|launched|shipped|deployed).{0,30}(in|within|under)\s+(\d+)\s+(days?|weeks?|months?)/gi,
  ]
  
  for (const pattern of timeframePatterns) {
    while ((match = pattern.exec(text)) !== null) {
      const start = Math.max(0, match.index - 60)
      const end = Math.min(text.length, match.index + match[0].length + 60)
      const context = text.slice(start, end).trim()
      
      // Check if it's a time reduction (high impact)
      const isReduction = /reduced|saved|cut|shortened|accelerated/i.test(context)
      const impact = isReduction ? 'high' : 'medium'
      
      metrics.push({
        value: match[0],
        type: 'timeframe',
        context,
        impact
      })
    }
  }
  
  // 4. Currency values (e.g., "$1M revenue", "managed $500K budget")
  const currencyPatterns = [
    /[\$€£₦]\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
    /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(million|billion|thousand|hundred|m|b|k)/gi,
    /(revenue|budget|cost|savings|profit|sales).{0,30}[\$€£₦]\s*(\d+(?:,\d{3})*)/gi,
  ]
  
  for (const pattern of currencyPatterns) {
    while ((match = pattern.exec(text)) !== null) {
      const start = Math.max(0, match.index - 60)
      const end = Math.min(text.length, match.index + match[0].length + 60)
      const context = text.slice(start, end).trim()
      
      // Determine impact based on amount
      let impact: 'high' | 'medium' | 'low' = 'medium'
      if (match[0].includes('million') || match[0].includes('billion') || match[0].includes('M') || match[0].includes('B')) {
        impact = 'high'
      } else if (match[0].includes('thousand') || match[0].includes('K')) {
        impact = 'medium'
      }
      
      metrics.push({
        value: match[0],
        type: 'currency',
        context,
        impact
      })
    }
  }
  
  // 5. Comparisons (e.g., "2x faster", "3x growth", "doubled", "tripled")
  const comparisonPatterns = [
    /(\d+)x\s+(faster|slower|better|more|less|growth|increase|reduction|improvement)/gi,
    /(doubled|tripled|quadrupled|halved|quartered)/gi,
    /(increased|decreased|grew|reduced|improved|boosted).{0,30}(by|of)\s+\d+/gi,
  ]
  
  for (const pattern of comparisonPatterns) {
    while ((match = pattern.exec(text)) !== null) {
      const start = Math.max(0, match.index - 60)
      const end = Math.min(text.length, match.index + match[0].length + 60)
      const context = text.slice(start, end).trim()
      
      // Multipliers and doubling/tripling are high impact
      const isMultiplier = /\d+x|doubled|tripled|quadrupled/i.test(match[0])
      const impact = isMultiplier ? 'high' : 'medium'
      
      metrics.push({
        value: match[0],
        type: 'comparison',
        context,
        impact
      })
    }
  }
  
  // Deduplicate metrics (same value in overlapping contexts)
  const deduplicated: ExtractedMetric[] = []
  const seen = new Set<string>()
  
  for (const metric of metrics) {
    const key = `${metric.value}:${metric.type}`
    if (!seen.has(key)) {
      seen.add(key)
      deduplicated.push(metric)
    }
  }
  
  return deduplicated
}

/**
 * Get metric summary
 */
export function getMetricSummary(text: string): MetricSummary {
  const metrics = extractMetrics(text)
  
  const byType = {
    percentage: metrics.filter(m => m.type === 'percentage').length,
    number: metrics.filter(m => m.type === 'number').length,
    timeframe: metrics.filter(m => m.type === 'timeframe').length,
    currency: metrics.filter(m => m.type === 'currency').length,
    comparison: metrics.filter(m => m.type === 'comparison').length,
  }
  
  const suggestions: string[] = []
  
  if (metrics.length === 0) {
    suggestions.push('Add quantifiable achievements (e.g., "increased sales by 25%", "managed team of 10")')
  } else if (metrics.length < 3) {
    suggestions.push('Add more metrics to strengthen your profile (target: 5-10 quantifiable achievements)')
  }
  
  if (byType.percentage === 0) {
    suggestions.push('Include percentage improvements (e.g., "reduced costs by 30%", "increased efficiency by 40%")')
  }
  
  if (byType.number === 0) {
    suggestions.push('Add specific numbers (e.g., "managed 15 projects", "led team of 8 engineers")')
  }
  
  if (byType.timeframe === 0) {
    suggestions.push('Include timeframes (e.g., "delivered in 3 months", "reduced processing time by 2 weeks")')
  }
  
  return {
    total: metrics.length,
    byType,
    metrics,
    suggestions
  }
}

/**
 * Highlight metrics in text (for display)
 */
export function highlightMetrics(text: string): string {
  let highlighted = text
  
  // Highlight percentages
  highlighted = highlighted.replace(
    /(\d+(?:\.\d+)?)\s*%/g,
    '**$1%**'
  )
  
  // Highlight currency
  highlighted = highlighted.replace(
    /[\$€£₦]\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
    '**$&**'
  )
  
  // Highlight multipliers
  highlighted = highlighted.replace(
    /(\d+)x\s+(faster|slower|better|more|less|growth|increase|reduction|improvement)/gi,
    '**$&**'
  )
  
  return highlighted
}

/**
 * Format metrics for display
 */
export function formatMetrics(metrics: ExtractedMetric[]): string {
  if (metrics.length === 0) {
    return 'No quantifiable metrics found'
  }
  
  const grouped: { [key: string]: ExtractedMetric[] } = {
    high: metrics.filter(m => m.impact === 'high'),
    medium: metrics.filter(m => m.impact === 'medium'),
    low: metrics.filter(m => m.impact === 'low'),
  }
  
  const sections: string[] = []
  
  if (grouped.high.length > 0) {
    sections.push(`**High Impact (${grouped.high.length}):**`)
    for (const metric of grouped.high.slice(0, 5)) {
      sections.push(`  • ${metric.value} - ${metric.context.slice(0, 100)}...`)
    }
  }
  
  if (grouped.medium.length > 0) {
    sections.push(`\n**Medium Impact (${grouped.medium.length}):**`)
    for (const metric of grouped.medium.slice(0, 5)) {
      sections.push(`  • ${metric.value} - ${metric.context.slice(0, 100)}...`)
    }
  }
  
  if (grouped.low.length > 0) {
    sections.push(`\n**Low Impact (${grouped.low.length}):**`)
    for (const metric of grouped.low.slice(0, 3)) {
      sections.push(`  • ${metric.value} - ${metric.context.slice(0, 100)}...`)
    }
  }
  
  return sections.join('\n')
}

/**
 * Score metric quality
 */
export function scoreMetricQuality(summary: MetricSummary): number {
  // Base score from total metrics
  let score = Math.min(50, summary.total * 5)
  
  // Bonus for variety
  const typesUsed = Object.values(summary.byType).filter(v => v > 0).length
  score += typesUsed * 10
  
  // Bonus for high-impact metrics
  const highImpact = summary.metrics.filter(m => m.impact === 'high').length
  score += Math.min(20, highImpact * 5)
  
  return Math.min(100, score)
}
