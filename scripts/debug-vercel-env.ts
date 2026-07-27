const VERCEL_TOKEN = 'vcp_72rBeQ4ZR8lXt1WDActkS4GxAmxzxKZs7lmFeD3EzjG1moV0Aj3yRdnv'
const PROJECT_ID = 'prj_FDp22Mo7UJIxEUABRVCKXeX6MBXD'

async function debug() {
  console.log('=== DEBUGGING VERCEL API ===\n')
  
  // Test 1: Get project info
  console.log('Test 1: Get project info')
  const projectResponse = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}`,
    {
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`
      }
    }
  )
  
  console.log('Status:', projectResponse.status)
  console.log('Status Text:', projectResponse.statusText)
  
  if (projectResponse.ok) {
    const projectData = await projectResponse.json() as any
    console.log('Project Name:', projectData.name)
    console.log('Project ID:', projectData.id)
  } else {
    const errorText = await projectResponse.text()
    console.log('Error:', errorText.substring(0, 500))
  }
  
  // Test 2: Get env vars
  console.log('\nTest 2: Get environment variables')
  const envResponse = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env`,
    {
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`
      }
    }
  )
  
  console.log('Status:', envResponse.status)
  console.log('Status Text:', envResponse.statusText)
  
  if (envResponse.ok) {
    const envData = await envResponse.json() as any
    console.log('Response keys:', Object.keys(envData))
    console.log('Number of env vars:', envData.envs?.length || 0)
    
    if (envData.envs && envData.envs.length > 0) {
      console.log('\nFirst 5 env vars:')
      envData.envs.slice(0, 5).forEach((env: any) => {
        console.log(`  ${env.key}: ${env.value?.substring(0, 20)}...`)
      })
    }
  } else {
    const errorText = await envResponse.text()
    console.log('Error:', errorText.substring(0, 500))
  }
}

debug().catch(console.error)
