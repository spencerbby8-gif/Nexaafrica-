// Test environment bootstrap — dummy env so module imports that read
// process.env at load time never throw. No real keys, no real network,
// no real DB: every provider call is mocked at the fetch boundary.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_ANON_KEY = 'anon'

process.env.GEMINI_API_KEY = 'test-gemini'
process.env.GEMINI_API_KEY_BACKUP = 'test-gemini-backup'
process.env.GROQ_API_KEY = 'test-groq'
process.env.CEREBRAS_API_KEY = 'test-cerebras'
process.env.OPENROUTER_API_KEY = 'test-openrouter'
process.env.HUGGINGFACE_API_KEY = 'test-hf'
process.env.MISTRAL_API_KEY = 'test-mistral'
process.env.NVIDIA_API_KEY = 'test-nvidia'
process.env.GITHUB_MODELS_TOKEN = 'test-gh'
process.env.CLOUDFLARE_API_TOKEN = 'test-cf'
process.env.CLOUDFLARE_ACCOUNT_ID = 'test-cf-account'
process.env.COHERE_API_KEY = 'test-cohere'
