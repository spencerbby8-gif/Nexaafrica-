-- AI Model Catalog
-- Stores discovered and verified models from each provider

CREATE TABLE IF NOT EXISTS ai_model_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,
  models JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_refreshed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_models INTEGER NOT NULL DEFAULT 0,
  verified_models INTEGER NOT NULL DEFAULT 0,
  usable_models INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ai_model_catalog_provider ON ai_model_catalog(provider);
CREATE INDEX IF NOT EXISTS idx_ai_model_catalog_last_refreshed ON ai_model_catalog(last_refreshed DESC);

-- RLS
ALTER TABLE ai_model_catalog ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DROP POLICY IF EXISTS "ai_model_catalog_service_role" ON ai_model_catalog;
CREATE POLICY "ai_model_catalog_service_role" ON ai_model_catalog
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read
DROP POLICY IF EXISTS "ai_model_catalog_authenticated_read" ON ai_model_catalog;
CREATE POLICY "ai_model_catalog_authenticated_read" ON ai_model_catalog
  FOR SELECT TO authenticated
  USING (true);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_ai_model_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_ai_model_catalog_updated_at ON ai_model_catalog;
CREATE TRIGGER trigger_update_ai_model_catalog_updated_at
  BEFORE UPDATE ON ai_model_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_model_catalog_updated_at();
