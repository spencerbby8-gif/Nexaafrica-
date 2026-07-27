import pg from 'pg'

const connectionString = 'postgresql://postgres.ydjnobnddcevbwytdvyw:dLMxU1VYu5zO9Uxu@aws-1-us-east-1.pooler.supabase.com:6543/postgres'

async function checkMigrationSchema() {
  console.log('=== MIGRATION TABLE SCHEMA ===\n')
  
  const client = new pg.Client({ connectionString })
  
  try {
    await client.connect()
    
    // Get table schema
    const schema = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'supabase_migrations' 
      AND table_name = 'schema_migrations'
    `)
    
    console.log('Migration table columns:')
    schema.rows.forEach((col: any) => {
      console.log(`  - ${col.column_name}: ${col.data_type}`)
    })
    
    // Get all migrations
    const migrations = await client.query(`
      SELECT * FROM supabase_migrations.schema_migrations
      ORDER BY version DESC
    `)
    
    console.log(`\nFound ${migrations.rows.length} migrations:`)
    migrations.rows.slice(0, 10).forEach((m: any, i: number) => {
      console.log(`${i + 1}.`, JSON.stringify(m, null, 2))
    })
    
  } catch (err: any) {
    console.error('Error:', err.message)
  } finally {
    await client.end()
  }
}

checkMigrationSchema().catch(console.error)
