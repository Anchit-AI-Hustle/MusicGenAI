import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== TYPE DEFINITIONS =====

interface SegmentPlan {
  name: string;
  duration: number;
  description: string;
}

interface SongPlan {
  segments: SegmentPlan[];
}

interface GeneratedLyrics {
  text: string;
  segmentTimings: { segment: string; lyrics: string }[];
}

// ===== HELPER: Call Lovable AI with tool calling =====
async function callAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  toolName: string,
  toolDescription: string,
  toolParams: Record<string, any>,
  requiredFields: string[]
): Promise<any> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      temperature: 0.7 + Math.random() * 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: toolName,
          description: toolDescription,
          parameters: {
            type: "object",
            properties: toolParams,
            required: requiredFields,
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`AI call failed (${toolName}):`, response.status, errText);
    return null;
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    return JSON.parse(toolCall.function.arguments);
  }
  return null;
}

// ===== HELPER: Update progress =====
async function updateProgress(
  supabase: any, trackId: string, creationId: string,
  stage: string, progress: number, estimatedTimeLeft?: number
) {
  await supabase.from("tracks").update({
    progress, status: "processing", current_stage: stage,
    estimated_time_left: estimatedTimeLeft ?? 0,
  }).eq("id", trackId);
  await supabase.from("music_creations").update({ progress, status: "processing" }).eq("id", creationId);
  console.log(`[${trackId}] Stage: ${stage} | Progress: ${Math.round(progress * 100)}% | ETA: ${estimatedTimeLeft ?? 0}s`);
}

// ===== HELPER: Check worker health =====
async function checkWorkerHealth(workerUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${workerUrl}/health`, { method: "GET" });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === "ok" && data.musicgen_loaded === true;
  } catch {
    return false;
  }
}

// ===== HELPER: Generate a single segment via worker with retry =====
async function generateSegmentWithRetry(
  workerUrl: string,
  payload: {
    prompt: string; segment_name: string; duration: number;
    tempo: number; genre: string; mood: string; seed: number;
  },
  maxRetries: number = 3,
  timeoutMs: number = 300000,
): Promise<ArrayBuffer> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${workerUrl}/generate-segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Segment worker error (${res.status}):`, errText);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 3000 * attempt));
          continue;
        }
        throw new Error(`Segment generation failed after ${maxRetries} retries: ${errText}`);
      }

      return await res.arrayBuffer();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Segment gen attempt ${attempt}/${maxRetries} error:`, msg);
      if (attempt < maxRetries) {
        // Retry with new seed on final retry
        if (attempt === maxRetries - 1) {
          payload.seed = Math.floor(Math.random() * 2 ** 31);
        }
        await new Promise(r => setTimeout(r, 3000 * attempt));
        continue;
      }
      throw new Error(`Segment '${payload.segment_name}' failed after ${maxRetries} retries: ${msg}`);
    }
  }
  throw new Error("Unreachable");
}

// ===== HELPER: Call worker for stitching =====
async function callStitchWorker(
  workerUrl: string,
  segmentBuffers: ArrayBuffer[],
  crossfadeSeconds: number,
  targetDuration: number,
): Promise<ArrayBuffer> {
  const formData = new FormData();
  for (let i = 0; i < segmentBuffers.length; i++) {
    formData.append("segments", new Blob([segmentBuffers[i]], { type: "audio/wav" }), `segment_${i}.wav`);
  }
  formData.append("crossfade_seconds", String(crossfadeSeconds));
  formData.append("target_duration", String(targetDuration));

  const res = await fetch(`${workerUrl}/stitch`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stitch failed: ${err}`);
  }
  return await res.arrayBuffer();
}

