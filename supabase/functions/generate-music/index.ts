import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MusicIntent {
  tempoRange: [number, number];
  energyCurve: number[];
  rhythmStyle: string;
  instrumentPalette: string[];
  tonalMood: string;
  vocalPlan: string;
  genreIdentityLock: string[];
  sections: Section[];
}

interface Section {
  name: string;
  startSec: number;
  endSec: number;
  energy: number;
  density: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!ELEVENLABS_API_KEY) {
    return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { trackId, creationId, input } = await req.json();

    // ===== STEP 1: INPUT FREEZE =====
    const frozenInput = { ...input, frozenAt: new Date().toISOString() };
    
    await supabase.from("tracks").update({ status: "processing", progress: 0 }).eq("id", trackId);
    await supabase.from("music_creations").update({ status: "processing", progress: 0 }).eq("id", creationId);

    // ===== STEP 2: TEXT TO MEANING =====
    const meaningResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are a music theory and production expert. Analyze the user's music description and extract precise musical parameters.",
          },
          {
            role: "user",
            content: `Analyze this music request and extract musical parameters:
Prompt: ${frozenInput.musicPrompt}
Genres: ${(frozenInput.genres || []).join(", ")}
Duration: ${frozenInput.durationSeconds}s
Lyrics/Theme: ${frozenInput.lyrics || "None"}
Artist Inspiration: ${frozenInput.artistInspiration || "None"}
Vocal Language: ${(frozenInput.vocalLanguages || []).join(", ") || "Instrumental"}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_music_intent",
            description: "Extract structured musical intent from the description",
            parameters: {
              type: "object",
              properties: {
                tempoMin: { type: "number", description: "Minimum BPM" },
                tempoMax: { type: "number", description: "Maximum BPM" },
                rhythmStyle: { type: "string", description: "e.g. four-on-the-floor, syncopated, breakbeat" },
                instruments: { type: "array", items: { type: "string" }, description: "Key instruments" },
                tonalMood: { type: "string", description: "e.g. melancholic minor, euphoric major, dark chromatic" },
                vocalPlan: { type: "string", description: "Vocal approach description" },
                energyProfile: { type: "string", description: "Overall energy arc: e.g. building, steady-high, slow-burn" },
              },
              required: ["tempoMin", "tempoMax", "rhythmStyle", "instruments", "tonalMood", "vocalPlan", "energyProfile"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_music_intent" } },
      }),
    });

    let musicParams: any;
    if (meaningResponse.ok) {
      const meaningData = await meaningResponse.json();
      const toolCall = meaningData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        musicParams = JSON.parse(toolCall.function.arguments);
      }
    }
    if (!musicParams) {
      musicParams = {
        tempoMin: 120, tempoMax: 130, rhythmStyle: "standard",
        instruments: ["synthesizer", "drums", "bass"], tonalMood: "neutral",
        vocalPlan: "instrumental", energyProfile: "building",
      };
    }

    // ===== STEP 3: MUSIC INTENT OBJECT =====
    const durationSec = frozenInput.durationSeconds || 180;

    // ===== STEP 4: STRUCTURE PLANNING =====
    const sections: Section[] = [];
    if (durationSec <= 60) {
      sections.push(
        { name: "intro", startSec: 0, endSec: Math.floor(durationSec * 0.15), energy: 0.3, density: 0.3 },
        { name: "main", startSec: Math.floor(durationSec * 0.15), endSec: Math.floor(durationSec * 0.85), energy: 0.7, density: 0.7 },
        { name: "outro", startSec: Math.floor(durationSec * 0.85), endSec: durationSec, energy: 0.3, density: 0.3 },
      );
    } else {
      const introDur = Math.min(30, Math.floor(durationSec * 0.1));
      const outroDur = Math.min(30, Math.floor(durationSec * 0.1));
      const middleDur = durationSec - introDur - outroDur;
      const buildEnd = introDur + Math.floor(middleDur * 0.35);
      const peakEnd = introDur + Math.floor(middleDur * 0.75);

      sections.push(
        { name: "intro", startSec: 0, endSec: introDur, energy: 0.3, density: 0.3 },
        { name: "build", startSec: introDur, endSec: buildEnd, energy: 0.5, density: 0.5 },
        { name: "peak", startSec: buildEnd, endSec: peakEnd, energy: 0.9, density: 0.9 },
        { name: "breakdown", startSec: peakEnd, endSec: durationSec - outroDur, energy: 0.6, density: 0.5 },
        { name: "outro", startSec: durationSec - outroDur, endSec: durationSec, energy: 0.2, density: 0.2 },
      );
    }

    const musicIntent: MusicIntent = {
      tempoRange: [musicParams.tempoMin, musicParams.tempoMax],
      energyCurve: sections.map(s => s.energy),
      rhythmStyle: musicParams.rhythmStyle,
      instrumentPalette: musicParams.instruments,
      tonalMood: musicParams.tonalMood,
      vocalPlan: musicParams.vocalPlan,
      genreIdentityLock: frozenInput.genres || [],
      sections,
    };

    // ===== STEP 5: SECTION-BY-SECTION GENERATION =====
    // Calculate segments (ElevenLabs music API generates up to ~30s per call)
    const SEGMENT_DURATION = 30;
    const totalSegments = Math.ceil(durationSec / SEGMENT_DURATION);
    
    await supabase.from("tracks").update({ total_segments: totalSegments }).eq("id", trackId);

    // Create segment records
    for (let i = 0; i < totalSegments; i++) {
      await supabase.from("segments").insert({
        track_id: trackId,
        segment_index: i,
        duration_seconds: Math.min(SEGMENT_DURATION, durationSec - i * SEGMENT_DURATION),
        status: "pending",
      });
    }

    const segmentBuffers: ArrayBuffer[] = [];

    for (let segIdx = 0; segIdx < totalSegments; segIdx++) {
      const segDuration = Math.min(SEGMENT_DURATION, durationSec - segIdx * SEGMENT_DURATION);
      
      // Find which section this segment belongs to
      const segMidpoint = segIdx * SEGMENT_DURATION + segDuration / 2;
      const currentSection = sections.find(s => segMidpoint >= s.startSec && segMidpoint < s.endSec) || sections[0];

      // Build prompt with conditioning context
      const segPrompt = `${frozenInput.musicPrompt}. Style: ${(frozenInput.genres || []).join(", ")}. ${musicParams.tonalMood} mood, ${musicParams.rhythmStyle} rhythm, ${Math.round((musicParams.tempoMin + musicParams.tempoMax) / 2)} BPM. Section: ${currentSection.name} (energy ${Math.round(currentSection.energy * 100)}%). Instruments: ${musicParams.instruments.join(", ")}.${segIdx > 0 ? " Continue seamlessly from previous section." : ""}`;

      // Generate with ElevenLabs Music API (with retry)
      let audioBuffer: ArrayBuffer | null = null;
      let retries = 0;
      const MAX_RETRIES = 3;

      while (retries < MAX_RETRIES && !audioBuffer) {
        try {
          const musicResponse = await fetch("https://api.elevenlabs.io/v1/music", {
            method: "POST",
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt: segPrompt,
              duration_seconds: segDuration,
            }),
          });

          if (!musicResponse.ok) {
            const errText = await musicResponse.text();
            console.error(`ElevenLabs error (segment ${segIdx}, attempt ${retries + 1}):`, musicResponse.status, errText);
            retries++;
            if (retries < MAX_RETRIES) await new Promise(r => setTimeout(r, 2000 * retries));
            continue;
          }

          audioBuffer = await musicResponse.arrayBuffer();
        } catch (e) {
          console.error(`Segment ${segIdx} generation error:`, e);
          retries++;
          if (retries < MAX_RETRIES) await new Promise(r => setTimeout(r, 2000 * retries));
        }
      }

      if (!audioBuffer) {
        // Mark as failed
        await supabase.from("tracks").update({
          status: "failed",
          error_message: `Failed to generate segment ${segIdx + 1} after ${MAX_RETRIES} retries`,
        }).eq("id", trackId);
        await supabase.from("music_creations").update({ status: "failed" }).eq("id", creationId);
        
        return new Response(JSON.stringify({ error: `Generation failed at segment ${segIdx + 1}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Save segment to storage
      const segPath = `tracks/${trackId}/segment_${segIdx}.mp3`;
      const segUint = new Uint8Array(audioBuffer);
      
      await supabase.storage.from("music-files").upload(segPath, segUint, {
        contentType: "audio/mpeg",
        upsert: true,
      });

      // Update segment record
      await supabase.from("segments").update({
        storage_path: segPath,
        status: "completed",
      }).eq("track_id", trackId).eq("segment_index", segIdx);

      segmentBuffers.push(audioBuffer);

      // Update progress
      const progress = (segIdx + 1) / totalSegments;
      await supabase.from("tracks").update({
        completed_segments: segIdx + 1,
        progress,
      }).eq("id", trackId);
      await supabase.from("music_creations").update({ progress }).eq("id", creationId);
    }

    // ===== STEP 6 + 7 + 8: COMBINE, DECODE, POST-PROCESS =====
    // Concatenate all MP3 buffers into one continuous file
    // (MP3 frames are independently decodable, so concatenation works for MP3)
    let totalSize = 0;
    for (const buf of segmentBuffers) totalSize += buf.byteLength;
    
    const finalBuffer = new Uint8Array(totalSize);
    let offset = 0;
    for (const buf of segmentBuffers) {
      finalBuffer.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }

    // ===== STEP 9: FILE ENCODING + PERSISTENT STORAGE =====
    const finalPath = `tracks/${trackId}/final.mp3`;
    
    const { error: uploadError } = await supabase.storage
      .from("music-files")
      .upload(finalPath, finalBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("Final upload error:", uploadError);
      await supabase.from("tracks").update({
        status: "failed",
        error_message: "Failed to upload final audio file",
      }).eq("id", trackId);
      
      return new Response(JSON.stringify({ error: "Upload failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from("music-files").getPublicUrl(finalPath);
    const audioUrl = urlData.publicUrl;

    // Update track and creation as completed
    await supabase.from("tracks").update({
      status: "completed",
      audio_url: audioUrl,
      progress: 1,
      duration_seconds: durationSec,
    }).eq("id", trackId);

    await supabase.from("music_creations").update({
      status: "completed",
      progress: 1,
    }).eq("id", creationId);

    return new Response(JSON.stringify({
      success: true,
      trackId,
      audioUrl,
      duration: durationSec,
      segments: totalSegments,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("generate-music error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
