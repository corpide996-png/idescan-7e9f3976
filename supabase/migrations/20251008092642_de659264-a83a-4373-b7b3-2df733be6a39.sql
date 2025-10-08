-- Drop the old user_subscriptions table and create scan_unlocks table for per-scan access
DROP TABLE IF EXISTS public.user_subscriptions;

-- Create scan_unlocks table to track which scans are unlocked for which users
CREATE TABLE public.scan_unlocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, scan_id)
);

-- Enable RLS
ALTER TABLE public.scan_unlocks ENABLE ROW LEVEL SECURITY;

-- Users can view their own unlocks
CREATE POLICY "Users can view own unlocks"
ON public.scan_unlocks
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own unlocks
CREATE POLICY "Users can insert own unlocks"
ON public.scan_unlocks
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create function to check if a specific scan is unlocked for a user
CREATE OR REPLACE FUNCTION public.is_scan_unlocked(check_user_id uuid, check_scan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.scan_unlocks
    WHERE user_id = check_user_id
      AND scan_id = check_scan_id
      AND expires_at > NOW()
  )
$function$;

-- Drop the old has_active_subscription function as it's no longer needed
DROP FUNCTION IF EXISTS public.has_active_subscription(uuid);