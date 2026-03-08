
-- Allow users to delete their own profiles
CREATE POLICY "Users can delete their own profile"
ON public.profiles
FOR DELETE
USING (true);

-- Allow users to delete their own music creations
CREATE POLICY "Users can delete their own creations"
ON public.music_creations
FOR DELETE
USING (true);

-- Allow deleting tracks (for cascade cleanup)
CREATE POLICY "Users can delete tracks"
ON public.tracks
FOR DELETE
USING (true);

-- Allow deleting segments (for cascade cleanup)
CREATE POLICY "Users can delete segments"
ON public.segments
FOR DELETE
USING (true);
