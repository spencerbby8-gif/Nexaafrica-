import pg from 'pg'

const connectionString = 'postgresql://postgres.ydjnobnddcevbwytdvyw:dLMxU1VYu5zO9Uxu@aws-1-us-east-1.pooler.supabase.com:6543/postgres'

async function checkDatabase() {
  console.log('=== DATABASE TABLE CHECK (via PostgreSQL) ===\n')
  
  const client = new pg.Client({ connectionString })
  
  try {
    await client.connect()
    console.log('✅ Connected to database\n')
    
    // Check if tables exist
    const tables = [
      'jobs',
      'job_scores',
      'job_evidence',
      'job_moderation',
      'job_investigations'
    ]
    
    for (const table of tables) {
      try {
        const result = await client.query(
          `SELECT COUNT(*) as count FROM ${table}`
        )
        const count = result.rows[0].count
        console.log(`✅ ${table}: EXISTS (${count} rows)`)
      } catch (err: any) {
        if (err.code === '42P01') {
          console.log(`❌ ${table}: DOES NOT EXIST`)
        } else {
          console.log(`⚠️  ${table}: EXISTS but error - ${err.message}`)
        }
      }
    }
    
    // Check if view exists
    try {
      const viewResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.views 
        WHERE table_name = 'job_intelligence_summary'
      `)
      const viewCount = viewResult.rows[0].count
      if (viewCount > 0) {
        console.log(`✅ job_intelligence_summary (view): EXISTS`)
      } else {
        console.log(`❌ job_intelligence_summary (view): DOES NOT EXIST`)
      }
    } catch (err: any) {
      console.log(`⚠️  job_intelligence_summary (view): ERROR - ${err.message}`)
    }
    
    console.log('\n=== SAMPLE DATA CHECK ===\n')
    
    // Check jobs with intelligence scores
    const jobsResult = await client.query(`
      SELECT 
        id,
        title,
        company,
        intelligence_score,
        trust_score,
        africa_eligibility,
        africa_confidence
      FROM jobs
      ORDER BY intelligence_score DESC NULLS LAST
      LIMIT 5
    `)
    
    console.log(`✅ Found ${jobsResult.rows.length} jobs:`)
    jobsResult.rows.forEach((job: any, i: number) => {
      console.log(`  ${i + 1}. ${job.title} at ${job.company}`)
      console.log(`     Intelligence: ${job.intelligence_score ?? 'NULL'}`)
      console.log(`     Trust: ${job.trust_score ?? 'NULL'}`)
      console.log(`     Africa: ${job.africa_eligibility ?? 'NULL'} (${job.africa_confidence ?? 'NULL'}%)`)
    })
    
    // Check job_scores
    const scoresResult = await client.query(`
      SELECT 
        job_id,
        trust_score,
        intelligence_score,
        africa_eligibility,
        calculated_at
      FROM job_scores
      ORDER BY calculated_at DESC
      LIMIT 5
    `)
    
    console.log(`\n✅ Found ${scoresResult.rows.length} job_scores:`)
    scoresResult.rows.forEach((score: any, i: number) => {
      console.log(`  ${i + 1}. Job ${score.job_id}`)
      console.log(`     Trust: ${score.trust_score ?? 'NULL'}`)
      console.log(`     Intelligence: ${score.intelligence_score ?? 'NULL'}`)
      console.log(`     Africa: ${score.africa_eligibility ?? 'NULL'}`)
      console.log(`     Calculated: ${score.calculated_at}`)
    })
    
    // Check job_evidence
    const evidenceResult = await client.query(`
      SELECT 
        job_id,
        evidence_type,
        confidence_score,
        verification_status,
        collected_at
      FROM job_evidence
      ORDER BY collected_at DESC
      LIMIT 5
    `)
    
    console.log(`\n✅ Found ${evidenceResult.rows.length} job_evidence records:`)
    evidenceResult.rows.forEach((ev: any, i: number) => {
      console.log(`  ${i + 1}. Job ${ev.job_id} - ${ev.evidence_type}`)
      console.log(`     Confidence: ${ev.confidence_score}`)
      console.log(`     Status: ${ev.verification_status}`)
      console.log(`     Collected: ${ev.collected_at}`)
    })
    
    // Check job_moderation
    const moderationResult = await client.query(`
      SELECT 
        job_id,
        status,
        status_reason,
        gates_passed,
        gates_total,
        flag_count,
        created_at
      FROM job_moderation
      ORDER BY created_at DESC
      LIMIT 5
    `)
    
    console.log(`\n✅ Found ${moderationResult.rows.length} job_moderation records:`)
    moderationResult.rows.forEach((mod: any, i: number) => {
      console.log(`  ${i + 1}. Job ${mod.job_id}`)
      console.log(`     Status: ${mod.status}`)
      console.log(`     Reason: ${mod.status_reason ?? 'NULL'}`)
      console.log(`     Gates: ${mod.gates_passed}/${mod.gates_total}`)
      console.log(`     Flags: ${mod.flag_count}`)
      console.log(`     Created: ${mod.created_at}`)
    })
    
    console.log('\n=== STATISTICS ===\n')
    
    // Count jobs with intelligence scores
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(intelligence_score) as jobs_with_intelligence,
        COUNT(trust_score) as jobs_with_trust,
        COUNT(africa_eligibility) as jobs_with_africa,
        AVG(intelligence_score) as avg_intelligence,
        AVG(trust_score) as avg_trust
      FROM jobs
    `)
    
    const stats = statsResult.rows[0]
    console.log(`Total jobs: ${stats.total_jobs}`)
    console.log(`Jobs with intelligence scores: ${stats.jobs_with_intelligence} (${((stats.jobs_with_intelligence / stats.total_jobs) * 100).toFixed(1)}%)`)
    console.log(`Jobs with trust scores: ${stats.jobs_with_trust} (${((stats.jobs_with_trust / stats.total_jobs) * 100).toFixed(1)}%)`)
    console.log(`Jobs with Africa eligibility: ${stats.jobs_with_africa} (${((stats.jobs_with_africa / stats.total_jobs) * 100).toFixed(1)}%)`)
    console.log(`Average intelligence score: ${stats.avg_intelligence ? stats.avg_intelligence.toFixed(1) : 'NULL'}`)
    console.log(`Average trust score: ${stats.avg_trust ? stats.avg_trust.toFixed(1) : 'NULL'}`)
    
    // Count evidence records
    const evidenceStats = await client.query(`
      SELECT 
        COUNT(*) as total_evidence,
        COUNT(DISTINCT job_id) as jobs_with_evidence,
        AVG(confidence_score) as avg_confidence
      FROM job_evidence
    `)
    
    const evStats = evidenceStats.rows[0]
    console.log(`\nTotal evidence records: ${evStats.total_evidence}`)
    console.log(`Jobs with evidence: ${evStats.jobs_with_evidence}`)
    console.log(`Average confidence: ${evStats.avg_confidence ? evStats.avg_confidence.toFixed(1) : 'NULL'}`)
    
  } catch (err: any) {
    console.error('❌ Database error:', err.message)
  } finally {
    await client.end()
  }
}

checkDatabase().catch(console.error)
