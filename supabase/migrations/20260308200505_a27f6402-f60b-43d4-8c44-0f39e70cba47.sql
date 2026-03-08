
ALTER TABLE public.tracks DROP CONSTRAINT IF EXISTS tracks_status_check;
ALTER TABLE public.tracks ADD CONSTRAINT tracks_status_check CHECK (
  status = ANY (ARRAY[
    'pending'::text, 'analyzing'::text, 'planning_structure'::text, 
    'generating_midi'::text, 'generating_segments'::text, 'rendering_audio'::text,
    'downloading_segments'::text, 'stitching_audio'::text, 'finalizing_audio'::text,
    'mixing_mastering'::text, 'preparing_download'::text,
    'generating_video'::text, 'encoding_video'::text, 'uploading_video'::text,
    'finalizing'::text, 'completed'::text, 'failed'::text,
    'audio_complete_video_failed'::text, 'processing'::text
  ])
);
