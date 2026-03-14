import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRng(seed: string) {
  let s = hashSeed(seed);
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

async function callAI(
  apiKey: string, systemPrompt: string, userPrompt: string,
  toolName: string, toolDescription: string,
  toolParams: Record<string, any>, requiredFields: string[],
  randomnessSeed: string,
): Promise<any> {
  const rng = createSeededRng(`${randomnessSeed}:${toolName}:${userPrompt.slice(0, 120)}`);
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      temperature: 0.7 + rng() * 0.2,
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
    if (response.status === 429) throw new Error("RATE_LIMITED");
    if (response.status === 402) throw new Error("PAYMENT_REQUIRED");
    return null;
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    return JSON.parse(toolCall.function.arguments);
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { input, generationDNA } = body;
    const {
      musicPrompt = "", genres = [], durationSeconds = 180,
      lyrics = "", artistInspiration = "", tempoBpm = 120,
      vocalStructure = "Instrumental", vocalStyle = "",
      mood = "", musicalKey = "",
      songStructure = "",
    } = input || {};

    const genreStr = genres.length > 0 ? genres.join(", ") : "not specified — infer from prompt";
    const seedSummary = generationDNA
      ? `Generation seed=${generationDNA.seed}, timestamp=${generationDNA.timestamp}, entropy=${generationDNA.entropy}, motifShape=${generationDNA.motifShape}, grooveBias=${generationDNA.grooveBias}, harmonicMood=${generationDNA.harmonicMood}, textureDensity=${generationDNA.textureDensity}, visualEnergy=${generationDNA.visualEnergy}, colorSignature=${(generationDNA.colorSignature || []).join("/")}, arrangementStyle=${generationDNA.arrangementStyle}`
      : "No generation seed provided";

    // ===== STEP 1: StyleProfile + Production Brief (combined AI call) =====
    const aiSeed = generationDNA?.seed || `${Date.now()}`;
    const styleResult = await callAI(
      LOVABLE_API_KEY,
      `You are the core music generation planner for MuseVibeStudio Hub.
Infer a complete StyleProfile from the user's prompt, even if they never name a genre.
Support ALL musical styles dynamically. Do not rely on fixed song templates, fixed keys, or canned genre defaults.
The GenerationSeed must influence your choices so identical prompts still create different productions.

Return both:
1. A user-facing StyleProfile using these semantic fields:
- tempoTendency
- rhythmComplexity
- groovePattern
- energyLevel
- instrumentPalette
- vocalStyle
- textureDensity
- atmosphere

2. Engine-facing synthesis fields:
- tempo
- rootKey
- scale
- rhythmStyle
- grooveTemplate
- harmonicStyle
- structureTemplate
- energyCurve
- density
- swing
- characteristics

When the GenerationDNA includes arrangementStyle or colorSignature, use them as creative nudges for structure and atmosphere without repeating prior patterns.

Allowed values:
- tempoTendency: very slow, slow, midtempo, fast, very fast
- rhythmComplexity: minimal, steady, driving, syncopated, polyrhythmic
- rhythmStyle: four-on-floor, breakbeat, boom-bap, swing, straight, shuffle, halftime, polyrhythm
- grooveTemplate: warehouse, berlin, acid, minimal, swing, shuffle
- harmonicStyle: minor, major, dorian, phrygian, mixolydian, harmonic_minor, chromatic, pentatonic, blues, whole_tone, lydian
- energyCurve: build-drop, verse-chorus, through-composed, arc, plateau, escalating

For each instrument, use descriptive names like: kick, snare, clap, hihat, ride, bass, acid_synth, pad, lead_synth, strings, brass, guitar_clean, guitar_distorted, piano, organ, sax, flute, percussion, shaker, tambourine, tabla, sitar, erhu, koto, steel_drums, marimba, harp, cello, choir, vocal_chop, field_recording, texture, drone, noise, fx.`,
      `User prompt: "${musicPrompt}"
Genres specified: ${genreStr}
Tempo hint: ${tempoBpm} BPM (user may override — suggest your own if 120 is default)
Artist Inspiration: "${artistInspiration || "None"}"
Mood: "${mood || "infer from prompt"}"
Vocal Style: ${vocalStyle || "Instrumental"}
Lyrics: "${lyrics ? lyrics.substring(0, 200) : "None"}"
Song structure hint: "${songStructure || "generate dynamically"}"
${seedSummary}

Generate a complete StyleProfile with:
1. The actual inferred genre and subgenre (even if user didn't specify)
2. Semantic style fields: tempoTendency, rhythmComplexity, groovePattern, energyLevel, instrumentPalette, vocalStyle, textureDensity, atmosphere
3. Optimal tempo for this style (vary slightly from defaults, e.g. not always exactly 128 for house)
4. Musical key root note and scale that fits the mood
5. Rhythm style, groove template, harmonic style
6. Density (0.0-1.0 how many layers active), swing amount (0.0-1.0)
7. 4-10 specific instruments authentic to this style
8. Energy curve type
9. Song structure as array of section names
10. Mood description
11. Style characteristics (3-5 descriptive words)`,
      "create_style_profile",
      "Create a complete dynamic StyleProfile for any music style inferred from the prompt",
      {
        genre: { type: "string", description: "Primary genre inferred from prompt" },
        subgenre: { type: "string", description: "Specific subgenre" },
        tempoTendency: { type: "string", description: "One of: very slow, slow, midtempo, fast, very fast" },
        rhythmComplexity: { type: "string", description: "One of: minimal, steady, driving, syncopated, polyrhythmic" },
        groovePattern: { type: "string", description: "Descriptive groove pattern such as stomping pulse, rolling shuffle, broken-step swing" },
        instrumentPalette: { type: "array", items: { type: "string" }, description: "4-10 descriptive instrument names authentic to the style" },
        vocalStyleSemantic: { type: "string", description: "Semantic vocal description like airy lead, chant, whispered, robotic, rap, choir, or instrumental" },
        textureDensity: { type: "number", description: "Arrangement density 0.0-1.0" },
        atmosphere: { type: "string", description: "Atmospheric quality" },
        tempo: { type: "number", description: "Optimal BPM for this style (add slight variation, never exact round numbers)" },
        rootKey: { type: "string", description: "Musical key root note e.g. 'C', 'D#', 'Bb'" },
        scale: { type: "string", description: "Scale type: minor, major, dorian, phrygian, mixolydian, harmonic_minor, chromatic, pentatonic, blues, whole_tone, lydian" },
        energyLevel: { type: "number", description: "Energy 1-10" },
        rhythmStyle: { type: "string", description: "One of: four-on-floor, breakbeat, boom-bap, swing, straight, shuffle, halftime, polyrhythm" },
        grooveTemplate: { type: "string", description: "One of: warehouse, berlin, acid, minimal, swing, shuffle" },
        harmonicStyle: { type: "string", description: "Harmonic approach matching the scale choice" },
        density: { type: "number", description: "Layer density 0.0-1.0" },
        swing: { type: "number", description: "Swing amount 0.0-1.0" },
        instruments: { type: "array", items: { type: "string" }, description: "4-10 engine-friendly instrument names" },
        energyCurve: { type: "string", description: "One of: build-drop, verse-chorus, through-composed, arc, plateau, escalating" },
        structureTemplate: { type: "array", items: { type: "string" }, description: "Section names for song structure e.g. ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro']" },
        mood: { type: "string", description: "Mood description" },
        characteristics: { type: "array", items: { type: "string" }, description: "3-5 style characteristic words" },
      },
      ["genre", "subgenre", "tempoTendency", "rhythmComplexity", "groovePattern", "instrumentPalette", "vocalStyleSemantic", "textureDensity", "atmosphere", "tempo", "rootKey", "scale", "energyLevel", "rhythmStyle", "grooveTemplate", "harmonicStyle", "density", "swing", "instruments", "energyCurve", "structureTemplate", "mood", "characteristics"],
      `${aiSeed}:style`
    );

    // ===== STEP 2: Song Structure =====
    const inferredGenre = styleResult?.genre || genres[0] || "electronic";
    // Use raw AI tempo here; music-engine applies DNA-based variation within tempoRange
    const inferredTempo = styleResult?.tempo || tempoBpm;

    const structureResult = await callAI(
      LOVABLE_API_KEY,
      `You are a professional song structure planner. You create unique, dynamic song structures.
NEVER use the same structure twice. Vary section order, duration ratios, and energy curves.
Plan a song with sections. Each section has a name, duration (seconds), energy (0.0 to 1.0), and description.
Section durations MUST sum to EXACTLY ${durationSeconds} seconds.
Use the style's energy curve to guide energy levels across sections.
Consider the inferred style: ${inferredGenre} at ${inferredTempo} BPM.
Use the generation seed and arrangement style to introduce fresh section timing and contrast choices each run.`,
      `Plan structure for a ${durationSeconds}-second ${inferredGenre} track at ${inferredTempo} BPM.
Mood: ${styleResult?.mood || mood || "neutral"}. Energy: ${styleResult?.energyLevel || 5}/10.
Vocal structure: "${vocalStructure}".
Artist inspiration: "${artistInspiration || "None"}".
Energy curve type: ${styleResult?.energyCurve || "verse-chorus"}.
Structure template hint: ${(styleResult?.structureTemplate || []).join(" → ") || "generate freely"}.
Song structure request: "${songStructure || "dynamic"}".
${seedSummary}

Return sections with name, duration (seconds), energy (0.0-1.0), and description.
Durations MUST sum to exactly ${durationSeconds}. Create a UNIQUE structure.`,
      "plan_structure",
      "Plan genre-appropriate song structure with energy curve",
      {
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              duration: { type: "number" },
              energy: { type: "number" },
              description: { type: "string" },
            },
            required: ["name", "duration", "energy", "description"],
          },
        },
      },
      ["sections"],
      `${aiSeed}:structure`
    );

    // Build sections with fallback
    const aiSections = structureResult?.sections || [];
    let sections: Array<{ name: string; duration: number; energy: number; description: string }>;

    if (aiSections.length > 0) {
      const totalAiDur = aiSections.reduce((s: number, sec: any) => s + (sec.duration || 0), 0);
      const ratio = totalAiDur > 0 ? durationSeconds / totalAiDur : 1;
      sections = aiSections.map((sec: any) => ({
        name: sec.name || "section",
        duration: Math.max(2, Math.round((sec.duration || 10) * ratio)),
        energy: Math.max(0, Math.min(1, sec.energy || 0.5)),
        description: sec.description || "",
      }));
      const currentTotal = sections.reduce((s, sec) => s + sec.duration, 0);
      if (currentTotal !== durationSeconds && sections.length > 0) {
        sections[sections.length - 1].duration += durationSeconds - currentTotal;
      }
    } else {
      // Fallback using structureTemplate from style
      const template = styleResult?.structureTemplate || ["intro", "verse", "chorus", "verse", "chorus", "outro"];
      const n = template.length;
      let remaining = durationSeconds;
      sections = template.map((name: string, i: number) => {
        const isLast = i === n - 1;
        const dur = isLast ? remaining : Math.round(durationSeconds / n);
        remaining -= dur;
        return { name, duration: Math.max(2, dur), energy: 0.3 + (i / n) * 0.5, description: "" };
      });
    }

    // Build the StyleProfile that will be used directly by the browser engine
    const styleProfile = {
      tempoTendency: styleResult?.tempoTendency || (inferredTempo < 85 ? "slow" : inferredTempo > 145 ? "fast" : "midtempo"),
      rhythmComplexity: styleResult?.rhythmComplexity || "steady",
      groovePattern: styleResult?.groovePattern || styleResult?.grooveTemplate || "dynamic pulse",
      energyLevel: Math.max(1, Math.min(10, styleResult?.energyLevel || 5)),
      instrumentPalette: styleResult?.instrumentPalette || styleResult?.instruments || ["kick", "bass", "synth", "pad"],
      vocalStyle: styleResult?.vocalStyleSemantic || vocalStyle || (lyrics ? "expressive lead" : "instrumental"),
      textureDensity: Math.max(0, Math.min(1, styleResult?.textureDensity ?? styleResult?.density ?? 0.6)),
      atmosphere: styleResult?.atmosphere || "immersive",
      tempoRange: [Math.max(60, (styleResult?.tempo || inferredTempo) - 5), (styleResult?.tempo || inferredTempo) + 5] as [number, number],
      instruments: styleResult?.instruments || styleResult?.instrumentPalette || ["kick", "bass", "synth", "pad"],
      rhythmStyle: styleResult?.rhythmStyle || "straight",
      grooveTemplate: styleResult?.grooveTemplate || styleResult?.groovePattern || "minimal",
      structureTemplate: styleResult?.structureTemplate || sections.map((s: any) => s.name),
      harmonicStyle: styleResult?.harmonicStyle || "minor",
      energyCurve: styleResult?.energyCurve || "verse-chorus",
      density: Math.max(0, Math.min(1, styleResult?.density ?? styleResult?.textureDensity ?? 0.6)),
      swing: Math.max(0, Math.min(1, styleResult?.swing ?? 0.0)),
      characteristics: styleResult?.characteristics || ["dynamic"],
    };

    // Determine key (with optional GenerationSeed nudge for uniqueness)
    const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const FLAT_TO_SHARP: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
    const fallbackRoot = generationDNA?.harmonicMood != null
      ? ROOTS[Math.floor(generationDNA.harmonicMood * ROOTS.length) % ROOTS.length]
      : "C";
    let rootKey = styleResult?.rootKey || (musicalKey ? musicalKey.split(/\s+/)[0] : fallbackRoot);
    const rootNorm = FLAT_TO_SHARP[rootKey] || rootKey;
    if (generationDNA?.harmonicMood != null) {
      const idx = ROOTS.indexOf(rootNorm);
      if (idx >= 0) {
        const nudge = Math.floor(generationDNA.harmonicMood * 3) - 1;
        rootKey = ROOTS[(idx + nudge + 12) % 12] || rootKey;
      }
    }
    const fallbackScales = ["minor", "major", "dorian", "mixolydian", "harmonic_minor", "pentatonic"];
    const fallbackScale = generationDNA?.motifShape != null
      ? fallbackScales[Math.floor(generationDNA.motifShape * fallbackScales.length) % fallbackScales.length]
      : "minor";
    const scaleType = styleResult?.scale || (musicalKey ? musicalKey.split(/\s+/).slice(1).join(" ") || fallbackScale : fallbackScale);

    const musicIntent = {
      genre: inferredGenre,
      subgenre: styleResult?.subgenre || "",
      tempo: inferredTempo,
      key: rootKey,
      scale: scaleType,
      mood: styleResult?.mood || mood || "neutral",
      energy: styleResult?.energyLevel || 5,
      structure: sections,
      instruments: styleProfile.instruments,
      atmosphere: styleResult?.atmosphere || "immersive",
      durationSeconds,
      genres: genres.length > 0 ? genres : [inferredGenre],
      // NEW: full StyleProfile for the browser engine
      styleProfile,
    };

    return new Response(JSON.stringify({ musicIntent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("analyze-music error:", msg);

    if (msg === "RATE_LIMITED") {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msg === "PAYMENT_REQUIRED") {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
