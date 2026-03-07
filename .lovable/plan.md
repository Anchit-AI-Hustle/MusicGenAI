

# Implementation Plan: Complete AI Music Creation Platform

## Important Technical Clarifications

This project runs on **React + Vite + Lovable Cloud** (not Next.js/Firebase/Genkit). The plan maps your requirements to this stack:

| Your Spec | Actual Implementation |
|---|---|
| Next.js App Router | React + Vite SPA (already in place) |
| Firebase Functions | Supabase Edge Functions |
| Firestore | Supabase PostgreSQL (already has tables) |
| Firebase Storage | Supabase Storage buckets |
| Genkit pipelines | Edge function orchestration |
| Gemini Music Generation API | ElevenLabs Music Generation API (no "Gemini Music Gen" API exists) |
| Zustand | React Context (already in place, equivalent) |
| Gemini text model (suggestions) | Lovable AI Gateway (LOVABLE_API_KEY ready) |

---

## Phase 1: Storage + Database Updates

**1a. Create storage bucket** via SQL migration:
- `music-files` bucket (public read, authenticated write)
- RLS policies for upload/download

**1b. Add columns to `tracks` table:**
- `progress` (float, default 0)
- `total_segments` (int)
- `completed_segments` (int, default 0)
- `error_message` (text, nullable)

**1c. Create `segments` table:**
- `id`, `track_id` (FK), `segment_index`, `duration_seconds`, `storage_path`, `created_at`

**1d. Add `progress` column to `music_creations`:**
- Float field for overall generation progress tracking

**1e. Enable realtime** on `tracks` and `music_creations` for live progress updates.

---

## Phase 2: AI Suggest Edge Function

Create `supabase/functions/ai-suggest/index.ts`:
- Uses LOVABLE_API_KEY + Lovable AI Gateway
- Accepts `{ field, value, context }` where context = all other filled fields
- Uses tool calling to return structured suggestions
- Separate prompt templates per field (trackName, prompt, genres, moods, lyrics, structure, artistInspiration, vocalStyle)
- Earlier fields passed as context for later field suggestions
- Returns suggestion text; frontend shows "Apply" button (never auto-applies)

---

## Phase 3: Music Generation Edge Function (9-Step Pipeline)

Create `supabase/functions/generate-music/index.ts`:

**Prerequisites:** Connect **ElevenLabs** connector for actual audio generation.

**Pipeline steps implemented inside the edge function:**

1. **Input Freeze** -- Snapshot all form values into a frozen object, store in DB
2. **Text to Meaning** -- Use Lovable AI to convert prompt + genres + mood into semantic descriptors (tempo range, energy profile, instrument palette, tonal mood)
3. **Music Intent Object** -- Structured JSON: `{ tempoRange, energyCurve, rhythmStyle, instrumentPalette, tonalMood, vocalPlan, genreIdentityLock }`
4. **Structure Planning** -- Divide duration into sections (intro/main/build/peak/outro) with energy/density per section
5. **Section-by-Section Generation** -- Loop: call ElevenLabs API per section (~30s segments), pass conditioning context from previous segment for continuity
6. **Combine Sections** -- Concatenate audio buffers server-side
7. **Decode to Audio** -- Process raw audio at 44.1kHz/16-bit stereo
8. **Post-Processing** -- Apply loudness normalization, fade-in/out (within edge function using audio buffer manipulation)
9. **File Encoding + Storage** -- Encode final MP3/WAV, upload to `music-files` bucket, update track record with `audio_url`

**Progress tracking:** After each segment, update `tracks.completed_segments` in DB. Frontend listens via Supabase Realtime.

**Error handling:** 3 retries per segment. On persistent failure, mark track `status = 'failed'` with `error_message`.

---

## Phase 4: Expand Genre System to 150+ Genres

Replace the 25-genre array with a comprehensive list organized by category (for search, not hierarchy):
- Electronic (30+): Hardstyle, Hard Techno, Acid Techno, Industrial Techno, Psytrance, Dark Psy, Minimal, Deep House, Progressive House, Trance, Drum & Bass, Jungle, Neurofunk, Dubstep, UK Garage, Breakbeat, IDM, Glitch, Vaporwave, Synthwave, Future Bass, etc.
- Rock/Metal (15+): Post-Rock, Shoegaze, Stoner Rock, Doom Metal, Black Metal, Death Metal, Thrash Metal, Progressive Rock, etc.
- Hip Hop/R&B (10+): Trap, Boom Bap, Lo-fi Hip Hop, Drill, Grime, Neo-Soul, etc.
- Jazz/Blues (8+): Bebop, Free Jazz, Jazz Fusion, Acid Jazz, etc.
- Classical/Orchestral (8+): Baroque, Romantic, Contemporary Classical, Cinematic, etc.
- World/Regional (15+): Afrobeats, Reggaeton, K-pop, J-pop, Bollywood, Flamenco, Bossa Nova, etc.
- Ambient/Experimental (10+): Dark Ambient, Drone, Noise, Musique Concrete, etc.

All flat, searchable, multi-selectable.

---

## Phase 5: Wire Frontend

**5a. AI Suggest buttons** -- Each field's "AI Suggest" button calls the edge function, shows suggestion in a toast/popover with "Apply" / "Dismiss" actions. Never auto-fills.

**5b. Generation flow:**
- On "Generate" click: call `generate-music` edge function
- Show progress bar driven by Supabase Realtime subscription on `tracks` table
- Display segment count: "Generating segment 3/6..."
- On completion: show audio player + download button
- Only show most recent result on Create page (replace previous)

**5c. Dashboard:**
- Real `<audio>` player for each track with play/pause/seek/volume
- Download button linking to storage URL
- Realtime status updates for in-progress tracks

**5d. Responsive layout fix:**
- Sidebar collapsed width not applied to main content margin (currently hardcoded `ml-64`)
- Fix to use dynamic margin based on sidebar state

---

## Phase 6: Video Generation (Optional Toggle)

Create `supabase/functions/generate-video/index.ts`:
- Takes finalized audio URL as input
- Uses Lovable AI (gemini-3-pro-image-preview) to generate frame sequences based on energy envelope
- Encodes frames + audio into MP4
- Uploads to storage, updates track `video_url`
- Only runs after audio is fully finalized

---

## Execution Order

1. Connect ElevenLabs connector (required for music generation)
2. Run database migration (storage bucket, segments table, new columns)
3. Deploy `ai-suggest` edge function
4. Deploy `generate-music` edge function
5. Expand genre list in frontend
6. Wire AI Suggest buttons to edge function
7. Wire generation flow with realtime progress
8. Add audio players and download to Dashboard
9. Deploy `generate-video` edge function (if ElevenLabs supports it, otherwise defer)

---

## Files to Create/Modify

| Action | File |
|---|---|
| Create | `supabase/functions/ai-suggest/index.ts` |
| Create | `supabase/functions/generate-music/index.ts` |
| Create | `supabase/functions/generate-video/index.ts` |
| Migrate | New SQL migration (storage bucket, segments table, columns) |
| Modify | `supabase/config.toml` -- add function configs |
| Modify | `src/pages/CreateMusicPage.tsx` -- AI suggest wiring, progress UI, audio player |
| Modify | `src/pages/DashboardPage.tsx` -- real audio/video players, downloads |
| Modify | `src/contexts/MusicContext.tsx` -- realtime subscriptions, generation trigger |
| Modify | `src/pages/Index.tsx` -- fix sidebar width sync |

