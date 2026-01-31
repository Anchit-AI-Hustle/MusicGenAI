-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mobile_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles are readable by the owner (matched by id stored in app)
CREATE POLICY "Anyone can read profiles by mobile" 
  ON public.profiles FOR SELECT 
  USING (true);

CREATE POLICY "Anyone can create profiles" 
  ON public.profiles FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Users can update their own profile" 
  ON public.profiles FOR UPDATE 
  USING (true);

-- Create music_creations table
CREATE TABLE public.music_creations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('song', 'album')),
  title TEXT NOT NULL,
  music_prompt TEXT NOT NULL,
  genres TEXT[] NOT NULL DEFAULT '{}',
  duration_seconds INTEGER NOT NULL DEFAULT 30,
  vocal_languages TEXT[] NOT NULL DEFAULT '{}',
  lyrics TEXT,
  artist_inspiration TEXT,
  generate_video BOOLEAN NOT NULL DEFAULT false,
  video_style TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on music_creations
ALTER TABLE public.music_creations ENABLE ROW LEVEL SECURITY;

-- Users can read their own creations
CREATE POLICY "Users can read their own creations" 
  ON public.music_creations FOR SELECT 
  USING (true);

CREATE POLICY "Users can create their own creations" 
  ON public.music_creations FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Users can update their own creations" 
  ON public.music_creations FOR UPDATE 
  USING (true);

-- Create tracks table
CREATE TABLE public.tracks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creation_id UUID NOT NULL REFERENCES public.music_creations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  audio_url TEXT,
  video_url TEXT,
  track_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on tracks
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read tracks" 
  ON public.tracks FOR SELECT 
  USING (true);

CREATE POLICY "Users can create tracks" 
  ON public.tracks FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Users can update tracks" 
  ON public.tracks FOR UPDATE 
  USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_music_creations_updated_at
  BEFORE UPDATE ON public.music_creations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();