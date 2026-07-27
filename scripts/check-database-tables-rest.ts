import fetch from 'node-fetch'

const supabaseUrl = 'https://ydjnobnddcevbwytdvyw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkam5vYm5kZGNldmJ3eXRkdnl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTYyMjU4MzIsImV4cCI6MjAzMTgwMTgzMn0.vXvXvXvXvXvXvXvXvXvXvXvXvXvXvXvXvXvXvXvXvXv'

async function checkTables() {
  console.log('=== DATABASE TABLE CHECK (via REST API) ===\n')
  
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
      // Query table with count
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'count=exact'
        }
      })
      
      if (response.status === 404) {
        console.log(`❌ ${table}: DOES NOT EXIST`)
      } else if (response.ok) {
        const count = response.headers.get('content-range')?.split('/')[1] || '0'
        console.log(`✅ ${table}: EXISTS (${count} rows)`)
      } else {
        const error = await response.text()
        console.log(`⚠️  ${table}: EXISTS but error - ${response.status} ${error}`)
      }
    } catch (err: any) {
      console.log(`❌ ${table}: ERROR - ${err.message}`)
    }
  }
  
  console.log('\n=== SAMPLE DATA CHECK ===\n')
  
  // Check jobs table
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/jobs?select=id,title,company,intelligence_score,trust_score,africa_eligibility&limit=5`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    })
    
    if (response.ok) {
      const jobs = await response.json()
      console.log(`✅ Found ${jobs.length} jobs:`)
      jobs.forEach((job: any, i: number) => {
        console.log(`  ${i + 1}. ${job.title} at ${job.company}`)
        console.log(`     Intelligence: ${job.intelligence_score ?? 'NULL'}`)
        console.log(`     Trust: ${job.trust_score ?? 'NULL'}`)
        console.log(`     Africa: ${job.africa_eligibility ?? 'NULL'}`)
      })
    } else {
      console.log('❌ Cannot query jobs:', response.status)
    }
  } catch (err: any) {
    console.log('❌ Cannot query jobs:', err.message)
  }
  
  // Check job_scores table
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/job_scores?select=job_id,trust_score,intelligence_score,africa_eligibility&limit=5`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    })
    
    if (response.ok) {
      const scores = await response.json()
      console.log(`\n✅ Found ${scores.length} job_scores:`)
      scores.forEach((score: any, i: number) => {
        console.log(`  ${i + 1}. Job ${score.job_id}`)
        console.log(`     Trust: ${score.trust_score ?? 'NULL'}`)
        console.log(`     Intelligence: ${score.intelligence_score ?? 'NULL'}`)
        console.log(`     Africa: ${score.africa_eligibility ?? 'NULL'}`)
      })
    } else if (response.status === 404) {
      console.log('\n❌ job_scores table does not exist')
    } else {
      console.log('\n❌ Cannot query job_scores:', response.status)
    }
  } catch (err: any) {
    console.log('\n❌ Cannot query job_scores:', err.message)
  }
  
  // Check job_evidence table
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/job_evidence?select=job_id,evidence_type,confidence_score,verification_status&limit=5`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    })
    
    if (response.ok) {
      const evidence = await response.json()
      console.log(`\n✅ Found ${evidence.length} job_evidence records:`)
      evidence.forEach((ev: any, i: number) => {
        console.log(`  ${i + 1}. Job ${ev.job_id} - ${ev.evidence_type}`)
        console.log(`     Confidence: ${ev.confidence_score}`)
        console.log(`     Status: ${ev.verification_status}`)
      })
    } else if (response.status === 404) {
      console.log('\n❌ job_evidence table does not exist')
    } else {
      console.log('\n❌ Cannot query job_evidence:', response.status)
    }
  } catch (err: any) {
    console.log('\n❌ Cannot query job_evidence:', err.message)
  }
}

checkTables().catch(console.error)
