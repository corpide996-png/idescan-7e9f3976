-- Add founder/inventor information columns to scan_results
ALTER TABLE scan_results 
ADD COLUMN IF NOT EXISTS founder_name TEXT,
ADD COLUMN IF NOT EXISTS founder_country TEXT,
ADD COLUMN IF NOT EXISTS founder_social_media JSONB DEFAULT '{}'::jsonb;