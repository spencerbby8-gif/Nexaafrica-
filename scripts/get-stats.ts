import pg from 'pg'

const connectionString = 'postgresql://postgres.ydjnobnddcevbwytdvyw:dLMxU1VYu5zO9Uxu@aws-1-us-east-1.pooler.supabase.com:6543/postgres'

async function getStats() {
  const client = new pg.Client({ connectionString })
  
  try {
    await client.connect()
    
    // Jobs stats
    const jobStats = await client.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(eligibility) as jobs_with_eligibility,
        COUNT(trust_score) as jobs_with_trust,
        ROUND(AVG(trust_score)::numeric, 1) as avg_trust
      FROM jobs
    `)
    
    console.log('=== JOBS TABLE STATISTICS ===\n')
    const stats = jobStats.rows[0]
    console.log(`Total jobs: ${stats.total_jobs}`)
    console.log(`Jobs with eligibility: ${stats.jobs_with_eligibility} (${((stats.jobs_with_eligibility / stats.total_jobs) * 100).toFixed(1)}%)`)
    console.log(`Jobs with trust_score: ${stats.jobs_with_trust} (${((stats.jobs_with_trust / stats.total_jobs) * 100).toFixed(1)}%)`)
    console.log(`Average trust score: ${stats.avg_trust || 'NULL'}`)
    
    // Eligibility distribution
    const eligibilityDist = await client.query(`
      SELECT eligibility, COUNT(*) as count
      FROM jobs
      WHERE eligibility IS NOT NULL
      GROUP BY eligibility
      ORDER BY count DESC
    `)
    
    console.log('\nEligibility distribution:')
    eligibilityDist.rows.forEach((row: any) => {
      console.log(`  ${row.eligibility}: ${row.count} (${((row.count / stats.total_jobs) * 100).toFixed(1)}%)`)
    })
    
    // Intelligence stats
    const intelStats = await client.query(`
      SELECT 
        COUNT(*) as total_intelligence,
        COUNT(overall_confidence) as with_overall,
        ROUND(AVG(overall_confidence)::numeric, 1) as avg_overall,
        COUNT(africa_eligibility) as with_africa,
        COUNT(company_legitimacy) as with_company
      FROM job_ai_intelligence
    `)
    
    console.log('\n=== INTELLIGENCE TABLE STATISTICS ===\n')
    const istats = intelStats.rows[0]
    console.log(`Total intelligence records: ${istats.total_intelligence}`)
    console.log(`With overall_confidence: ${istats.with_overall} (${((istats.with_overall / istats.total_intelligence) * 100).toFixed(1)}%)`)
    console.log(`Average overall_confidence: ${istats.avg_overall || 'NULL'}`)
    console.log(`With Africa eligibility: ${istats.with_africa} (${((istats.with_africa / istats.total_intelligence) * 100).toFixed(1)}%)`)
    console.log(`With company legitimacy: ${istats.with_company} (${((istats.with_company / istats.total_intelligence) * 100).toFixed(1)}%)`)
    
    // Provider log stats
    const logStats = await client.query(`
      SELECT COUNT(*) as total_logs FROM ai_provider_log
    `)
    
    console.log('\n=== AI PROVIDER LOG ===\n')
    console.log(`Total log entries: ${logStats.rows[0].total_logs}`)
    
    const providerActivity = await client.query(`
      SELECT provider, event, COUNT(*) as count
      FROM ai_provider_log
      GROUP BY provider, event
      ORDER BY count DESC
      LIMIT 15
    `)
    
    console.log('\nProvider activity:')
    providerActivity.rows.forEach((row: any) => {
      console.log(`  ${row.provider} - ${row.event}: ${row.count}`)
    })
    
  } catch (err: any) {
    console.error('Error:', err.message)
  } finally {
    await client.end()
  }
}

getStats().catch(console.error)
