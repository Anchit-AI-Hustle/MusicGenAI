import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== TYPE DEFINITIONS =====

interface SentimentAnalysis {
  emotionPolarity: string;
  energyIntensity: number;
  darknessBrightness: number;
  aggressionLevel: number;
  melodicComplexity: number;
  rhythmicDensity: number;
}

interface MusicIntent {
  tempo: number;
  scale: string;
  key: string;
  energyCurve: number[];
  instrumentPalette: string[];
  vocalStyle: string;
  genreIdentity: string;
  rhythmStyle: string;
  chordProgression: string[];
  basslineStyle: string;
  melodyCharacter: string;
}

interface SongSection {
  name: string;
  startSec: number;
  endSec: number;
  energy: number;
  density: number;
  instruments: string[];
  description: string;
}

interface HarmonyData {
  chordProgression: string[];
  basslinePattern: string;
  melodyMotifs: string[];
  counterMelodies: string[];
}

interface RhythmData {
  kickPattern: string;
  snarePattern: string;
  hihatPattern: string;
  percussionLayers: string[];
  timeSignature: string;
}

interface VocalPlan {
  hasVocals: boolean;
  style: string;
  phonemeMapping: string;
  melodicContour: string;
  historyPrompt: string;
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
      temperature: 0.7,
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
async function updateProgress(supabase: any, trackId: string, creationId: string, stage: string, progress: number, estimatedTimeLeft?: number) {
  await supabase.from("tracks").update({ progress, status: "processing", current_stage: stage, estimated_time_left: estimatedTimeLeft ?? 0 }).eq("id", trackId);
  await supabase.from("music_creations").update({ progress, status: "processing" }).eq("id", creationId);
  console.log(`[${trackId}] Stage: ${stage} | Progress: ${Math.round(progress * 100)}% | ETA: ${estimatedTimeLeft ?? 0}s`);
}

// ===== HELPER: Call Music Worker for instrumental generation =====
async function callMusicWorker(
  workerUrl: string,
  prompt: string,
  duration: number,
  continuationAudioUrl?: string,
  continuationStart?: number,
  tempoBpm?: number,
  timeoutMs: number = 300000
): Promise<ArrayBuffer | null> {
  try {
    const body: Record<string, any> = { prompt, duration };
    if (continuationAudioUrl) body.continuation_audio_url = continuationAudioUrl;
    if (continuationStart != null) body.continuation_start = continuationStart;
    if (tempoBpm) body.tempo_bpm = tempoBpm;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${workerUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Music worker /generate failed (${res.status}):`, errText);
      return null;
    }

    return await res.arrayBuffer();
  } catch (e) {
    console.error("Music worker call error:", e);
    return null;
  }
}

// ===== HELPER: Call Music Worker for vocal generation =====
async function callVocalWorker(
  workerUrl: string,
  text: string,
  voicePreset: string,
  textTemp: number,
  waveformTemp: number,
  timeoutMs: number = 180000
): Promise<ArrayBuffer | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${workerUrl}/generate-vocals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice_preset: voicePreset,
        text_temp: textTemp,
        waveform_temp: waveformTemp,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Music worker /generate-vocals failed (${res.status}):`, errText);
      return null;
    }

    return await res.arrayBuffer();
  } catch (e) {
    console.error("Vocal worker call error:", e);
    return null;
  }
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const MUSIC_WORKER_URL = Deno.env.get("MUSIC_WORKER_URL");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!MUSIC_WORKER_URL) {
    return new Response(JSON.stringify({ error: "MUSIC_WORKER_URL not configured. Deploy the Python music worker and set the URL." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify worker is healthy before starting pipeline
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
    // STAGE 1 — INPUT FREEZE
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
      frozenAt: new Date().toISOString(),
    };

    await supabase.from("tracks").update({ status: "processing", progress: 0 }).eq("id", trackId);
    await supabase.from("music_creations").update({ status: "processing", progress: 0 }).eq("id", creationId);

    const durationSec = frozenInput.durationSeconds;

    // ================================================================
    // STAGE 2 — SEMANTIC SENTIMENT ANALYSIS
    // ================================================================
    // Estimate total time: ~10s per AI call (7 calls) + ~60s per segment + ~30s vocals + ~15s post
    const totalSegments_est = Math.ceil(durationSec / 30);
    const hasVocals_est = !!(frozenInput.lyrics && frozenInput.lyrics.trim().length > 0);
    const totalEstSec = 70 + (totalSegments_est * 60) + (hasVocals_est ? 40 : 0) + 15;
    let etaRemaining = totalEstSec;

    await updateProgress(supabase, trackId, creationId, "Analyzing sentiment", 0.02, etaRemaining);

    const sentiment: SentimentAnalysis = await callAI(
      LOVABLE_API_KEY,
      "You are a music psychology and sentiment analysis expert. Analyze text for emotional and stylistic signals relevant to music production. Be precise with numeric ratings (1-10 scale).",
      `Analyze the following music request for emotional and stylistic signals:

Prompt: "${frozenInput.musicPrompt}"
Genres: ${frozenInput.genres.join(", ") || "Not specified"}
Lyrics: "${frozenInput.lyrics || "No lyrics"}"
Artist Inspiration: "${frozenInput.artistInspiration || "None"}"
Tempo: ${frozenInput.tempoBpm} BPM
Vocal Structure: ${frozenInput.vocalStructure}
Vocal Style: ${frozenInput.vocalStyle || "Not specified"}
Vocal Intensity: ${frozenInput.vocalIntensity}/10

Extract emotional polarity, energy intensity, darkness/brightness, aggression level, melodic complexity, and rhythmic density.`,
      "extract_sentiment",
      "Extract emotional and stylistic signals from the music description",
      {
        emotionPolarity: { type: "string", description: "Primary emotion: e.g. dark, euphoric, melancholic, aggressive, ethereal, nostalgic" },
        energyIntensity: { type: "number", description: "Energy level 1-10" },
        darknessBrightness: { type: "number", description: "Darkness(-10) to brightness(10) spectrum" },
        aggressionLevel: { type: "number", description: "Aggression 1-10" },
        melodicComplexity: { type: "number", description: "Melodic complexity 1-10" },
        rhythmicDensity: { type: "number", description: "Rhythmic density 1-10" },
      },
      ["emotionPolarity", "energyIntensity", "darknessBrightness", "aggressionLevel", "melodicComplexity", "rhythmicDensity"]
    ) || {
      emotionPolarity: "neutral", energyIntensity: 5, darknessBrightness: 0,
      aggressionLevel: 3, melodicComplexity: 5, rhythmicDensity: 5,
    };

    console.log(`[${trackId}] Sentiment:`, JSON.stringify(sentiment));

    // ================================================================
    // STAGE 3 — MUSICAL INTENT OBJECT
    // ================================================================
    etaRemaining -= 10;
    await updateProgress(supabase, trackId, creationId, "Building music intent", 0.06, etaRemaining);

    const intentResult = await callAI(
      LOVABLE_API_KEY,
      `You are a music theory expert and producer. Convert sentiment analysis into precise musical parameters.
The user has specified a FIXED tempo of ${frozenInput.tempoBpm} BPM — you MUST use this exact value.
Vocal structure: ${frozenInput.vocalStructure}. Vocal style: ${frozenInput.vocalStyle || "instrumental"}. Vocal intensity: ${frozenInput.vocalIntensity}/10. Vocal effects: ${frozenInput.vocalEffects.join(", ") || "none"}.
Sentiment context: emotion=${sentiment.emotionPolarity}, energy=${sentiment.energyIntensity}/10, darkness=${sentiment.darknessBrightness}, aggression=${sentiment.aggressionLevel}/10, melodicComplexity=${sentiment.melodicComplexity}/10, rhythmicDensity=${sentiment.rhythmicDensity}/10.`,
      `Based on this music request, create a complete musical intent object:

Prompt: "${frozenInput.musicPrompt}"
Genres: ${frozenInput.genres.join(", ") || "General"}
Artist Inspiration: "${frozenInput.artistInspiration || "None"}"
FIXED Tempo: ${frozenInput.tempoBpm} BPM (use this exact value)

Define musical key, scale, instruments, vocal style, chord progression, bassline style, melody character, rhythm style, and genre identity. The tempo MUST be ${frozenInput.tempoBpm}.`,
      "create_music_intent",
      "Create structured musical intent from analysis",
      {
        tempo: { type: "number", description: "BPM (60-200)" },
        scale: { type: "string", description: "e.g. minor, major, dorian, phrygian, harmonic minor" },
        key: { type: "string", description: "Musical key e.g. F#, Cm, Ab" },
        instrumentPalette: { type: "array", items: { type: "string" }, description: "List of instruments to use" },
        vocalStyle: { type: "string", description: "Vocal style description e.g. dark female, robotic, rap, choir" },
        genreIdentity: { type: "string", description: "Core genre identity string" },
        rhythmStyle: { type: "string", description: "e.g. four-on-the-floor, syncopated, breakbeat, trap" },
        chordProgression: { type: "array", items: { type: "string" }, description: "Chord symbols e.g. [F#m, D, E, C#]" },
        basslineStyle: { type: "string", description: "Bassline character e.g. rolling, staccato, sub-bass, acid" },
        melodyCharacter: { type: "string", description: "Melody description e.g. arpeggiated, soaring, minimal, call-response" },
      },
      ["tempo", "scale", "key", "instrumentPalette", "vocalStyle", "genreIdentity", "rhythmStyle", "chordProgression", "basslineStyle", "melodyCharacter"]
    );

    const musicIntent: MusicIntent = intentResult ? {
      tempo: frozenInput.tempoBpm, // Always use user-specified BPM
      scale: intentResult.scale,
      key: intentResult.key,
      energyCurve: [],
      instrumentPalette: intentResult.instrumentPalette,
      vocalStyle: frozenInput.vocalStyle || intentResult.vocalStyle || "instrumental",
      genreIdentity: intentResult.genreIdentity,
      rhythmStyle: intentResult.rhythmStyle,
      chordProgression: intentResult.chordProgression,
      basslineStyle: intentResult.basslineStyle,
      melodyCharacter: intentResult.melodyCharacter,
    } : {
      tempo: frozenInput.tempoBpm, scale: "minor", key: "Am", energyCurve: [],
      instrumentPalette: ["synth", "drums", "bass", "pad"],
      vocalStyle: frozenInput.vocalStyle || "instrumental",
      genreIdentity: frozenInput.genres[0] || "electronic",
      rhythmStyle: "four-on-the-floor", chordProgression: ["Am", "F", "C", "G"],
      basslineStyle: "sub-bass", melodyCharacter: "arpeggiated",
    };

    console.log(`[${trackId}] Intent:`, JSON.stringify(musicIntent));

    // ================================================================
    // STAGE 4 — SONG STRUCTURE PLANNING
    // ================================================================
    etaRemaining -= 10;
    await updateProgress(supabase, trackId, creationId, "Planning song structure", 0.10, etaRemaining);

    const structureResult = await callAI(
      LOVABLE_API_KEY,
      `You are a professional song arranger. Plan song structure for a ${durationSec}-second track.
Musical context: ${musicIntent.genreIdentity}, ${musicIntent.tempo} BPM, ${musicIntent.key} ${musicIntent.scale}.
Total duration: ${durationSec} seconds. Sections must cover the entire duration with no gaps or overlaps.
Beat grid: secondsPerBeat = ${(60 / musicIntent.tempo).toFixed(4)}. All section boundaries should align to beat positions.
Vocal structure requested by user: "${frozenInput.vocalStructure}". You MUST follow this structure. Map vocal sections (Verse, Chorus, Bridge, Drop, etc.) to time ranges.`,
      `Plan the structure for a ${durationSec}-second ${musicIntent.genreIdentity} track at ${musicIntent.tempo} BPM.
The user has requested this vocal structure: "${frozenInput.vocalStructure}".
You MUST map these sections to time ranges. If the structure says "Verse – Chorus – Verse – Chorus", create those exact sections in order.
The song should feel like a real composition with proper arrangement.
Return sections with names, time boundaries (in seconds), energy levels (0-1), density (0-1), instruments active, and a brief description of each section's musical role.
Make sure sections perfectly tile from 0 to ${durationSec} seconds. Section boundaries should align with beat positions (beat duration = ${(60 / musicIntent.tempo).toFixed(4)}s).`,
      "plan_structure",
      "Plan song sections with timing and parameters",
      {
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              startSec: { type: "number" },
              endSec: { type: "number" },
              energy: { type: "number" },
              density: { type: "number" },
              instruments: { type: "array", items: { type: "string" } },
              description: { type: "string" },
            },
            required: ["name", "startSec", "endSec", "energy", "density", "instruments", "description"],
          },
        },
      },
      ["sections"]
    );

    let sections: SongSection[] = [];
    if (structureResult?.sections?.length > 0) {
      sections = structureResult.sections;
    } else {
      const introDur = Math.min(30, Math.floor(durationSec * 0.1));
      const outroDur = Math.min(30, Math.floor(durationSec * 0.1));
      const mid = durationSec - introDur - outroDur;
      const buildEnd = introDur + Math.floor(mid * 0.35);
      const peakEnd = introDur + Math.floor(mid * 0.75);
      sections = [
        { name: "intro", startSec: 0, endSec: introDur, energy: 0.3, density: 0.3, instruments: ["pad", "atmosphere"], description: "Atmospheric opening" },
        { name: "build", startSec: introDur, endSec: buildEnd, energy: 0.5, density: 0.5, instruments: musicIntent.instrumentPalette.slice(0, 3), description: "Building tension" },
        { name: "drop", startSec: buildEnd, endSec: peakEnd, energy: 0.9, density: 0.9, instruments: musicIntent.instrumentPalette, description: "Peak energy" },
        { name: "breakdown", startSec: peakEnd, endSec: durationSec - outroDur, energy: 0.5, density: 0.4, instruments: ["pad", "vocal", "percussion"], description: "Emotional breakdown" },
        { name: "outro", startSec: durationSec - outroDur, endSec: durationSec, energy: 0.2, density: 0.2, instruments: ["pad", "atmosphere"], description: "Fading resolution" },
      ];
    }

    musicIntent.energyCurve = sections.map(s => s.energy);
    console.log(`[${trackId}] Structure: ${sections.map(s => `${s.name}(${s.startSec}-${s.endSec}s)`).join(" → ")}`);

    // ================================================================
    // STAGE 5 — HARMONY AND MELODY GENERATION
    // ================================================================
    etaRemaining -= 10;
    await updateProgress(supabase, trackId, creationId, "Generating harmony & melody", 0.14, etaRemaining);

    const harmonyResult: HarmonyData = await callAI(
      LOVABLE_API_KEY,
      `You are a music theory and composition expert. Generate harmonic and melodic material for a ${musicIntent.genreIdentity} track in ${musicIntent.key} ${musicIntent.scale} at ${musicIntent.tempo} BPM.`,
      `Generate musical material for this track:
Genre: ${musicIntent.genreIdentity}
Key: ${musicIntent.key} ${musicIntent.scale}
Tempo: ${musicIntent.tempo} BPM
Mood: ${sentiment.emotionPolarity}
Instruments: ${musicIntent.instrumentPalette.join(", ")}

Create a chord progression, bassline pattern description, main melody motifs, and counter melodies. All must follow the key and scale.`,
      "generate_harmony",
      "Generate harmonic and melodic material",
      {
        chordProgression: { type: "array", items: { type: "string" }, description: "Chord symbols in order" },
        basslinePattern: { type: "string", description: "Bassline rhythmic and melodic pattern description" },
        melodyMotifs: { type: "array", items: { type: "string" }, description: "Description of main melody phrases/motifs" },
        counterMelodies: { type: "array", items: { type: "string" }, description: "Counter melody descriptions" },
      },
      ["chordProgression", "basslinePattern", "melodyMotifs", "counterMelodies"]
    ) || {
      chordProgression: musicIntent.chordProgression,
      basslinePattern: `${musicIntent.basslineStyle} following root notes`,
      melodyMotifs: [`${musicIntent.melodyCharacter} phrase in ${musicIntent.key}`],
      counterMelodies: ["Harmonic accompaniment pad"],
    };

    console.log(`[${trackId}] Harmony: ${harmonyResult.chordProgression.join(" → ")}`);

    // ================================================================
    // STAGE 6 — RHYTHM GENERATION
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "rhythm-generation", 0.17);

    const rhythmResult: RhythmData = await callAI(
      LOVABLE_API_KEY,
      `You are a rhythm programmer and drum pattern designer. Create rhythm patterns for ${musicIntent.genreIdentity} at ${musicIntent.tempo} BPM.`,
      `Design rhythm patterns for:
Genre: ${musicIntent.genreIdentity}
Tempo: ${musicIntent.tempo} BPM
Rhythm style: ${musicIntent.rhythmStyle}
Rhythmic density: ${sentiment.rhythmicDensity}/10
Aggression: ${sentiment.aggressionLevel}/10

Describe kick, snare, hi-hat patterns and percussion layers. Use musical terminology.`,
      "generate_rhythm",
      "Generate rhythmic patterns for the track",
      {
        kickPattern: { type: "string", description: "Kick drum pattern description" },
        snarePattern: { type: "string", description: "Snare/clap pattern description" },
        hihatPattern: { type: "string", description: "Hi-hat pattern description" },
        percussionLayers: { type: "array", items: { type: "string" }, description: "Additional percussion elements" },
        timeSignature: { type: "string", description: "Time signature e.g. 4/4, 3/4, 6/8" },
      },
      ["kickPattern", "snarePattern", "hihatPattern", "percussionLayers", "timeSignature"]
    ) || {
      kickPattern: "Four-on-the-floor", snarePattern: "Backbeat on 2 and 4",
      hihatPattern: "Eighth notes", percussionLayers: ["Ride cymbal", "Shaker"],
      timeSignature: "4/4",
    };

    console.log(`[${trackId}] Rhythm: ${rhythmResult.timeSignature}, kick=${rhythmResult.kickPattern}`);

    // ================================================================
    // STAGE 7 — VOCAL SYNTHESIS PLANNING
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "vocal-planning", 0.20);

    const hasVocals = !!(frozenInput.lyrics && frozenInput.lyrics.trim().length > 0);
    let vocalPlan: VocalPlan = {
      hasVocals,
      style: musicIntent.vocalStyle,
      phonemeMapping: "",
      melodicContour: "",
      historyPrompt: "v2/en_speaker_6", // Bark default voice
    };

    if (hasVocals) {
      const vocalResult = await callAI(
        LOVABLE_API_KEY,
        `You are a vocal producer and phonetics expert. Plan vocal performance for a ${musicIntent.genreIdentity} track.
Vocal style: ${frozenInput.vocalStyle || musicIntent.vocalStyle}. Vocal intensity: ${frozenInput.vocalIntensity}/10 (1=whisper, 10=powerful).
Vocal effects to apply: ${frozenInput.vocalEffects.join(", ") || "none"}.
Vocal structure: ${frozenInput.vocalStructure}.`,
        `Plan vocal performance for these lyrics in a ${musicIntent.genreIdentity} track:
Lyrics: "${frozenInput.lyrics}"
Key: ${musicIntent.key} ${musicIntent.scale}
Tempo: ${musicIntent.tempo} BPM (beat duration: ${(60 / musicIntent.tempo).toFixed(4)}s)
Vocal style requested: ${frozenInput.vocalStyle || musicIntent.vocalStyle}
Vocal intensity: ${frozenInput.vocalIntensity}/10 (1=soft whisper, 10=powerful performance)
Vocal effects: ${frozenInput.vocalEffects.join(", ") || "none"}
Vocal structure: ${frozenInput.vocalStructure}
Languages: ${frozenInput.vocalLanguages.join(", ") || "English"}

Map the lyrics to phoneme timing aligned with the beat grid (${musicIntent.tempo} BPM). Each syllable must land on a beat or sub-beat position.
Describe the melodic contour, and recommend a vocal performance approach that matches intensity ${frozenInput.vocalIntensity}/10.
Choose one of these Bark voice presets: v2/en_speaker_0, v2/en_speaker_1, v2/en_speaker_2, v2/en_speaker_3, v2/en_speaker_4, v2/en_speaker_5, v2/en_speaker_6, v2/en_speaker_7, v2/en_speaker_8, v2/en_speaker_9
For non-English: v2/ja_speaker_0, v2/fr_speaker_0, v2/de_speaker_0, v2/hi_speaker_0, v2/ko_speaker_0, v2/zh_speaker_0`,
        "plan_vocals",
        "Plan vocal synthesis parameters",
        {
          phonemeMapping: { type: "string", description: "Lyrics broken into syllable timing groups with beat alignment" },
          melodicContour: { type: "string", description: "Description of the melody the vocals follow" },
          performanceStyle: { type: "string", description: "How the vocals should be delivered" },
          historyPrompt: { type: "string", description: "Bark voice preset identifier e.g. v2/en_speaker_6" },
        },
        ["phonemeMapping", "melodicContour", "performanceStyle", "historyPrompt"]
      );

      if (vocalResult) {
        vocalPlan.phonemeMapping = vocalResult.phonemeMapping;
        vocalPlan.melodicContour = vocalResult.melodicContour;
        vocalPlan.style = vocalResult.performanceStyle || musicIntent.vocalStyle;
        vocalPlan.historyPrompt = vocalResult.historyPrompt || "v2/en_speaker_6";
      }
    }

    console.log(`[${trackId}] Vocals: hasVocals=${hasVocals}, style=${vocalPlan.style}, barkVoice=${vocalPlan.historyPrompt}`);

    // ================================================================
    // STAGE 8 — INSTRUMENT SYNTHESIS DESCRIPTIONS
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "instrument-synthesis", 0.23);

    const instrumentDescriptions = sections.map(section => {
      const activeInstruments = section.instruments.length > 0
        ? section.instruments
        : musicIntent.instrumentPalette.filter(() => Math.random() < section.density);

      return {
        section: section.name,
        instruments: activeInstruments,
        description: `${section.description}. Instruments: ${activeInstruments.join(", ")}. Energy: ${Math.round(section.energy * 100)}%. Density: ${Math.round(section.density * 100)}%.`,
      };
    });

    // ================================================================
    // STAGE 9 + 10 — INSTRUMENTAL SEGMENT GENERATION (MusicGen via Replicate)
    // ================================================================
    const SEGMENT_DURATION = 30; // MusicGen max ~30s
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
    const segProgressStart = 0.25;
    const segProgressEnd = hasVocals ? 0.65 : 0.85; // Leave room for vocal generation if needed

    for (let segIdx = 0; segIdx < totalSegments; segIdx++) {
      const segDuration = Math.min(SEGMENT_DURATION, durationSec - segIdx * SEGMENT_DURATION);
      const segStartSec = segIdx * SEGMENT_DURATION;
      const segMidpoint = segStartSec + segDuration / 2;

      const currentSection = sections.find(s => segMidpoint >= s.startSec && segMidpoint < s.endSec) || sections[sections.length - 1];
      const sectionInstruments = instrumentDescriptions.find(d => d.section === currentSection.name);

      // Build rich MusicGen prompt with beat grid
      const secondsPerBeat = 60 / musicIntent.tempo;
      const segPrompt = [
        `${musicIntent.genreIdentity} music in ${musicIntent.key} ${musicIntent.scale} at exactly ${musicIntent.tempo} BPM (beat every ${secondsPerBeat.toFixed(3)}s).`,
        frozenInput.musicPrompt,
        `Section: ${currentSection.name} — ${currentSection.description}.`,
        `Active instruments: ${(sectionInstruments?.instruments || musicIntent.instrumentPalette).join(", ")}.`,
        `Energy level: ${Math.round(currentSection.energy * 100)}%. Density: ${Math.round(currentSection.density * 100)}%.`,
        `Chord progression: ${harmonyResult.chordProgression.join(" → ")}. Bassline: ${harmonyResult.basslinePattern}.`,
        `${rhythmResult.timeSignature} time. Kick: ${rhythmResult.kickPattern}. Hi-hats: ${rhythmResult.hihatPattern}.`,
        `Melody: ${harmonyResult.melodyMotifs[0] || musicIntent.melodyCharacter}.`,
        `Mood: ${sentiment.emotionPolarity}. Aggression: ${sentiment.aggressionLevel}/10.`,
        `All drums, bass, and melodies MUST lock to ${musicIntent.tempo} BPM beat grid.`,
        segIdx > 0 ? "Continue seamlessly from the previous section, maintaining musical continuity." : "Begin the track with a clear opening.",
        frozenInput.artistInspiration ? `Influenced by: ${frozenInput.artistInspiration}.` : "",
      ].filter(Boolean).join(" ");

      await updateProgress(
        supabase, trackId, creationId,
        `segment-${segIdx + 1}/${totalSegments}`,
        segProgressStart + (segIdx / totalSegments) * (segProgressEnd - segProgressStart)
      );

      // Generate with MusicGen via Python worker (with retry)
      let audioBuffer: ArrayBuffer | null = null;
      let retries = 0;
      const MAX_RETRIES = 3;

      while (retries < MAX_RETRIES && !audioBuffer) {
        try {
          console.log(`[${trackId}] MusicGen worker segment ${segIdx + 1}/${totalSegments} (attempt ${retries + 1})`);

          // Build continuation context from previously stored segment
          let continuationUrl: string | undefined;
          let continuationStart: number | undefined;

          if (segIdx > 0 && segmentBuffers.length > 0) {
            const prevSegPath = `tracks/${trackId}/segment_${segIdx - 1}.wav`;
            const { data: prevUrl } = supabase.storage.from("music-files").getPublicUrl(prevSegPath);
            if (prevUrl?.publicUrl) {
              continuationUrl = prevUrl.publicUrl;
              continuationStart = Math.max(0, SEGMENT_DURATION - 10); // Last 10s for context
            }
          }

          audioBuffer = await callMusicWorker(
            MUSIC_WORKER_URL,
            segPrompt,
            segDuration,
            continuationUrl,
            continuationStart,
            musicIntent.tempo,
            300000
          );

          if (!audioBuffer) {
            retries++;
            console.error(`[${trackId}] Music worker returned no audio for segment ${segIdx + 1}, retry ${retries}/${MAX_RETRIES}`);
            if (retries < MAX_RETRIES) await new Promise(r => setTimeout(r, 3000 * retries));
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error(`[${trackId}] MusicGen worker error (segment ${segIdx + 1}):`, { segmentIndex: segIdx, prompt: segPrompt.substring(0, 100), errorMessage: errMsg });
          retries++;
          if (retries < MAX_RETRIES) await new Promise(r => setTimeout(r, 3000 * retries));
        }
      }

      if (!audioBuffer) {
        const errorMsg = `Music generation worker failed for segment ${segIdx + 1}/${totalSegments} after ${MAX_RETRIES} retries. Ensure the worker is running at ${MUSIC_WORKER_URL}`;
        console.error(`[${trackId}] ${errorMsg}`);
        await supabase.from("tracks").update({ status: "failed", error_message: errorMsg }).eq("id", trackId);
        await supabase.from("music_creations").update({ status: "failed" }).eq("id", creationId);
        return new Response(JSON.stringify({ error: errorMsg }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!audioBuffer) {
        const errorMsg = `Failed to generate instrumental segment ${segIdx + 1}/${totalSegments} after ${MAX_RETRIES} retries (MusicGen)`;
        console.error(`[${trackId}] ${errorMsg}`);
        await supabase.from("tracks").update({ status: "failed", error_message: errorMsg }).eq("id", trackId);
        await supabase.from("music_creations").update({ status: "failed" }).eq("id", creationId);
        return new Response(JSON.stringify({ error: errorMsg }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Save segment to storage
      const segPath = `tracks/${trackId}/segment_${segIdx}.wav`;
      await supabase.storage.from("music-files").upload(segPath, new Uint8Array(audioBuffer), {
        contentType: "audio/wav", upsert: true,
      });

      await supabase.from("segments").update({
        storage_path: segPath, status: "completed",
      }).eq("track_id", trackId).eq("segment_index", segIdx);

      segmentBuffers.push(audioBuffer);

      await supabase.from("tracks").update({
        completed_segments: segIdx + 1,
        progress: segProgressStart + ((segIdx + 1) / totalSegments) * (segProgressEnd - segProgressStart),
      }).eq("id", trackId);

      console.log(`[${trackId}] ✅ Segment ${segIdx + 1}/${totalSegments} complete (${audioBuffer.byteLength} bytes)`);
    }

    // ================================================================
    // STAGE 7b — VOCAL GENERATION (Bark via Python Worker)
    // ================================================================
    let vocalBuffer: ArrayBuffer | null = null;

    if (hasVocals) {
      await updateProgress(supabase, trackId, creationId, "vocal-generation", 0.70);
      console.log(`[${trackId}] Generating vocals via worker...`);

      // Split lyrics into chunks for Bark (it handles ~15s per generation)
      const lyricsLines = frozenInput.lyrics.split(/[.\n]+/).filter((l: string) => l.trim().length > 0);
      const vocalChunks: ArrayBuffer[] = [];

      for (let i = 0; i < lyricsLines.length; i++) {
        const line = lyricsLines[i].trim();
        if (!line) continue;

        console.log(`[${trackId}] Vocal chunk ${i + 1}/${lyricsLines.length}: "${line.substring(0, 50)}..."`);

        // Map vocal intensity (1-10) to Bark temperature params
        const textTemp = 0.4 + (frozenInput.vocalIntensity / 10) * 0.6;
        const waveformTemp = 0.4 + (frozenInput.vocalIntensity / 10) * 0.5;

        const vocalText = `[${frozenInput.vocalStyle || vocalPlan.style}] ${line}`;

        let retries = 0;
        let chunkBuffer: ArrayBuffer | null = null;

        while (retries < 3 && !chunkBuffer) {
          chunkBuffer = await callVocalWorker(
            MUSIC_WORKER_URL,
            vocalText,
            vocalPlan.historyPrompt,
            textTemp,
            waveformTemp,
            180000
          );
          if (!chunkBuffer) {
            retries++;
            console.error(`[${trackId}] Vocal worker failed for chunk ${i + 1}, retry ${retries}/3`);
            if (retries < 3) await new Promise(r => setTimeout(r, 2000 * retries));
          }
        }

        }

        await updateProgress(
          supabase, trackId, creationId,
          `vocal-chunk-${i + 1}/${lyricsLines.length}`,
          0.70 + (i / lyricsLines.length) * 0.10
        );
      }

      // Concatenate vocal chunks
      if (vocalChunks.length > 0) {
        let totalVocalSize = 0;
        for (const buf of vocalChunks) totalVocalSize += buf.byteLength;
        const vocalFull = new Uint8Array(totalVocalSize);
        let vOffset = 0;
        for (const buf of vocalChunks) {
          vocalFull.set(new Uint8Array(buf), vOffset);
          vOffset += buf.byteLength;
        }
        vocalBuffer = vocalFull.buffer;

        // Save vocals
        const vocalPath = `tracks/${trackId}/vocals.wav`;
        await supabase.storage.from("music-files").upload(vocalPath, vocalFull, {
          contentType: "audio/wav", upsert: true,
        });
        console.log(`[${trackId}] ✅ Vocals generated (${totalVocalSize} bytes, ${vocalChunks.length} chunks)`);
      }
    }

    // ================================================================
    // STAGE 9 — SONG STITCHING (concatenate instrumental segments)
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "stitching", 0.82);

    let totalSize = 0;
    for (const buf of segmentBuffers) totalSize += buf.byteLength;

    const instrumentalBuffer = new Uint8Array(totalSize);
    let offset = 0;
    for (const buf of segmentBuffers) {
      instrumentalBuffer.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }

    // Save stitched instrumental
    const instrumentalPath = `tracks/${trackId}/instrumental.wav`;
    await supabase.storage.from("music-files").upload(instrumentalPath, instrumentalBuffer, {
      contentType: "audio/wav", upsert: true,
    });

    // ================================================================
    // STAGE 10-12 — MIXING & DURATION ENFORCEMENT
    // The final track is the instrumental (mixing vocals requires FFmpeg
    // which isn't available in edge functions; vocal track stored separately)
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "mastering", 0.90);

    // Use instrumental as final output
    // (Vocal mixing would require a dedicated audio processing service)
    const finalBuffer = instrumentalBuffer;

    // ================================================================
    // STAGE 13 — FINAL OUTPUT
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "encoding", 0.95);

    const finalPath = `tracks/${trackId}/final.wav`;
    const { error: uploadError } = await supabase.storage
      .from("music-files")
      .upload(finalPath, finalBuffer, {
        contentType: "audio/wav", upsert: true,
      });

    if (uploadError) {
      console.error("Final upload error:", uploadError);
      await supabase.from("tracks").update({
        status: "failed", error_message: "Failed to upload final audio file",
      }).eq("id", trackId);
      return new Response(JSON.stringify({ error: "Upload failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = supabase.storage.from("music-files").getPublicUrl(finalPath);
    const audioUrl = urlData.publicUrl;

    // Also store vocal URL if vocals were generated
    let vocalUrl: string | null = null;
    if (vocalBuffer) {
      const { data: vocalUrlData } = supabase.storage.from("music-files").getPublicUrl(`tracks/${trackId}/vocals.wav`);
      vocalUrl = vocalUrlData.publicUrl;
    }

    // ================================================================
    // STAGE 14 — DASHBOARD STORAGE
    // ================================================================
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

    console.log(`[${trackId}] ✅ Complete. Audio: ${audioUrl}${vocalUrl ? `, Vocals: ${vocalUrl}` : ""}`);

    return new Response(JSON.stringify({
      success: true,
      trackId,
      audioUrl,
      vocalUrl,
      duration: durationSec,
      segments: totalSegments,
      pipeline: {
        sentiment,
        musicIntent,
        sections: sections.map(s => s.name),
        harmony: harmonyResult.chordProgression,
        rhythm: rhythmResult.timeSignature,
        hasVocals,
        vocalVoice: vocalPlan.historyPrompt,
        engine: "musicgen+bark (worker)",
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
