-- Create storage bucket for music files
INSERT INTO storage.buckets (id, name, public)
VALUES ('music-files', 'music-files', true);

-- RLS policies for music-files bucket
CREATE POLICY "Anyone can read music files"
ON storage.objects FOR SELECT
USING (bucket_id = 'music-files');

CREATE POLICY "Authenticated users can upload music files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'music-files');

CREATE POLICY "Authenticated users can update music files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'music-files');

-- Add progress tracking columns to tracks
ALTER TABLE public.tracks
ADD COLUMN IF NOT EXISTS progress real DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_segments integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS completed_segments integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_message text;

-- Add progress column to music_creations
ALTER TABLE public.music_creations
ADD COLUMN IF NOT EXISTS progress real DEFAULT 0;

-- Create segments table
CREATE TABLE IF NOT EXISTS public.segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  segment_index integer NOT NULL DEFAULT 0,
  duration_seconds integer NOT NULL DEFAULT 30,
  storage_path text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for segments
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read segments"
ON public.segments FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert segments"
ON public.segments FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update segments"
ON public.segments FOR UPDATE
USING (true);

-- Enable realtime for tracks and music_creations
ALTER PUBLICATION supabase_realtime ADD TABLE public.tracks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.music_creations;