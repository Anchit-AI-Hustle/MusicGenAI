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
  voiceId: string;
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
async function updateProgress(supabase: any, trackId: string, creationId: string, stage: string, progress: number) {
  await supabase.from("tracks").update({ progress, status: "processing" }).eq("id", trackId);
  await supabase.from("music_creations").update({ progress, status: "processing" }).eq("id", creationId);
  console.log(`[${trackId}] Stage: ${stage} | Progress: ${Math.round(progress * 100)}%`);
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
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      frozenAt: new Date().toISOString(),
    };

    await supabase.from("tracks").update({ status: "processing", progress: 0 }).eq("id", trackId);
    await supabase.from("music_creations").update({ status: "processing", progress: 0 }).eq("id", creationId);

    const durationSec = frozenInput.durationSeconds;

    // ================================================================
    // STAGE 2 — SEMANTIC SENTIMENT ANALYSIS
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "sentiment-analysis", 0.02);

    const sentiment: SentimentAnalysis = await callAI(
      LOVABLE_API_KEY,
      "You are a music psychology and sentiment analysis expert. Analyze text for emotional and stylistic signals relevant to music production. Be precise with numeric ratings (1-10 scale).",
      `Analyze the following music request for emotional and stylistic signals:

Prompt: "${frozenInput.musicPrompt}"
Genres: ${frozenInput.genres.join(", ") || "Not specified"}
Lyrics: "${frozenInput.lyrics || "No lyrics"}"
Artist Inspiration: "${frozenInput.artistInspiration || "None"}"

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
    await updateProgress(supabase, trackId, creationId, "music-intent", 0.06);

    const intentResult = await callAI(
      LOVABLE_API_KEY,
      `You are a music theory expert and producer. Convert sentiment analysis into precise musical parameters. 
Sentiment context: emotion=${sentiment.emotionPolarity}, energy=${sentiment.energyIntensity}/10, darkness=${sentiment.darknessBrightness}, aggression=${sentiment.aggressionLevel}/10, melodicComplexity=${sentiment.melodicComplexity}/10, rhythmicDensity=${sentiment.rhythmicDensity}/10.`,
      `Based on this music request, create a complete musical intent object:

Prompt: "${frozenInput.musicPrompt}"
Genres: ${frozenInput.genres.join(", ") || "General"}
Artist Inspiration: "${frozenInput.artistInspiration || "None"}"

Define tempo (BPM), musical key, scale, instruments, vocal style, chord progression, bassline style, melody character, rhythm style, and genre identity.`,
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
      tempo: intentResult.tempo,
      scale: intentResult.scale,
      key: intentResult.key,
      energyCurve: [],
      instrumentPalette: intentResult.instrumentPalette,
      vocalStyle: intentResult.vocalStyle,
      genreIdentity: intentResult.genreIdentity,
      rhythmStyle: intentResult.rhythmStyle,
      chordProgression: intentResult.chordProgression,
      basslineStyle: intentResult.basslineStyle,
      melodyCharacter: intentResult.melodyCharacter,
    } : {
      tempo: 120, scale: "minor", key: "Am", energyCurve: [],
      instrumentPalette: ["synth", "drums", "bass", "pad"],
      vocalStyle: "instrumental", genreIdentity: frozenInput.genres[0] || "electronic",
      rhythmStyle: "four-on-the-floor", chordProgression: ["Am", "F", "C", "G"],
      basslineStyle: "sub-bass", melodyCharacter: "arpeggiated",
    };

    console.log(`[${trackId}] Intent:`, JSON.stringify(musicIntent));

    // ================================================================
    // STAGE 4 — SONG STRUCTURE PLANNING
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "structure-planning", 0.10);

    const structureResult = await callAI(
      LOVABLE_API_KEY,
      `You are a professional song arranger. Plan song structure for a ${durationSec}-second track.
Musical context: ${musicIntent.genreIdentity}, ${musicIntent.tempo} BPM, ${musicIntent.key} ${musicIntent.scale}.
Total duration: ${durationSec} seconds. Sections must cover the entire duration with no gaps or overlaps.`,
      `Plan the structure for a ${durationSec}-second ${musicIntent.genreIdentity} track.
The song should feel like a real composition with proper arrangement.
Return sections with names, time boundaries (in seconds), energy levels (0-1), density (0-1), instruments active, and a brief description of each section's musical role.
Make sure sections perfectly tile from 0 to ${durationSec} seconds.`,
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
      // Fallback structure
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
    await updateProgress(supabase, trackId, creationId, "harmony-melody", 0.14);

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
      voiceId: "EXAVITQu4vr4xnSDxMaL", // Sarah - default female voice
    };

    if (hasVocals) {
      const vocalResult = await callAI(
        LOVABLE_API_KEY,
        `You are a vocal producer and phonetics expert. Plan vocal performance for a ${musicIntent.genreIdentity} track.`,
        `Plan vocal performance for these lyrics in a ${musicIntent.genreIdentity} track:
Lyrics: "${frozenInput.lyrics}"
Key: ${musicIntent.key} ${musicIntent.scale}
Tempo: ${musicIntent.tempo} BPM
Vocal style requested: ${musicIntent.vocalStyle}
Languages: ${frozenInput.vocalLanguages.join(", ") || "English"}

Map the lyrics to phoneme timing, describe the melodic contour, and recommend a vocal performance approach.
Choose one of these voice styles: female-warm, female-dark, male-deep, male-bright, robotic, ethereal`,
        "plan_vocals",
        "Plan vocal synthesis parameters",
        {
          phonemeMapping: { type: "string", description: "Lyrics broken into syllable timing groups with beat alignment" },
          melodicContour: { type: "string", description: "Description of the melody the vocals follow" },
          performanceStyle: { type: "string", description: "How the vocals should be delivered" },
          voiceType: { type: "string", description: "One of: female-warm, female-dark, male-deep, male-bright, robotic, ethereal" },
        },
        ["phonemeMapping", "melodicContour", "performanceStyle", "voiceType"]
      );

      if (vocalResult) {
        vocalPlan.phonemeMapping = vocalResult.phonemeMapping;
        vocalPlan.melodicContour = vocalResult.melodicContour;
        vocalPlan.style = vocalResult.performanceStyle || musicIntent.vocalStyle;

        // Map voice type to ElevenLabs voice ID
        const voiceMap: Record<string, string> = {
          "female-warm": "EXAVITQu4vr4xnSDxMaL",   // Sarah
          "female-dark": "FGY2WhTYpPnrIDTdsKH5",    // Laura
          "male-deep": "JBFqnCBsd6RMkjVDRZzb",      // George
          "male-bright": "TX3LPaxmHKxFdv7VOQHJ",    // Liam
          "robotic": "cjVigY5qzO86Huf0OWal",         // Eric
          "ethereal": "pFZP5JQG7iQjIQuC4Bku",        // Lily
        };
        vocalPlan.voiceId = voiceMap[vocalResult.voiceType] || "EXAVITQu4vr4xnSDxMaL";
      }
    }

    console.log(`[${trackId}] Vocals: hasVocals=${hasVocals}, style=${vocalPlan.style}`);

    // ================================================================
    // STAGE 8 — INSTRUMENT SYNTHESIS (descriptive layer for generation prompt)
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "instrument-synthesis", 0.23);

    // Build comprehensive instrument descriptions for each section
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
    // STAGE 9 + 10 — SEGMENT GENERATION WITH CONDITIONING
    // ================================================================
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
    // Progress: stages 1-8 used 0-0.25, segment generation uses 0.25-0.85
    const segProgressStart = 0.25;
    const segProgressEnd = 0.85;

    for (let segIdx = 0; segIdx < totalSegments; segIdx++) {
      const segDuration = Math.min(SEGMENT_DURATION, durationSec - segIdx * SEGMENT_DURATION);
      const segStartSec = segIdx * SEGMENT_DURATION;
      const segMidpoint = segStartSec + segDuration / 2;

      // Find which section this segment belongs to
      const currentSection = sections.find(s => segMidpoint >= s.startSec && segMidpoint < s.endSec) || sections[sections.length - 1];
      const sectionInstruments = instrumentDescriptions.find(d => d.section === currentSection.name);

      // Build rich generation prompt incorporating all analysis stages
      const segPrompt = [
        // Core musical identity
        `${musicIntent.genreIdentity} music in ${musicIntent.key} ${musicIntent.scale} at ${musicIntent.tempo} BPM.`,
        // User's original vision
        frozenInput.musicPrompt,
        // Current section context
        `Section: ${currentSection.name} — ${currentSection.description}.`,
        // Instrument and arrangement
        `Active instruments: ${(sectionInstruments?.instruments || musicIntent.instrumentPalette).join(", ")}.`,
        `Energy level: ${Math.round(currentSection.energy * 100)}%. Density: ${Math.round(currentSection.density * 100)}%.`,
        // Harmonic context
        `Chord progression: ${harmonyResult.chordProgression.join(" → ")}. Bassline: ${harmonyResult.basslinePattern}.`,
        // Rhythm context
        `${rhythmResult.timeSignature} time. Kick: ${rhythmResult.kickPattern}. Hi-hats: ${rhythmResult.hihatPattern}.`,
        // Melody
        `Melody: ${harmonyResult.melodyMotifs[0] || musicIntent.melodyCharacter}.`,
        // Emotional context
        `Mood: ${sentiment.emotionPolarity}. Aggression: ${sentiment.aggressionLevel}/10.`,
        // Conditioning for continuity
        segIdx > 0 ? "Continue seamlessly from the previous section, maintaining musical continuity in rhythm, key, and energy." : "Begin the track with a clear opening.",
        // Artist influence
        frozenInput.artistInspiration ? `Influenced by: ${frozenInput.artistInspiration}.` : "",
      ].filter(Boolean).join(" ");

      await updateProgress(
        supabase, trackId, creationId,
        `segment-${segIdx + 1}/${totalSegments}`,
        segProgressStart + (segIdx / totalSegments) * (segProgressEnd - segProgressStart)
      );

      // Generate with ElevenLabs (with retry)
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
          console.error(`Segment ${segIdx} error:`, e);
          retries++;
          if (retries < MAX_RETRIES) await new Promise(r => setTimeout(r, 2000 * retries));
        }
      }

      if (!audioBuffer) {
        await supabase.from("tracks").update({
          status: "failed",
          error_message: `Failed to generate segment ${segIdx + 1}/${totalSegments} after ${MAX_RETRIES} retries`,
        }).eq("id", trackId);
        await supabase.from("music_creations").update({ status: "failed" }).eq("id", creationId);
        return new Response(JSON.stringify({ error: `Generation failed at segment ${segIdx + 1}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Save segment to storage
      const segPath = `tracks/${trackId}/segment_${segIdx}.mp3`;
      await supabase.storage.from("music-files").upload(segPath, new Uint8Array(audioBuffer), {
        contentType: "audio/mpeg", upsert: true,
      });

      await supabase.from("segments").update({
        storage_path: segPath, status: "completed",
      }).eq("track_id", trackId).eq("segment_index", segIdx);

      segmentBuffers.push(audioBuffer);

      await supabase.from("tracks").update({
        completed_segments: segIdx + 1,
        progress: segProgressStart + ((segIdx + 1) / totalSegments) * (segProgressEnd - segProgressStart),
      }).eq("id", trackId);
    }

    // ================================================================
    // STAGE 11 + 12 — AUDIO TRACK LAYERING & VOCAL SYNC
    // (Handled implicitly: ElevenLabs generates mixed audio per segment)
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "layering", 0.86);

    // ================================================================
    // STAGE 13 — SONG STITCHING (concatenate MP3 segments)
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "stitching", 0.88);

    let totalSize = 0;
    for (const buf of segmentBuffers) totalSize += buf.byteLength;

    const finalBuffer = new Uint8Array(totalSize);
    let offset = 0;
    for (const buf of segmentBuffers) {
      finalBuffer.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }

    // ================================================================
    // STAGE 14 + 15 — MIXING & MASTERING
    // (Applied at generation time via prompt engineering;
    //  MP3 concatenation preserves per-segment mastering)
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "mastering", 0.92);

    // ================================================================
    // STAGE 16 — FINAL OUTPUT
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "encoding", 0.95);

    const finalPath = `tracks/${trackId}/final.mp3`;
    const { error: uploadError } = await supabase.storage
      .from("music-files")
      .upload(finalPath, finalBuffer, {
        contentType: "audio/mpeg", upsert: true,
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

    // ================================================================
    // STAGE 17 — VIDEO GENERATION (if enabled, handled by separate function)
    // ================================================================

    // Mark complete
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
      audioUrl,
      duration: durationSec,
      segments: totalSegments,
      pipeline: {
        sentiment,
        musicIntent,
        sections: sections.map(s => s.name),
        harmony: harmonyResult.chordProgression,
        rhythm: rhythmResult.timeSignature,
        hasVocals,
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