// ===== HELPER: Call worker for mastering =====
async function callMasterWorker(
  workerUrl: string,
  audioBuffer: ArrayBuffer,
): Promise<ArrayBuffer> {
  const formData = new FormData();
  formData.append("audio", new Blob([audioBuffer], { type: "audio/wav" }), "track.wav");
  formData.append("target_lufs", "-14.0");
  formData.append("stereo_width", "1.2");
  formData.append("compression_ratio", "3.0");
  formData.append("compression_threshold_db", "-18.0");

  const res = await fetch(`${workerUrl}/master`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mastering failed: ${err}`);
  }
  return await res.arrayBuffer();
}

// ===== HELPER: Call worker for vocal alignment =====
async function callAlignVocalsWorker(
  workerUrl: string,
  instrumentalBuffer: ArrayBuffer,
  vocalBuffer: ArrayBuffer,
  tempo: number,
): Promise<ArrayBuffer> {
  const formData = new FormData();
  formData.append("instrumental", new Blob([instrumentalBuffer], { type: "audio/wav" }), "instrumental.wav");
  formData.append("vocals", new Blob([vocalBuffer], { type: "audio/wav" }), "vocals.wav");
  formData.append("tempo", String(tempo));

  const res = await fetch(`${workerUrl}/align-vocals`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vocal alignment failed: ${err}`);
  }
  return await res.arrayBuffer();
}

// ===== HELPER: Generate vocals via Bark worker =====
async function callVocalWorker(
  workerUrl: string, text: string, voicePreset: string,
  textTemp: number, waveformTemp: number, timeoutMs: number = 180000,
): Promise<ArrayBuffer | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${workerUrl}/generate-vocals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_preset: voicePreset, text_temp: textTemp, waveform_temp: waveformTemp }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) { const e = await res.text(); console.error("Vocal worker error:", e); return null; }
    return await res.arrayBuffer();
  } catch (e) { console.error("Vocal call error:", e); return null; }
}

