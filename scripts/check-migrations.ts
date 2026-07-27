import pg from 'pg'

const connectionString = 'postgresql://postgres.ydjnobnddcevbwytdvyw:dLMxU1VYu5zO9Uxu@aws-1-us-east-1.pooler.supabase.com:6543/postgres'

async function checkMigrations() {
  console.log('=== MIGRATION HISTORY CHECK ===\n')
  
  const client = new pg.Client({ connectionString })
  
  try {
    await client.connect()
    console.log('✅ Connected to database\n')
    
    // Check if migration table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'supabase_migrations' 
        AND table_name = 'schema_migrations'
      )
    `)
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ Migration table does not exist')
      console.log('   This means Supabase migrations have never been run')
      return
    }
    
    console.log('✅ Migration table exists\n')
    
    // Get migration history
    const migrations = await client.query(`
      SELECT 
        version,
        name,
        applied_at
      FROM supabase_migrations.schema_migrations
      ORDER BY version DESC
      LIMIT 20
    `)
    
    console.log(`Found ${migrations.rows.length} migrations:\n`)
    migrations.rows.forEach((m: any, i: number) => {
      console.log(`${i + 1}. ${m.name}`)
      console.log(`   Version: ${m.version}`)
      console.log(`   Applied: ${m.applied_at}`)
      console.log()
    })
    
    // Check if intelligence migration exists
    const intelligenceMigration = migrations.rows.find((m: any) => 
      m.name.includes('intelligence') || m.name.includes('20260727')
    )
    
    if (intelligenceMigration) {
      console.log('✅ Intelligence migration found:')
      console.log(`   ${intelligenceMigration.name}`)
      console.log(`   Applied: ${intelligenceMigration.applied_at}`)
    } else {
      console.log('❌ Intelligence migration NOT found in history')
      console.log('   The migration file exists in code but was never run')
    }
    
  } catch (err: any) {
    console.error('❌ Error:', err.message)
  } finally {
    await client.end()
  }
}

checkMigrations().catch(console.error)
