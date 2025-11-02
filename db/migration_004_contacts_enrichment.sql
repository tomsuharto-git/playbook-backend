-- Migration 004: Contacts Enrichment System
-- Adds tables for caching enriched contact data from People Data Labs API

-- ============================================
-- Contacts Table
-- ============================================
-- Stores enriched contact information for external meeting attendees
-- Prevents redundant API calls by caching data indefinitely

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identity
  email TEXT UNIQUE NOT NULL,
  name TEXT,

  -- PDL enriched data
  company TEXT,
  job_title TEXT,
  seniority TEXT, -- e.g., "entry", "senior", "manager", "director", "vp", "c_suite"
  linkedin_url TEXT,

  -- Tracking when we see this person
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),

  -- PDL API metadata
  pdl_enriched_at TIMESTAMPTZ, -- NULL if never enriched or enrichment failed
  pdl_data JSONB, -- Store full PDL response for future use
  enrichment_status TEXT DEFAULT 'pending', -- 'pending', 'enriched', 'not_found', 'error'

  -- Standard timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON contacts(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company);
CREATE INDEX IF NOT EXISTS idx_contacts_seniority ON contacts(seniority);

-- ============================================
-- PDL API Usage Tracking
-- ============================================
-- Tracks API calls to monitor monthly usage limit (100 free calls/month)

CREATE TABLE IF NOT EXISTS pdl_api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What we looked up
  email TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id),

  -- API response
  status_code INTEGER, -- 200 (success), 404 (not found), 429 (rate limited), etc.
  success BOOLEAN,
  error_message TEXT,

  -- Usage tracking
  called_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for monthly usage queries
CREATE INDEX IF NOT EXISTS idx_pdl_usage_called_at ON pdl_api_usage(called_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdl_usage_success ON pdl_api_usage(success);

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get API usage count for current month
CREATE OR REPLACE FUNCTION get_monthly_pdl_usage()
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM pdl_api_usage
  WHERE called_at >= date_trunc('month', NOW())
    AND called_at < date_trunc('month', NOW()) + INTERVAL '1 month';
$$ LANGUAGE SQL;

-- Function to check if we can make more API calls this month
CREATE OR REPLACE FUNCTION can_make_pdl_call()
RETURNS BOOLEAN AS $$
  SELECT get_monthly_pdl_usage() < 100;
$$ LANGUAGE SQL;

-- ============================================
-- Triggers
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at_trigger
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_contacts_updated_at();

-- ============================================
-- Row Level Security (if using Supabase RLS)
-- ============================================

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdl_api_usage ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (backend uses service key)
CREATE POLICY "Service role has full access to contacts" ON contacts
  FOR ALL USING (true);

CREATE POLICY "Service role has full access to pdl_api_usage" ON pdl_api_usage
  FOR ALL USING (true);

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE contacts IS 'Cached enriched contact data from People Data Labs API';
COMMENT ON TABLE pdl_api_usage IS 'Tracks PDL API calls to monitor 100/month free tier limit';

COMMENT ON COLUMN contacts.enrichment_status IS 'Status: pending (not yet enriched), enriched (successfully enriched), not_found (PDL 404), error (API error)';
COMMENT ON COLUMN contacts.pdl_data IS 'Full JSON response from PDL API for future reference';
COMMENT ON COLUMN contacts.seniority IS 'PDL seniority levels: entry, senior, manager, director, vp, c_suite';

COMMENT ON FUNCTION get_monthly_pdl_usage() IS 'Returns count of PDL API calls made this calendar month';
COMMENT ON FUNCTION can_make_pdl_call() IS 'Returns true if we have not hit 100 API calls this month';