// ===== PARALLEL BATCH HELPER =====
async function runParallel<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ===== MAIN PIPELINE =====

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const MUSIC_WORKER_URL = Deno.env.get("MUSIC_WORKER_URL");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!MUSIC_WORKER_URL) {
    return new Response(JSON.stringify({ error: "MUSIC_WORKER_URL not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const workerHealthy = await checkWorkerHealth(MUSIC_WORKER_URL);
  if (!workerHealthy) {
    return new Response(JSON.stringify({ error: "Music generation worker unavailable. Check that the worker service is running." }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { trackId, creationId, input } = await req.json();

    // ================================================================
    // INPUT FREEZE
    // ================================================================
    const frozenInput = {
      musicPrompt: input.musicPrompt || "",
      genres: input.genres || [],
      durationSeconds: input.durationSeconds || 180,
      vocalLanguages: input.vocalLanguages || [],
      lyrics: input.lyrics || "",
      artistInspiration: input.artistInspiration || "",
      tempoBpm: input.tempoBpm || 120,
      vocalStructure: input.vocalStructure || "Instrumental",
      vocalStyle: input.vocalStyle || "",
      vocalIntensity: input.vocalIntensity || 5,
      vocalEffects: input.vocalEffects || [],
    };

    await supabase.from("tracks").update({ status: "processing", progress: 0 }).eq("id", trackId);
    await supabase.from("music_creations").update({ status: "processing", progress: 0 }).eq("id", creationId);

    const durationSec = frozenInput.durationSeconds;
    const hasVocals = !!(frozenInput.lyrics && frozenInput.lyrics.trim().length > 0 && frozenInput.vocalStructure !== "Instrumental");
    const estTotalSec = 60 + Math.ceil(durationSec / 30) * 40 + (hasVocals ? 50 : 0) + 30;
    let etaRemaining = estTotalSec;

    // ================================================================
    // STEP 1 — ANALYZING PROMPT
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Analyzing prompt", 0.02, etaRemaining);

    const sentiment = await callAI(
      LOVABLE_API_KEY,
      "You are a music psychology expert. Analyze text for emotional and stylistic signals relevant to music production.",
      `Analyze this music request:\nPrompt: "${frozenInput.musicPrompt}"\nGenres: ${frozenInput.genres.join(", ") || "Not specified"}\nLyrics: "${frozenInput.lyrics || "None"}"\nArtist Inspiration: "${frozenInput.artistInspiration || "None"}"\nTempo: ${frozenInput.tempoBpm} BPM\nVocal Style: ${frozenInput.vocalStyle || "Instrumental"}\nMood analysis: extract emotion, energy, darkness, aggression, melodic complexity, rhythmic density.`,
      "extract_sentiment",
      "Extract emotional and stylistic signals",
      {
        emotionPolarity: { type: "string", description: "Primary emotion e.g. dark, euphoric, melancholic" },
        energyIntensity: { type: "number", description: "Energy 1-10" },
        darknessBrightness: { type: "number", description: "Darkness(-10) to brightness(10)" },
        aggressionLevel: { type: "number", description: "Aggression 1-10" },
        melodicComplexity: { type: "number", description: "Melodic complexity 1-10" },
        rhythmicDensity: { type: "number", description: "Rhythmic density 1-10" },
      },
      ["emotionPolarity", "energyIntensity", "darknessBrightness", "aggressionLevel", "melodicComplexity", "rhythmicDensity"]
    ) || { emotionPolarity: "neutral", energyIntensity: 5, darknessBrightness: 0, aggressionLevel: 3, melodicComplexity: 5, rhythmicDensity: 5 };

    console.log(`[${trackId}] Sentiment:`, JSON.stringify(sentiment));
    etaRemaining -= 10;

    // ================================================================
    // STEP 2 — PLANNING SONG STRUCTURE (Music Planner)
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Planning song structure", 0.06, etaRemaining);

    const planResult = await callAI(
      LOVABLE_API_KEY,
      `You are a professional song structure planner. Plan a song with segments that sum to EXACTLY ${durationSec} seconds total.
Each segment should be a distinct musical section. Use varied structures — never produce identical plans.
Consider: genre=${frozenInput.genres.join(", ") || "electronic"}, tempo=${frozenInput.tempoBpm}BPM, mood=${sentiment.emotionPolarity}, energy=${sentiment.energyIntensity}/10.
Vocal structure requested: "${frozenInput.vocalStructure}".
IMPORTANT: segment durations MUST sum to exactly ${durationSec} seconds. Each segment should be between 10-60 seconds.
Add slight randomness to durations to ensure uniqueness across generations.`,
      `Plan the structure for a ${durationSec}-second ${frozenInput.genres[0] || "electronic"} track at ${frozenInput.tempoBpm} BPM.
The user wants vocal structure: "${frozenInput.vocalStructure}".
Mood: ${sentiment.emotionPolarity}. Energy: ${sentiment.energyIntensity}/10. Aggression: ${sentiment.aggressionLevel}/10.
Artist inspiration: "${frozenInput.artistInspiration || "None"}".

Return an array of segments with name, duration (seconds), and a vivid description of what happens musically in that section.
Durations MUST sum to exactly ${durationSec}.`,
      "plan_song_structure",
      "Generate structured song plan with named segments",
      {
        segments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Section name e.g. intro, build, drop, breakdown, outro" },
              duration: { type: "number", description: "Duration in seconds" },
              description: { type: "string", description: "What happens musically in this section" },
            },
            required: ["name", "duration", "description"],
          },
        },
      },
      ["segments"]
    );

    let songPlan: SongPlan;
    if (planResult?.segments?.length > 0) {
      // Validate and fix total duration
      const totalPlanned = planResult.segments.reduce((s: number, seg: any) => s + seg.duration, 0);
      if (totalPlanned !== durationSec) {
        // Adjust last segment to make total exact
        const diff = durationSec - totalPlanned;
        planResult.segments[planResult.segments.length - 1].duration += diff;
      }
      songPlan = { segments: planResult.segments };
    } else {
      // Fallback plan
      const intro = Math.min(20, Math.floor(durationSec * 0.1));
      const outro = Math.min(20, Math.floor(durationSec * 0.1));
      const mid = durationSec - intro - outro;
      const build = Math.floor(mid * 0.3);
      const drop = Math.floor(mid * 0.3);
      const breakdown = mid - build - drop;
      songPlan = {
        segments: [
          { name: "intro", duration: intro, description: "Atmospheric opening, ambient textures building anticipation" },
          { name: "build", duration: build, description: "Rising energy with layered percussion and synths" },
          { name: "drop", duration: drop, description: "Full energy peak with all instruments driving hard" },
          { name: "breakdown", duration: breakdown, description: "Emotional break, stripped back to melodic elements" },
          { name: "outro", duration: outro, description: "Gradual fade with reverb tails and ambient decay" },
        ],
      };
    }

    console.log(`[${trackId}] Plan: ${songPlan.segments.map(s => `${s.name}(${s.duration}s)`).join(" → ")}`);
    etaRemaining -= 10;

    // ================================================================
    // STEP 3 — GENERATING SEGMENTS (parallel, max 3 workers)
    // ================================================================
    const totalSegments = songPlan.segments.length;
    await supabase.from("tracks").update({ total_segments: totalSegments }).eq("id", trackId);

    // Create segment DB records
    for (let i = 0; i < totalSegments; i++) {
      await supabase.from("segments").insert({
        track_id: trackId,
        segment_index: i,
        duration_seconds: songPlan.segments[i].duration,
        status: "pending",
      });
    }

    const MAX_PARALLEL = 3;
    const segProgressStart = 0.10;
    const segProgressEnd = hasVocals ? 0.55 : 0.75;
    let completedSegments = 0;

    // Build generation tasks
    const segmentTasks = songPlan.segments.map((seg, idx) => {
      return async (): Promise<ArrayBuffer> => {
        const seed = Math.floor(Math.random() * 2 ** 31);
        const prompt = [
          frozenInput.musicPrompt,
          `${frozenInput.genres.join(", ") || "electronic"} music at ${frozenInput.tempoBpm} BPM.`,
          `Section: ${seg.name} — ${seg.description}.`,
          `Mood: ${sentiment.emotionPolarity}. Energy: ${sentiment.energyIntensity}/10.`,
          frozenInput.artistInspiration ? `Influenced by: ${frozenInput.artistInspiration}.` : "",
          idx > 0 ? "Continue seamlessly from the previous section." : "Begin the track with a clear opening.",
        ].filter(Boolean).join(" ");

        await updateProgress(
          supabase, trackId, creationId,
          `Generating segment ${idx + 1} of ${totalSegments} (${seg.name})`,
          segProgressStart + (completedSegments / totalSegments) * (segProgressEnd - segProgressStart),
          Math.max(0, (totalSegments - completedSegments) * 40 + (hasVocals ? 50 : 0) + 30)
        );

        const buffer = await generateSegmentWithRetry(MUSIC_WORKER_URL!, {
          prompt,
          segment_name: seg.name,
          duration: seg.duration,
          tempo: frozenInput.tempoBpm,
          genre: frozenInput.genres[0] || "electronic",
          mood: sentiment.emotionPolarity,
          seed,
        });

        // Save segment to storage
        const segPath = `tracks/${trackId}/segment_${idx}.wav`;
        await supabase.storage.from("music-files").upload(segPath, new Uint8Array(buffer), {
          contentType: "audio/wav", upsert: true,
        });

        await supabase.from("segments").update({
          storage_path: segPath, status: "completed",
        }).eq("track_id", trackId).eq("segment_index", idx);

        completedSegments++;
        await supabase.from("tracks").update({
          completed_segments: completedSegments,
          progress: segProgressStart + (completedSegments / totalSegments) * (segProgressEnd - segProgressStart),
        }).eq("id", trackId);

        console.log(`[${trackId}] ✅ Segment ${idx + 1}/${totalSegments} (${seg.name}) complete (${buffer.byteLength} bytes)`);
        return buffer;
      };
    });

    let segmentBuffers: ArrayBuffer[];
    try {
      segmentBuffers = await runParallel(segmentTasks, MAX_PARALLEL);
    } catch (e) {
      const errorMsg = `Music generation worker unavailable: ${e instanceof Error ? e.message : String(e)}`;
      console.error(`[${trackId}] ${errorMsg}`);
      await supabase.from("tracks").update({ status: "failed", error_message: errorMsg }).eq("id", trackId);
      await supabase.from("music_creations").update({ status: "failed" }).eq("id", creationId);
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ================================================================
    // STEP 4 — SYNTHESIZING VOCALS (optional)
    // ================================================================
    let vocalBuffer: ArrayBuffer | null = null;
    let generatedLyrics = "";

    if (hasVocals) {
      await updateProgress(supabase, trackId, creationId, "Synthesizing vocals", 0.60, 50);

      // Generate lyrics mapping if needed
      const lyricsResult = await callAI(
        LOVABLE_API_KEY,
        `You are a lyricist. Map lyrics to song segments for vocal performance.`,
        `Map these lyrics to the song segments for a ${frozenInput.genres[0] || "music"} track:
Lyrics: "${frozenInput.lyrics}"
Segments: ${songPlan.segments.map(s => `${s.name} (${s.duration}s)`).join(", ")}
Vocal structure: ${frozenInput.vocalStructure}

Distribute the lyrics across the appropriate vocal sections. Return the full text and per-segment breakdown.`,
        "map_lyrics",
        "Map lyrics to song segments",
        {
          fullText: { type: "string", description: "Complete lyrics text" },
          segmentLyrics: {
            type: "array",
            items: {
              type: "object",
              properties: {
                segment: { type: "string" },
                lyrics: { type: "string" },
              },
              required: ["segment", "lyrics"],
            },
          },
        },
        ["fullText", "segmentLyrics"]
      );

      generatedLyrics = lyricsResult?.fullText || frozenInput.lyrics;

      // Generate vocals from lyrics chunks
      const lyricsLines = frozenInput.lyrics.split(/[.\n]+/).filter((l: string) => l.trim().length > 0);
      const vocalChunks: ArrayBuffer[] = [];
      const textTemp = 0.4 + (frozenInput.vocalIntensity / 10) * 0.6;
      const waveformTemp = 0.4 + (frozenInput.vocalIntensity / 10) * 0.5;

      // Determine bark voice preset
      let voicePreset = "v2/en_speaker_6";
      if (frozenInput.vocalLanguages.includes("Japanese")) voicePreset = "v2/ja_speaker_0";
      else if (frozenInput.vocalLanguages.includes("French")) voicePreset = "v2/fr_speaker_0";
      else if (frozenInput.vocalLanguages.includes("German")) voicePreset = "v2/de_speaker_0";
      else if (frozenInput.vocalLanguages.includes("Korean")) voicePreset = "v2/ko_speaker_0";

      for (let i = 0; i < lyricsLines.length; i++) {
        const line = lyricsLines[i].trim();
        if (!line) continue;

        await updateProgress(
          supabase, trackId, creationId,
          `Synthesizing vocals (${i + 1}/${lyricsLines.length})`,
          0.60 + ((i + 1) / lyricsLines.length) * 0.10,
          Math.max(0, 20 + (lyricsLines.length - i - 1) * 8)
        );

        const vocalText = `[${frozenInput.vocalStyle || "singing"}] ${line}`;
        let chunkBuffer: ArrayBuffer | null = null;
        for (let retry = 0; retry < 3 && !chunkBuffer; retry++) {
          chunkBuffer = await callVocalWorker(MUSIC_WORKER_URL, vocalText, voicePreset, textTemp, waveformTemp);
          if (!chunkBuffer && retry < 2) await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
        }
        if (chunkBuffer) vocalChunks.push(chunkBuffer);
      }

      if (vocalChunks.length > 0) {
        let totalSize = 0;
        for (const buf of vocalChunks) totalSize += buf.byteLength;
        const combined = new Uint8Array(totalSize);
        let off = 0;
        for (const buf of vocalChunks) {
          combined.set(new Uint8Array(buf), off);
          off += buf.byteLength;
        }
        vocalBuffer = combined.buffer;

        const vocalPath = `tracks/${trackId}/vocals.wav`;
        await supabase.storage.from("music-files").upload(vocalPath, combined, {
          contentType: "audio/wav", upsert: true,
        });
        console.log(`[${trackId}] ✅ Vocals generated (${totalSize} bytes)`);
      }
    }

    // ================================================================
    // STEP 5 — STITCHING AUDIO
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Stitching audio", 0.75, 25);

    let stitchedBuffer: ArrayBuffer;
    try {
      stitchedBuffer = await callStitchWorker(MUSIC_WORKER_URL, segmentBuffers, 0.5, durationSec);
      console.log(`[${trackId}] ✅ Stitched (${stitchedBuffer.byteLength} bytes)`);
    } catch (e) {
      // Fallback: raw concatenation
      console.error(`[${trackId}] Stitch worker failed, falling back to raw concat:`, e);
      let totalSize = 0;
      for (const buf of segmentBuffers) totalSize += buf.byteLength;
      const raw = new Uint8Array(totalSize);
      let off = 0;
      for (const buf of segmentBuffers) { raw.set(new Uint8Array(buf), off); off += buf.byteLength; }
      stitchedBuffer = raw.buffer;
    }

    // Save stitched instrumental
    const instrumentalPath = `tracks/${trackId}/instrumental.wav`;
    await supabase.storage.from("music-files").upload(instrumentalPath, new Uint8Array(stitchedBuffer), {
      contentType: "audio/wav", upsert: true,
    });

    // ================================================================
    // STEP 5b — VOCAL ALIGNMENT (if vocals exist)
    // ================================================================
    let mixedBuffer = stitchedBuffer;
    if (vocalBuffer) {
      await updateProgress(supabase, trackId, creationId, "Aligning vocals", 0.80, 18);
      try {
        mixedBuffer = await callAlignVocalsWorker(MUSIC_WORKER_URL, stitchedBuffer, vocalBuffer, frozenInput.tempoBpm);
        console.log(`[${trackId}] ✅ Vocals aligned & mixed`);
      } catch (e) {
        console.error(`[${trackId}] Vocal alignment failed, using instrumental only:`, e);
        mixedBuffer = stitchedBuffer;
      }
    }

    // ================================================================
    // STEP 6 — MASTERING
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Mastering final track", 0.88, 12);

    let masteredBuffer: ArrayBuffer;
    try {
      masteredBuffer = await callMasterWorker(MUSIC_WORKER_URL, mixedBuffer);
      console.log(`[${trackId}] ✅ Mastered (${masteredBuffer.byteLength} bytes)`);
    } catch (e) {
      console.error(`[${trackId}] Mastering failed, using unmastered:`, e);
      masteredBuffer = mixedBuffer;
    }

    // ================================================================
    // STEP 7 — FINAL OUTPUT
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Encoding final track", 0.95, 3);

    const finalPath = `tracks/${trackId}/final.wav`;
    const { error: uploadError } = await supabase.storage
      .from("music-files")
      .upload(finalPath, new Uint8Array(masteredBuffer), { contentType: "audio/wav", upsert: true });

    if (uploadError) {
      console.error("Final upload error:", uploadError);
      await supabase.from("tracks").update({ status: "failed", error_message: "Failed to upload final audio" }).eq("id", trackId);
      return new Response(JSON.stringify({ error: "Upload failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = supabase.storage.from("music-files").getPublicUrl(finalPath);
    const audioUrl = urlData.publicUrl;

    let vocalUrl: string | null = null;
    if (vocalBuffer) {
      const { data: vu } = supabase.storage.from("music-files").getPublicUrl(`tracks/${trackId}/vocals.wav`);
      vocalUrl = vu.publicUrl;
    }

    // Update DB
    await supabase.from("tracks").update({
      status: "completed", audio_url: audioUrl, progress: 1, duration_seconds: durationSec,
    }).eq("id", trackId);

    await supabase.from("music_creations").update({
      status: "completed", progress: 1,
    }).eq("id", creationId);

    console.log(`[${trackId}] ✅ Complete. Audio: ${audioUrl}`);

    return new Response(JSON.stringify({
      success: true,
      trackId,
      final_audio_url: audioUrl,
      vocal_url: vocalUrl,
      duration: durationSec,
      segments_used: songPlan.segments.map(s => ({ name: s.name, duration: s.duration, description: s.description })),
      tempo: frozenInput.tempoBpm,
      generated_lyrics: generatedLyrics || null,
      pipeline: {
        sentiment,
        plan: songPlan,
        hasVocals,
        engine: "musicgen+bark (modular worker)",
      },
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
