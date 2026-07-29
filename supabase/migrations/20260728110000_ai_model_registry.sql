-- AI Model Registry
-- Stores every discovered model individually with health, capabilities, benchmarks, and routing priority

CREATE TABLE IF NOT EXISTS ai_model_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL,
  discovery_endpoint TEXT NOT NULL,
  
  -- Capabilities (detected via live tests)
  capabilities JSONB NOT NULL DEFAULT '{}',
  
  -- Health metrics (updated via live verification)
  health JSONB NOT NULL DEFAULT '{}',
  
  -- Benchmark results (Nexa-specific tasks)
  benchmarks JSONB NOT NULL DEFAULT '{}',
  
  -- Routing
  routing_priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT false,
  
  -- Cost
  cost JSONB,
  
  -- Metadata
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(provider, model_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_model_registry_provider ON ai_model_registry(provider);
CREATE INDEX IF NOT EXISTS idx_ai_model_registry_enabled ON ai_model_registry(enabled);
CREATE INDEX IF NOT EXISTS idx_ai_model_registry_routing_priority ON ai_model_registry(routing_priority DESC);
CREATE INDEX IF NOT EXISTS idx_ai_model_registry_health_usable ON ai_model_registry(((health->>'usable')::boolean));
CREATE INDEX IF NOT EXISTS idx_ai_model_registry_capabilities_chat ON ai_model_registry(((capabilities->>'chat')::boolean));
CREATE INDEX IF NOT EXISTS idx_ai_model_registry_capabilities_structured_json ON ai_model_registry(((capabilities->>'structuredJSON')::boolean));

-- RLS
ALTER TABLE ai_model_registry ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DROP POLICY IF EXISTS "ai_model_registry_service_role" ON ai_model_registry;
CREATE POLICY "ai_model_registry_service_role" ON ai_model_registry
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read
DROP POLICY IF EXISTS "ai_model_registry_authenticated_read" ON ai_model_registry;
CREATE POLICY "ai_model_registry_authenticated_read" ON ai_model_registry
  FOR SELECT TO authenticated
  USING (true);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_ai_model_registry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_ai_model_registry_updated_at ON ai_model_registry;
CREATE TRIGGER trigger_update_ai_model_registry_updated_at
  BEFORE UPDATE ON ai_model_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_model_registry_updated_at();
