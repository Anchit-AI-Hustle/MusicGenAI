-- Allow all client-side pipeline statuses (browser generation + video) so updates are not rejected.
ALTER TABLE public.tracks DROP CONSTRAINT IF EXISTS tracks_status_check;
ALTER TABLE public.tracks ADD CONSTRAINT tracks_status_check CHECK (
  status = ANY (ARRAY[
    'pending'::text,
    'analyzing'::text,
    'processing'::text,
    'planning_structure'::text,
    'generating_midi'::text,
    'generating_segments'::text,
    'rendering_audio'::text,
    'downloading_segments'::text,
    'stitching_audio'::text,
    'finalizing_audio'::text,
    'mixing_mastering'::text,
    'preparing_download'::text,
    'composing_music'::text,
    'generating_instrumental'::text,
    'generating_vocals'::text,
    'vocal_alignment'::text,
    'analyzing_beat_structure'::text,
    'generating_video'::text,
    'rendering_video'::text,
    'encoding_video'::text,
    'transcoding_video'::text,
    'uploading_video'::text,
    'finalizing'::text,
    'completed'::text,
    'failed'::text,
    'audio_complete_video_failed'::text
  ])
);
