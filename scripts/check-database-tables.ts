import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ydjnobnddcevbwytdvyw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkam5vYm5kZGNldmJ3eXRkdnl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTYyMjU4MzIsImV4cCI6MjAzMTgwMTgzMn0.vXvXvXvXvXvXvXvXvXvXvXvXvXvXvXvXvXvXvXvXvXv'

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 0,
    },
  },
})

async function checkTables() {
  console.log('=== DATABASE TABLE CHECK ===\n')
  
  const tables = [
    'jobs',
    'job_scores',
    'job_evidence',
    'job_moderation',
    'job_investigations',
    'job_intelligence_summary'
  ]
  
  for (const table of tables) {
    try {
      // Try to query the table
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
      
      if (error) {
        if (error.code === '42P01') {
          console.log(`❌ ${table}: DOES NOT EXIST`)
        } else {
          console.log(`⚠️  ${table}: EXISTS but error - ${error.message}`)
        }
      } else {
        console.log(`✅ ${table}: EXISTS (${count} rows)`)
      }
    } catch (err: any) {
      console.log(`❌ ${table}: ERROR - ${err.message}`)
    }
  }
  
  console.log('\n=== SAMPLE DATA CHECK ===\n')
  
  // Check if jobs table has data
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, title, company, intelligence_score, trust_score, africa_eligibility')
    .limit(5)
  
  if (jobsError) {
    console.log('❌ Cannot query jobs:', jobsError.message)
  } else {
    console.log(`✅ Found ${jobs.length} jobs:`)
    jobs.forEach((job, i) => {
      console.log(`  ${i + 1}. ${job.title} at ${job.company}`)
      console.log(`     Intelligence: ${job.intelligence_score ?? 'NULL'}`)
      console.log(`     Trust: ${job.trust_score ?? 'NULL'}`)
      console.log(`     Africa: ${job.africa_eligibility ?? 'NULL'}`)
    })
  }
  
  // Check if job_scores table has data
  const { data: scores, error: scoresError } = await supabase
    .from('job_scores')
    .select('job_id, trust_score, intelligence_score, africa_eligibility')
    .limit(5)
  
  if (scoresError) {
    console.log('\n❌ Cannot query job_scores:', scoresError.message)
  } else {
    console.log(`\n✅ Found ${scores.length} job_scores:`)
    scores.forEach((score, i) => {
      console.log(`  ${i + 1}. Job ${score.job_id}`)
      console.log(`     Trust: ${score.trust_score ?? 'NULL'}`)
      console.log(`     Intelligence: ${score.intelligence_score ?? 'NULL'}`)
      console.log(`     Africa: ${score.africa_eligibility ?? 'NULL'}`)
    })
  }
  
  // Check if job_evidence table has data
  const { data: evidence, error: evidenceError } = await supabase
    .from('job_evidence')
    .select('job_id, evidence_type, confidence_score, verification_status')
    .limit(5)
  
  if (evidenceError) {
    console.log('\n❌ Cannot query job_evidence:', evidenceError.message)
  } else {
    console.log(`\n✅ Found ${evidence.length} job_evidence records:`)
    evidence.forEach((ev, i) => {
      console.log(`  ${i + 1}. Job ${ev.job_id} - ${ev.evidence_type}`)
      console.log(`     Confidence: ${ev.confidence_score}`)
      console.log(`     Status: ${ev.verification_status}`)
    })
  }
}

checkTables().catch(console.error)
