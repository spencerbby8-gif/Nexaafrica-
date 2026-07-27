import pg from 'pg'

const connectionString = 'postgresql://postgres.ydjnobnddcevbwytdvyw:dLMxU1VYu5zO9Uxu@aws-1-us-east-1.pooler.supabase.com:6543/postgres'

async function checkActualTables() {
  console.log('=== ACTUAL INTELLIGENCE TABLES ===\n')
  
  const client = new pg.Client({ connectionString })
  
  try {
    await client.connect()
    console.log('✅ Connected to database\n')
    
    // Check for intelligence-related tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%intelligence%' OR table_name LIKE '%evidence%' OR table_name LIKE '%score%' OR table_name LIKE '%moderation%' OR table_name LIKE '%investigation%' OR table_name = 'ai_provider_log' OR table_name = 'ai_processing_queue')
      ORDER BY table_name
    `)
    
    console.log('Intelligence-related tables:')
    tables.rows.forEach((row: any) => {
      console.log(`  - ${row.table_name}`)
    })
    
    // Check job_ai_intelligence structure
    console.log('\n=== job_ai_intelligence TABLE STRUCTURE ===\n')
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'job_ai_intelligence'
      ORDER BY ordinal_position
    `)
    
    columns.rows.forEach((col: any) => {
      console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`)
    })
    
    // Count rows
    const count = await client.query(`SELECT COUNT(*) as count FROM job_ai_intelligence`)
    console.log(`\nTotal rows: ${count.rows[0].count}`)
    
    // Sample data
    console.log('\n=== SAMPLE DATA (Top 5 by overall_confidence) ===\n')
    const sample = await client.query(`
      SELECT 
        job_id,
        overall_confidence,
        africa_eligibility,
        africa_confidence,
        company_legitimacy,
        company_confidence,
        remote_eligibility,
        remote_confidence,
        salary_confidence,
        experience_confidence,
        model_version
      FROM job_ai_intelligence
      ORDER BY overall_confidence DESC NULLS LAST
      LIMIT 5
    `)
    
    sample.rows.forEach((row: any, i: number) => {
      console.log(`${i + 1}. Job ${row.job_id}`)
      console.log(`   Overall: ${row.overall_confidence}`)
      console.log(`   Africa: ${row.africa_eligibility} (${row.africa_confidence}%)`)
      console.log(`   Company: ${row.company_legitimacy} (${row.company_confidence}%)`)
      console.log(`   Remote: ${row.remote_eligibility} (${row.remote_confidence}%)`)
      console.log(`   Salary: ${row.salary_confidence}%`)
      console.log(`   Experience: ${row.experience_confidence}%`)
      console.log(`   Model: ${row.model_version}`)
      console.log()
    })
    
    // Check jobs table for intelligence columns
    console.log('=== JOBS TABLE INTELLIGENCE COLUMNS ===\n')
    const jobColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'jobs'
      AND (column_name LIKE '%intelligence%' OR column_name LIKE '%trust%' OR column_name LIKE '%africa%' OR column_name LIKE '%eligibility%' OR column_name LIKE '%moderation%')
      ORDER BY column_name
    `)
    
    jobColumns.rows.forEach((col: any) => {
      console.log(`  ${col.column_name}: ${col.data_type}`)
    })
    
    // Count jobs with intelligence data
    const jobStats = await client.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(eligibility) as jobs_with_eligibility,
        COUNT(trust_score) as jobs_with_trust,
        AVG(trust_score) as avg_trust
      FROM jobs
    `)
    
    console.log('\n=== JOBS TABLE STATISTICS ===\n')
    const stats = jobStats.rows[0]
    console.log(`Total jobs: ${stats.total_jobs}`)
    console.log(`Jobs with eligibility: ${stats.jobs_with_eligibility} (${((stats.jobs_with_eligibility / stats.total_jobs) * 100).toFixed(1)}%)`)
    console.log(`Jobs with trust_score: ${stats.jobs_with_trust} (${((stats.jobs_with_trust / stats.total_jobs) * 100).toFixed(1)}%)`)
    console.log(`Average trust score: ${stats.avg_trust ? stats.avg_trust.toFixed(1) : 'NULL'}`)
    
    // Check ai_provider_log
    console.log('\n=== AI PROVIDER LOG ===\n')
    const logCount = await client.query(`SELECT COUNT(*) as count FROM ai_provider_log`)
    console.log(`Total log entries: ${logCount.rows[0].count}`)
    
    const logSample = await client.query(`
      SELECT provider, event, COUNT(*) as count
      FROM ai_provider_log
      GROUP BY provider, event
      ORDER BY count DESC
      LIMIT 10
    `)
    
    console.log('\nProvider activity:')
    logSample.rows.forEach((row: any) => {
      console.log(`  ${row.provider} - ${row.event}: ${row.count}`)
    })
    
  } catch (err: any) {
    console.error('❌ Error:', err.message)
  } finally {
    await client.end()
  }
}

checkActualTables().catch(console.error)
