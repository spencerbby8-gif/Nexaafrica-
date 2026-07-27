import * as dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables:')
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'set' : 'missing')
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'set' : 'missing')
  process.exit(1)
}

async function queryDatabase() {
  console.log('=== INTELLIGENCE SYSTEM AUDIT ===\n')
  
  // Query jobs with intelligence scores using REST API
  const response = await fetch(
    `${supabaseUrl}/rest/v1/jobs?select=id,title,company,trust_score,africa_eligibility,africa_confidence,intelligence_score,moderation_status,posted_at,job_scores(trust_breakdown,trust_reasons,africa_reasons,africa_evidence,intelligence_reasons,intelligence_breakdown),job_evidence(evidence_type,confidence_score,verification_status,evidence_summary)&is_active=eq.true&order=intelligence_score.desc.nullslast&limit=20`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    }
  )
  
  if (!response.ok) {
    console.error('Error fetching jobs:', response.statusText)
    const errorText = await response.text()
    console.error('Response:', errorText)
    return
  }
  
  const jobs = await response.json()
  
  console.log(`Found ${jobs.length} jobs with intelligence data\n`)
  
  if (jobs.length === 0) {
    console.log('No jobs found with intelligence scores.')
    console.log('This suggests the intelligence pipeline has not been run yet.')
    return
  }
  
  // Analyze each job
  for (const job of jobs) {
    console.log('━'.repeat(80))
    console.log(`JOB: ${job.title}`)
    console.log(`Company: ${job.company}`)
    console.log(`ID: ${job.id}`)
    console.log('━'.repeat(80))
    
    console.log('\n📊 SCORES:')
    console.log(`  Trust Score: ${job.trust_score ?? 'NULL'}`)
    console.log(`  Africa Eligibility: ${job.africa_eligibility ?? 'NULL'} (confidence: ${job.africa_confidence ?? 'NULL'})`)
    console.log(`  Intelligence Score: ${job.intelligence_score ?? 'NULL'}`)
    console.log(`  Moderation Status: ${job.moderation_status ?? 'NULL'}`)
    
    const scores = job.job_scores?.[0]
    const evidence = job.job_evidence || []
    
    if (scores) {
      console.log('\n🔍 TRUST BREAKDOWN:')
      if (scores.trust_breakdown) {
        for (const [key, value] of Object.entries(scores.trust_breakdown)) {
          console.log(`  ${key}: ${value}`)
        }
      } else {
        console.log('  No breakdown available')
      }
      
      console.log('\n💡 TRUST REASONS:')
      if (scores.trust_reasons && scores.trust_reasons.length > 0) {
        scores.trust_reasons.forEach((reason: string) => {
          console.log(`  • ${reason}`)
        })
      } else {
        console.log('  No reasons provided')
      }
      
      console.log('\n🌍 AFRICA REASONS:')
      if (scores.africa_reasons && scores.africa_reasons.length > 0) {
        scores.africa_reasons.forEach((reason: string) => {
          console.log(`  • ${reason}`)
        })
      } else {
        console.log('  No reasons provided')
      }
      
      console.log('\n🎯 INTELLIGENCE REASONS:')
      if (scores.intelligence_reasons && scores.intelligence_reasons.length > 0) {
        scores.intelligence_reasons.forEach((reason: string) => {
          console.log(`  • ${reason}`)
        })
      } else {
        console.log('  No reasons provided')
      }
    } else {
      console.log('\n⚠️  No job_scores record found')
    }
    
    if (evidence.length > 0) {
      console.log('\n📋 EVIDENCE COLLECTED:')
      evidence.forEach((ev: any) => {
        console.log(`  [${ev.evidence_type}] ${ev.verification_status} (${ev.confidence_score}%)`)
        if (ev.evidence_summary) {
          console.log(`    ${ev.evidence_summary}`)
        }
      })
    } else {
      console.log('\n⚠️  No evidence collected')
    }
    
    console.log('\n')
  }
  
  // Summary statistics
  console.log('═'.repeat(80))
  console.log('SUMMARY STATISTICS')
  console.log('═'.repeat(80))
  
  const trustScores = jobs.filter((j: any) => j.trust_score != null).map((j: any) => j.trust_score)
  const intelScores = jobs.filter((j: any) => j.intelligence_score != null).map((j: any) => j.intelligence_score)
  const eligibilityCounts: Record<string, number> = {}
  
  jobs.forEach((j: any) => {
    const elig = j.africa_eligibility || 'NULL'
    eligibilityCounts[elig] = (eligibilityCounts[elig] || 0) + 1
  })
  
  console.log(`\nJobs analyzed: ${jobs.length}`)
  console.log(`Jobs with trust scores: ${trustScores.length}`)
  console.log(`Jobs with intelligence scores: ${intelScores.length}`)
  
  if (trustScores.length > 0) {
    const avgTrust = trustScores.reduce((a: number, b: number) => a + b, 0) / trustScores.length
    console.log(`\nTrust Score Statistics:`)
    console.log(`  Average: ${avgTrust.toFixed(1)}`)
    console.log(`  Min: ${Math.min(...trustScores)}`)
    console.log(`  Max: ${Math.max(...trustScores)}`)
  }
  
  if (intelScores.length > 0) {
    const avgIntel = intelScores.reduce((a: number, b: number) => a + b, 0) / intelScores.length
    console.log(`\nIntelligence Score Statistics:`)
    console.log(`  Average: ${avgIntel.toFixed(1)}`)
    console.log(`  Min: ${Math.min(...intelScores)}`)
    console.log(`  Max: ${Math.max(...intelScores)}`)
  }
  
  console.log(`\nAfrica Eligibility Distribution:`)
  for (const [eligibility, count] of Object.entries(eligibilityCounts)) {
    console.log(`  ${eligibility}: ${count} (${((count / jobs.length) * 100).toFixed(1)}%)`)
  }
  
  // Check for issues
  console.log('\n' + '═'.repeat(80))
  console.log('ISSUE DETECTION')
  console.log('═'.repeat(80))
  
  const issues: string[] = []
  
  // Check for jobs with scores but no evidence
  const noEvidence = jobs.filter((j: any) => j.intelligence_score != null && (!j.job_evidence || j.job_evidence.length === 0))
  if (noEvidence.length > 0) {
    issues.push(`⚠️  ${noEvidence.length} jobs have intelligence scores but no evidence collected`)
  }
  
  // Check for jobs with scores but no reasons
  const noReasons = jobs.filter((j: any) => {
    const scores = j.job_scores?.[0]
    return j.intelligence_score != null && (!scores?.trust_reasons || scores.trust_reasons.length === 0)
  })
  if (noReasons.length > 0) {
    issues.push(`⚠️  ${noReasons.length} jobs have scores but no trust reasons provided`)
  }
  
  // Check for jobs with low confidence
  const lowConfidence = jobs.filter((j: any) => j.africa_confidence != null && j.africa_confidence < 50)
  if (lowConfidence.length > 0) {
    issues.push(`⚠️  ${lowConfidence.length} jobs have low Africa confidence (<50%)`)
  }
  
  // Check for NULL moderation status
  const noModeration = jobs.filter((j: any) => j.moderation_status == null)
  if (noModeration.length > 0) {
    issues.push(`⚠️  ${noModeration.length} jobs have NULL moderation status`)
  }
  
  if (issues.length === 0) {
    console.log('\n✅ No issues detected')
  } else {
    console.log('\nIssues found:')
    issues.forEach(issue => console.log(`  ${issue}`))
  }
}

queryDatabase().catch(console.error)
