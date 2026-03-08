ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS current_stage text DEFAULT 'pending';
ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS estimated_time_left integer DEFAULT 0;