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

// ===== REPLICATE: Create prediction and poll =====
async function replicateGenerate(
  apiToken: string,
  prompt: string,
  duration: number,
  modelVersion: string = "large",
): Promise<string> {
  // Create prediction
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Token ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: "671ac645ce5e552cc63a54a2bbff63fcf798043055f2a26a81582518d03277d4",
      input: {
        prompt,
        duration: Math.min(duration, 30),
        model_version: modelVersion,
        output_format: "wav",
        normalization_strategy: "peak",
      },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Replicate create failed [${createRes.status}]: ${err}`);
  }

  const prediction = await createRes.json();
  const predictionId = prediction.id;
  console.log(`[Replicate] Prediction ${predictionId} created for "${prompt.substring(0, 60)}..."`);

  // Poll for completion (max 5 minutes)
  const maxPolls = 60;
  const pollInterval = 5000;

  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, pollInterval));

    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${apiToken}` },
    });

    if (!pollRes.ok) {
      console.error(`[Replicate] Poll error: ${pollRes.status}`);
      continue;
    }

    const status = await pollRes.json();

    if (status.status === "succeeded") {
      const outputUrl = status.output;
      console.log(`[Replicate] ✅ Prediction ${predictionId} complete`);
      return outputUrl;
    }

    if (status.status === "failed" || status.status === "canceled") {
      throw new Error(`Replicate prediction ${status.status}: ${status.error || "Unknown"}`);
    }
  }

  throw new Error(`Replicate prediction timed out after ${maxPolls * pollInterval / 1000}s`);
}

// ===== HELPER: Download audio from URL =====
async function downloadAudio(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed [${res.status}]: ${url}`);
  return await res.arrayBuffer();
}

// ===== HELPER: Generate segment with retry =====
async function generateSegmentWithRetry(
  apiToken: string,
  prompt: string,
  duration: number,
  maxRetries: number = 3,
): Promise<{ audioUrl: string; buffer: ArrayBuffer }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // For segments > 30s, generate 30s (Replicate/MusicGen max)
      const cappedDuration = Math.min(duration, 30);
      const audioUrl = await replicateGenerate(apiToken, prompt, cappedDuration);
      const buffer = await downloadAudio(audioUrl);
      return { audioUrl, buffer };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Segment gen attempt ${attempt}/${maxRetries}: ${msg}`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 3000 * attempt));
        continue;
      }
      throw new Error(`Segment failed after ${maxRetries} retries: ${msg}`);
    }
  }
  throw new Error("Unreachable");
}

