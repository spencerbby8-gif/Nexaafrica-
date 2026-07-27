import pg from 'pg'

const connectionString = 'postgresql://postgres.ydjnobnddcevbwytdvyw:dLMxU1VYu5zO9Uxu@aws-1-us-east-1.pooler.supabase.com:6543/postgres'

async function debugConfidence() {
  const client = new pg.Client({ connectionString })
  
  try {
    await client.connect()
    console.log('=== CONFIDENCE SCORE ANALYSIS ===\n')
    
    // Get confidence score distribution
    const distribution = await client.query(`
      SELECT 
        CASE 
          WHEN overall_confidence < 10 THEN '0-9'
          WHEN overall_confidence < 20 THEN '10-19'
          WHEN overall_confidence < 30 THEN '20-29'
          WHEN overall_confidence < 40 THEN '30-39'
          WHEN overall_confidence < 50 THEN '40-49'
          WHEN overall_confidence < 60 THEN '50-59'
          WHEN overall_confidence < 70 THEN '60-69'
          WHEN overall_confidence < 80 THEN '70-79'
          WHEN overall_confidence < 90 THEN '80-89'
          ELSE '90-100'
        END as range,
        COUNT(*) as count
      FROM job_ai_intelligence
      WHERE overall_confidence IS NOT NULL
      GROUP BY range
      ORDER BY MIN(overall_confidence)
    `)
    
    console.log('Confidence score distribution:')
    distribution.rows.forEach((row: any) => {
      console.log(`  ${row.range}: ${row.count} jobs`)
    })
    
    // Get component breakdown
    console.log('\n=== COMPONENT CONFIDENCE SCORES ===\n')
    const components = await client.query(`
      SELECT 
        ROUND(AVG(africa_confidence)::numeric, 1) as avg_africa,
        ROUND(AVG(remote_confidence)::numeric, 1) as avg_remote,
        ROUND(AVG(salary_confidence)::numeric, 1) as avg_salary,
        ROUND(AVG(company_confidence)::numeric, 1) as avg_company,
        ROUND(AVG(experience_confidence)::numeric, 1) as avg_experience,
        ROUND(AVG(overall_confidence)::numeric, 1) as avg_overall
      FROM job_ai_intelligence
      WHERE overall_confidence IS NOT NULL
    `)
    
    const comp = components.rows[0]
    console.log(`Africa: ${comp.avg_africa}`)
    console.log(`Remote: ${comp.avg_remote}`)
    console.log(`Salary: ${comp.avg_salary}`)
    console.log(`Company: ${comp.avg_company}`)
    console.log(`Experience: ${comp.avg_experience}`)
    console.log(`Overall: ${comp.avg_overall}`)
    
    // Sample low-confidence records
    console.log('\n=== LOW CONFIDENCE SAMPLES (Bottom 5) ===\n')
    const lowConf = await client.query(`
      SELECT 
        job_id,
        overall_confidence,
        africa_confidence,
        remote_confidence,
        salary_confidence,
        company_confidence,
        experience_confidence,
        model_version
      FROM job_ai_intelligence
      WHERE overall_confidence IS NOT NULL
      ORDER BY overall_confidence ASC
      LIMIT 5
    `)
    
    lowConf.rows.forEach((row: any, i: number) => {
      console.log(`${i + 1}. Job ${row.job_id}`)
      console.log(`   Overall: ${row.overall_confidence}`)
      console.log(`   Africa: ${row.africa_confidence}`)
      console.log(`   Remote: ${row.remote_confidence}`)
      console.log(`   Salary: ${row.salary_confidence}`)
      console.log(`   Company: ${row.company_confidence}`)
      console.log(`   Experience: ${row.experience_confidence}`)
      console.log(`   Model: ${row.model_version}`)
      console.log()
    })
    
    // Sample high-confidence records
    console.log('=== HIGH CONFIDENCE SAMPLES (Top 5) ===\n')
    const highConf = await client.query(`
      SELECT 
        job_id,
        overall_confidence,
        africa_confidence,
        remote_confidence,
        salary_confidence,
        company_confidence,
        experience_confidence,
        model_version
      FROM job_ai_intelligence
      WHERE overall_confidence IS NOT NULL
      ORDER BY overall_confidence DESC
      LIMIT 5
    `)
    
    highConf.rows.forEach((row: any, i: number) => {
      console.log(`${i + 1}. Job ${row.job_id}`)
      console.log(`   Overall: ${row.overall_confidence}`)
      console.log(`   Africa: ${row.africa_confidence}`)
      console.log(`   Remote: ${row.remote_confidence}`)
      console.log(`   Salary: ${row.salary_confidence}`)
      console.log(`   Company: ${row.company_confidence}`)
      console.log(`   Experience: ${row.experience_confidence}`)
      console.log(`   Model: ${row.model_version}`)
      console.log()
    })
    
  } catch (err: any) {
    console.error('Error:', err.message)
  } finally {
    await client.end()
  }
}

debugConfidence().catch(console.error)
