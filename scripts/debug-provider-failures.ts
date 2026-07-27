import pg from 'pg'

const connectionString = 'postgresql://postgres.ydjnobnddcevbwytdvyw:dLMxU1VYu5zO9Uxu@aws-1-us-east-1.pooler.supabase.com:6543/postgres'

async function debugFailures() {
  const client = new pg.Client({ connectionString })
  
  try {
    await client.connect()
    console.log('=== AI PROVIDER FAILURE ANALYSIS ===\n')
    
    // Get detailed failure information
    const failures = await client.query(`
      SELECT 
        provider,
        event,
        error_code,
        error_message,
        COUNT(*) as count
      FROM ai_provider_log
      WHERE event = 'failure'
      GROUP BY provider, event, error_code, error_message
      ORDER BY count DESC
    `)
    
    console.log('Failure breakdown:')
    failures.rows.forEach((row: any) => {
      console.log(`\n${row.provider} - ${row.error_code || 'NO_CODE'}`)
      console.log(`  Count: ${row.count}`)
      console.log(`  Message: ${row.error_message?.substring(0, 200) || 'NO_MESSAGE'}`)
    })
    
    // Get recent failures with full details
    console.log('\n\n=== RECENT FAILURES (Last 10) ===\n')
    const recentFailures = await client.query(`
      SELECT 
        provider,
        model,
        error_code,
        error_message,
        error_body,
        http_status,
        retry_count,
        duration_ms,
        created_at
      FROM ai_provider_log
      WHERE event = 'failure'
      ORDER BY created_at DESC
      LIMIT 10
    `)
    
    recentFailures.rows.forEach((row: any, i: number) => {
      console.log(`${i + 1}. ${row.provider} (${row.model})`)
      console.log(`   Time: ${row.created_at}`)
      console.log(`   HTTP Status: ${row.http_status || 'N/A'}`)
      console.log(`   Error Code: ${row.error_code || 'N/A'}`)
      console.log(`   Error Message: ${row.error_message || 'N/A'}`)
      console.log(`   Error Body: ${row.error_body?.substring(0, 300) || 'N/A'}`)
      console.log(`   Retry Count: ${row.retry_count}`)
      console.log(`   Duration: ${row.duration_ms}ms`)
      console.log()
    })
    
    // Check success patterns
    console.log('=== SUCCESS PATTERNS ===\n')
    const successes = await client.query(`
      SELECT 
        provider,
        model,
        AVG(duration_ms) as avg_duration,
        COUNT(*) as count
      FROM ai_provider_log
      WHERE event = 'success'
      GROUP BY provider, model
      ORDER BY count DESC
    `)
    
    successes.rows.forEach((row: any) => {
      console.log(`${row.provider} (${row.model})`)
      console.log(`  Successes: ${row.count}`)
      console.log(`  Avg Duration: ${Math.round(row.avg_duration)}ms`)
      console.log()
    })
    
  } catch (err: any) {
    console.error('Error:', err.message)
  } finally {
    await client.end()
  }
}

debugFailures().catch(console.error)
