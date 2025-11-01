-- Drop the old scan_results table as it's designed for the old feature
DROP TABLE IF EXISTS public.scan_results CASCADE;

-- Create new scan_results table for market analysis
CREATE TABLE public.scan_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Category similarity scores (0-100)
  tech_score NUMERIC,
  fashion_score NUMERIC,
  health_score NUMERIC,
  agriculture_score NUMERIC,
  arts_score NUMERIC,
  
  -- Performance insights
  market_performance JSONB, -- {trend: 'growing/stable/declining', growth_rate: number, market_size: string}
  
  -- Location/sector recommendations
  best_locations JSONB, -- [{location: string, score: number, reason: string}]
  best_sectors JSONB, -- [{sector: string, score: number, potential: string}]
  
  -- AI simulation results
  simulation_data JSONB -- {predicted_success: number, timeline: [], risks: [], opportunities: []}
);

-- Enable RLS
ALTER TABLE public.scan_results ENABLE ROW LEVEL SECURITY;

-- Users can view results for their scans
CREATE POLICY "Users can view results for their scans"
ON public.scan_results
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM scans
    WHERE scans.id = scan_results.scan_id
    AND (scans.user_id = auth.uid() OR scans.user_id IS NULL)
  )
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_results;