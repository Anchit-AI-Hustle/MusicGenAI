ALTER TABLE public.tracks DROP CONSTRAINT IF EXISTS tracks_status_check;
ALTER TABLE public.tracks ADD CONSTRAINT tracks_status_check CHECK (
  status IN (
    'pending', 'analyzing', 'planning_structure',
    'composing_music', 'generating_instrumental',
    'generating_vocals', 'vocal_alignment',
    'mixing_mastering', 'generating_video', 'encoding_video',
    'finalizing', 'completed', 'failed',
    'audio_complete_video_failed',
    'generating_midi', 'rendering_audio'
  )
);