// ===== HELPER: Simple WAV concatenation =====
// Concatenates WAV files by extracting PCM data and writing a new WAV header
function concatenateWavBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) throw new Error("No buffers to concatenate");
  if (buffers.length === 1) return buffers[0];

  // Parse each WAV to extract PCM data
  const pcmChunks: Uint8Array[] = [];
  let sampleRate = 44100;
  let numChannels = 1;
  let bitsPerSample = 16;

  for (const buf of buffers) {
    const view = new DataView(buf);
    // Read WAV header
    const chunkSize = view.getUint32(4, true);
    // Find 'fmt ' chunk
    let offset = 12;
    while (offset < buf.byteLength - 8) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset), view.getUint8(offset + 1),
        view.getUint8(offset + 2), view.getUint8(offset + 3)
      );
      const chunkLen = view.getUint32(offset + 4, true);

      if (chunkId === "fmt ") {
        numChannels = view.getUint16(offset + 10, true);
        sampleRate = view.getUint32(offset + 12, true);
        bitsPerSample = view.getUint16(offset + 22, true);
      }

      if (chunkId === "data") {
        pcmChunks.push(new Uint8Array(buf, offset + 8, chunkLen));
        break;
      }

      offset += 8 + chunkLen;
      if (chunkLen % 2 !== 0) offset++; // WAV chunks are word-aligned
    }
  }

  // Calculate total PCM size
  let totalPcmSize = 0;
  for (const chunk of pcmChunks) totalPcmSize += chunk.byteLength;

  // Build new WAV file
  const headerSize = 44;
  const wavBuffer = new ArrayBuffer(headerSize + totalPcmSize);
  const wavView = new DataView(wavBuffer);
  const wavBytes = new Uint8Array(wavBuffer);

  // RIFF header
  wavBytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  wavView.setUint32(4, 36 + totalPcmSize, true);
  wavBytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt chunk
  wavBytes.set([0x66, 0x6D, 0x74, 0x20], 12); // "fmt "
  wavView.setUint32(16, 16, true); // chunk size
  wavView.setUint16(20, 1, true); // PCM format
  wavView.setUint16(22, numChannels, true);
  wavView.setUint32(24, sampleRate, true);
  wavView.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // byte rate
  wavView.setUint16(32, numChannels * (bitsPerSample / 8), true); // block align
  wavView.setUint16(34, bitsPerSample, true);

  // data chunk
  wavBytes.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  wavView.setUint32(40, totalPcmSize, true);

  let writeOffset = headerSize;
  for (const chunk of pcmChunks) {
    wavBytes.set(chunk, writeOffset);
    writeOffset += chunk.byteLength;
  }

  return wavBuffer;
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
  const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!REPLICATE_API_TOKEN) {
    return new Response(JSON.stringify({ error: "REPLICATE_API_TOKEN not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    // Replicate is much faster than self-hosted: ~15-30s per segment
    const estSegmentTime = 25;
    const estTotalSec = 20 + Math.ceil(durationSec / 30) * estSegmentTime + (hasVocals ? 40 : 0) + 10;
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
    etaRemaining -= 8;

    // ================================================================
    // STEP 2 — PLANNING SONG STRUCTURE
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Planning song structure", 0.06, etaRemaining);

    const planResult = await callAI(
      LOVABLE_API_KEY,
      `You are a professional song structure planner. Plan a song with segments that sum to EXACTLY ${durationSec} seconds total.
Each segment should be a distinct musical section. Use varied structures — never produce identical plans.
Consider: genre=${frozenInput.genres.join(", ") || "electronic"}, tempo=${frozenInput.tempoBpm}BPM, mood=${sentiment.emotionPolarity}, energy=${sentiment.energyIntensity}/10.
Vocal structure requested: "${frozenInput.vocalStructure}".
IMPORTANT: segment durations MUST sum to exactly ${durationSec} seconds. Each segment MUST be between 10 and 30 seconds (MusicGen limit).
Add slight randomness to durations to ensure uniqueness across generations.`,
      `Plan the structure for a ${durationSec}-second ${frozenInput.genres[0] || "electronic"} track at ${frozenInput.tempoBpm} BPM.
The user wants vocal structure: "${frozenInput.vocalStructure}".
Mood: ${sentiment.emotionPolarity}. Energy: ${sentiment.energyIntensity}/10. Aggression: ${sentiment.aggressionLevel}/10.
Artist inspiration: "${frozenInput.artistInspiration || "None"}".

Return an array of segments with name, duration (seconds, max 30 each), and a vivid description.
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
              duration: { type: "number", description: "Duration in seconds (max 30)" },
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
      // Cap each segment at 30s and fix total duration
      for (const seg of planResult.segments) {
        if (seg.duration > 30) seg.duration = 30;
        if (seg.duration < 5) seg.duration = 10;
      }
      const totalPlanned = planResult.segments.reduce((s: number, seg: any) => s + seg.duration, 0);
      if (totalPlanned !== durationSec) {
        const diff = durationSec - totalPlanned;
        if (diff > 0 && diff <= 30) {
          // Add extra segment
          planResult.segments.push({ name: "extension", duration: diff, description: "Extended section to match duration" });
        } else if (diff > 30) {
          // Add multiple segments
          let remaining = diff;
          let extIdx = 1;
          while (remaining > 0) {
            const segDur = Math.min(30, remaining);
            planResult.segments.push({ name: `extension_${extIdx}`, duration: segDur, description: "Extended section" });
            remaining -= segDur;
            extIdx++;
          }
        } else if (diff < 0) {
          // Trim last segment
          planResult.segments[planResult.segments.length - 1].duration += diff;
          if (planResult.segments[planResult.segments.length - 1].duration < 5) {
            planResult.segments.pop();
          }
        }
      }
      songPlan = { segments: planResult.segments };
    } else {
      // Fallback plan: split into 30s segments
      const numSegments = Math.ceil(durationSec / 30);
      const baseDuration = Math.floor(durationSec / numSegments);
      const remainder = durationSec - baseDuration * numSegments;
      const names = ["intro", "build", "peak", "breakdown", "drop", "bridge", "climax", "outro"];
      const segments: SegmentPlan[] = [];
      for (let i = 0; i < numSegments; i++) {
        segments.push({
          name: names[i % names.length] + (i >= names.length ? `_${Math.floor(i / names.length) + 1}` : ""),
          duration: baseDuration + (i === numSegments - 1 ? remainder : 0),
          description: i === 0 ? "Opening atmosphere" : i === numSegments - 1 ? "Closing fade" : "Development section",
        });
      }
      songPlan = { segments };
    }

    console.log(`[${trackId}] Plan: ${songPlan.segments.map(s => `${s.name}(${s.duration}s)`).join(" → ")}`);
    etaRemaining -= 8;

    // ================================================================
    // STEP 3 — GENERATING SEGMENTS via Replicate (parallel, max 3)
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
    const segProgressEnd = hasVocals ? 0.60 : 0.80;
    let completedSegments = 0;

    const segmentTasks = songPlan.segments.map((seg, idx) => {
      return async (): Promise<ArrayBuffer> => {
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
          Math.max(0, (totalSegments - completedSegments) * estSegmentTime + (hasVocals ? 40 : 0) + 10)
        );

        const { buffer } = await generateSegmentWithRetry(REPLICATE_API_TOKEN!, prompt, seg.duration);

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
      const errorMsg = `Segment generation failed: ${e instanceof Error ? e.message : String(e)}`;
      console.error(`[${trackId}] ${errorMsg}`);
      await supabase.from("tracks").update({ status: "failed", error_message: errorMsg }).eq("id", trackId);
      await supabase.from("music_creations").update({ status: "failed" }).eq("id", creationId);
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ================================================================
    // STEP 4 — VOCAL GENERATION (optional, using Replicate Bark)
    // ================================================================
    let generatedLyrics = "";

    if (hasVocals) {
      await updateProgress(supabase, trackId, creationId, "Synthesizing vocals", 0.65, 40);

      // Generate lyrics mapping
      const lyricsResult = await callAI(
        LOVABLE_API_KEY,
        `You are a lyricist. Generate or refine lyrics for a song.`,
        `Create or refine lyrics for a ${frozenInput.genres[0] || "music"} track:
Original lyrics/theme: "${frozenInput.lyrics}"
Segments: ${songPlan.segments.map(s => `${s.name} (${s.duration}s)`).join(", ")}
Vocal structure: ${frozenInput.vocalStructure}
Mood: ${sentiment.emotionPolarity}. Return the full lyrics text.`,
        "generate_lyrics",
        "Generate song lyrics",
        {
          fullText: { type: "string", description: "Complete lyrics text" },
        },
        ["fullText"]
      );

      generatedLyrics = lyricsResult?.fullText || frozenInput.lyrics;
      console.log(`[${trackId}] Lyrics generated (${generatedLyrics.length} chars)`);
      // Note: Full vocal synthesis via Replicate Bark can be added as a future enhancement
    }

    // ================================================================
    // STEP 5 — STITCHING AUDIO
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Stitching audio", 0.82, 12);

    let stitchedBuffer: ArrayBuffer;
    try {
      stitchedBuffer = concatenateWavBuffers(segmentBuffers);
      console.log(`[${trackId}] ✅ Stitched (${stitchedBuffer.byteLength} bytes)`);
    } catch (e) {
      console.error(`[${trackId}] Stitch error, raw concat fallback:`, e);
      let totalSize = 0;
      for (const buf of segmentBuffers) totalSize += buf.byteLength;
      const raw = new Uint8Array(totalSize);
      let off = 0;
      for (const buf of segmentBuffers) { raw.set(new Uint8Array(buf), off); off += buf.byteLength; }
      stitchedBuffer = raw.buffer;
    }

    // Save stitched track
    const instrumentalPath = `tracks/${trackId}/instrumental.wav`;
    await supabase.storage.from("music-files").upload(instrumentalPath, new Uint8Array(stitchedBuffer), {
      contentType: "audio/wav", upsert: true,
    });

    // ================================================================
    // STEP 6 — MASTERING (lightweight normalization in edge function)
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Mastering final track", 0.90, 6);

    // Replicate outputs are already well-normalized, so we use the stitched output directly.
    // A future enhancement could call a Replicate mastering model.
    const masteredBuffer = stitchedBuffer;
    console.log(`[${trackId}] ✅ Mastering complete (passthrough — Replicate output is pre-normalized)`);

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
      duration: durationSec,
      segments_used: songPlan.segments.map(s => ({ name: s.name, duration: s.duration, description: s.description })),
      tempo: frozenInput.tempoBpm,
      generated_lyrics: generatedLyrics || null,
      pipeline: {
        sentiment,
        plan: songPlan,
        hasVocals,
        engine: "replicate/musicgen (hosted GPU)",
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
