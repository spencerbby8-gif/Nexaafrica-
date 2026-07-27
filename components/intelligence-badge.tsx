'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Shield, Globe, Sparkles } from 'lucide-react'

interface IntelligenceBadgeProps {
  trustScore: number
  trustLevel: string
  eligibility: string
  eligibilityConfidence: number
  intelligenceScore: number
  intelligenceLevel: string
  showDetails?: boolean
}

export function IntelligenceBadge({
  trustScore,
  trustLevel,
  eligibility,
  eligibilityConfidence,
  intelligenceScore,
  intelligenceLevel,
  showDetails = false,
}: IntelligenceBadgeProps) {
  // Determine colors based on scores
  const getTrustColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/10 text-green-700 border-green-500/20'
    if (score >= 60) return 'bg-blue-500/10 text-blue-700 border-blue-500/20'
    if (score >= 40) return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20'
    return 'bg-red-500/10 text-red-700 border-red-500/20'
  }
  
  const getEligibilityColor = (level: string) => {
    if (level === 'Explicit') return 'bg-green-500/10 text-green-700 border-green-500/20'
    if (level === 'Likely') return 'bg-blue-500/10 text-blue-700 border-blue-500/20'
    if (level === 'Restricted') return 'bg-red-500/10 text-red-700 border-red-500/20'
    return 'bg-gray-500/10 text-gray-700 border-gray-500/20'
  }
  
  const getIntelligenceColor = (score: number) => {
    if (score >= 80) return 'bg-purple-500/10 text-purple-700 border-purple-500/20'
    if (score >= 60) return 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20'
    if (score >= 40) return 'bg-orange-500/10 text-orange-700 border-orange-500/20'
    return 'bg-gray-500/10 text-gray-700 border-gray-500/20'
  }
  
  const trustColor = getTrustColor(trustScore)
  const eligibilityColor = getEligibilityColor(eligibility)
  const intelligenceColor = getIntelligenceColor(intelligenceScore)
  
  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-2">
        {/* Trust Score Badge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`${trustColor} font-medium`}>
              <Shield className="w-3 h-3 mr-1" />
              Trust {trustScore}%
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">
              <p className="font-semibold">Trust Score: {trustScore}%</p>
              <p className="text-muted-foreground">Level: {trustLevel}</p>
              <p className="mt-1 text-muted-foreground">
                Based on company verification, ATS data, domain quality, and more
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
        
        {/* Africa Eligibility Badge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`${eligibilityColor} font-medium`}>
              <Globe className="w-3 h-3 mr-1" />
              Africa {eligibility}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">
              <p className="font-semibold">Africa Eligibility: {eligibility}</p>
              <p className="text-muted-foreground">Confidence: {eligibilityConfidence}%</p>
              <p className="mt-1 text-muted-foreground">
                {eligibility === 'Explicit' && 'Job explicitly mentions Africa or African countries'}
                {eligibility === 'Likely' && 'Global/EMEA role or remote work indicated'}
                {eligibility === 'Unknown' && 'No clear indication of Africa eligibility'}
                {eligibility === 'Restricted' && 'Location restrictions detected'}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
        
        {/* Intelligence Score Badge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`${intelligenceColor} font-medium`}>
              <Sparkles className="w-3 h-3 mr-1" />
              Intelligence {intelligenceScore}%
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">
              <p className="font-semibold">Intelligence Score: {intelligenceScore}%</p>
              <p className="text-muted-foreground">Level: {intelligenceLevel}</p>
              <p className="mt-1 text-muted-foreground">
                Combined score based on trust, eligibility, evidence quality, and completeness
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
      
      {/* Detailed breakdown */}
      {showDetails && (
        <div className="mt-3 p-3 bg-muted/50 rounded-lg border border-border text-xs space-y-2">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="font-semibold text-foreground">Trust</p>
              <p className="text-muted-foreground">{trustScore}% - {trustLevel}</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Eligibility</p>
              <p className="text-muted-foreground">{eligibility} ({eligibilityConfidence}%)</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Intelligence</p>
              <p className="text-muted-foreground">{intelligenceScore}% - {intelligenceLevel}</p>
            </div>
          </div>
        </div>
      )}
    </TooltipProvider>
  )
}
