import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAI(
  apiKey: string, systemPrompt: string, userPrompt: string,
  toolName: string, toolDescription: string,
  toolParams: Record<string, any>, requiredFields: string[]
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

    const { input } = await req.json();
    const {
      musicPrompt = "", genres = [], durationSeconds = 180,
      lyrics = "", artistInspiration = "", tempoBpm = 120,
      vocalStructure = "Instrumental", vocalStyle = "",
      mood = "", musicalKey = "D minor",
    } = input;

    const genreStr = genres.length > 0 ? genres.join(", ") : "electronic";

    // ===== STEP 1: Sentiment + Production Brief (combined for speed) =====
    const briefResult = await callAI(
      LOVABLE_API_KEY,
      `You are an expert music producer and genre specialist. You deeply understand ${genreStr} music.
Generate a production brief for AI music synthesis. Be specific about instruments, sonic textures, and production techniques appropriate for the genre.
Consider the full history and conventions of the genre when recommending instruments and structures.`,
      `User prompt: "${musicPrompt}"
Genres: ${genreStr}
Tempo: ${tempoBpm} BPM
Key: ${musicalKey}
Artist Inspiration: "${artistInspiration || "None"}"
Mood: "${mood || "not specified"}"
Vocal Style: ${vocalStyle || "Instrumental"}
Lyrics: "${lyrics || "None"}"

Generate a production brief with:
- genre and subgenre classification
- mood and atmosphere description
- 4-8 specific instruments that are authentic to this genre
- energy level 1-10
- recommended key and scale
- energy curve type (build-drop, verse-chorus, through-composed, arc, plateau, escalating)`,
      "create_production_brief",
      "Create a structured production brief for any music genre",
      {
        genre: { type: "string", description: "Primary genre" },
        subgenre: { type: "string", description: "Subgenre" },
        mood: { type: "string", description: "Mood description" },
        atmosphere: { type: "string", description: "Atmospheric quality" },
        instruments: { type: "array", items: { type: "string" }, description: "4-8 genre-authentic instruments" },
        energyLevel: { type: "number", description: "Energy 1-10" },
        recommendedKey: { type: "string", description: "Musical key note e.g. 'D'" },
        recommendedScale: { type: "string", description: "Scale type e.g. 'minor', 'major', 'dorian'" },
        energyCurve: { type: "string", description: "One of: build-drop, verse-chorus, through-composed, arc, plateau, escalating" },
      },
      ["genre", "subgenre", "mood", "atmosphere", "instruments", "energyLevel", "recommendedKey", "recommendedScale", "energyCurve"]
    );

    // ===== STEP 2: Song Structure =====
    const structureResult = await callAI(
      LOVABLE_API_KEY,
      `You are a professional song structure planner specializing in ${genreStr} music.
Plan a song with sections. Each section has a name, duration (seconds), and energy level (0.0 to 1.0).
Section durations MUST sum to EXACTLY ${durationSeconds} seconds.
Use genre-appropriate section names:
- Electronic: intro, build, drop, breakdown, second_drop, outro
- Hip Hop: intro, verse, hook, verse, hook, bridge, hook, outro
- Rock: intro, verse, chorus, verse, chorus, solo, chorus, outro
- Jazz: intro, theme, solo, theme, outro
- Classical: exposition, development, recapitulation, coda
- Pop: intro, verse, pre_chorus, chorus, verse, chorus, bridge, chorus, outro
Energy should follow a natural arc appropriate for the genre.`,
      `Plan structure for a ${durationSeconds}-second ${genreStr} track at ${tempoBpm} BPM.
Mood: ${briefResult?.mood || mood || "neutral"}. Energy: ${briefResult?.energyLevel || 5}/10.
Vocal structure: "${vocalStructure}".
Artist inspiration: "${artistInspiration || "None"}".
Energy curve type: ${briefResult?.energyCurve || "verse-chorus"}.

Return sections with name, duration (seconds), energy (0.0-1.0), and description.
Durations MUST sum to exactly ${durationSeconds}.`,
      "plan_structure",
      "Plan genre-appropriate song structure",
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
      ["sections"]
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
      // Fallback
      const templates: Record<string, Array<{name: string; pct: number; energy: number}>> = {
        'build-drop': [
          { name: "intro", pct: 0.1, energy: 0.2 }, { name: "build", pct: 0.12, energy: 0.5 },
          { name: "drop", pct: 0.2, energy: 0.9 }, { name: "breakdown", pct: 0.1, energy: 0.25 },
          { name: "build_2", pct: 0.1, energy: 0.6 }, { name: "second_drop", pct: 0.2, energy: 0.95 },
          { name: "outro", pct: 0.18, energy: 0.15 },
        ],
        'verse-chorus': [
          { name: "intro", pct: 0.08, energy: 0.2 }, { name: "verse", pct: 0.15, energy: 0.4 },
          { name: "chorus", pct: 0.15, energy: 0.7 }, { name: "verse", pct: 0.15, energy: 0.45 },
          { name: "chorus", pct: 0.15, energy: 0.75 }, { name: "bridge", pct: 0.1, energy: 0.5 },
          { name: "chorus", pct: 0.14, energy: 0.85 }, { name: "outro", pct: 0.08, energy: 0.15 },
        ],
      };
      const curveType = briefResult?.energyCurve || 'verse-chorus';
      const tmpl = templates[curveType] || templates['verse-chorus'];
      let remaining = durationSeconds;
      sections = tmpl.map((t, i) => {
        const isLast = i === tmpl.length - 1;
        const dur = isLast ? remaining : Math.round(durationSeconds * t.pct);
        remaining -= dur;
        return { name: t.name, duration: Math.max(2, dur), energy: t.energy, description: "" };
      });
    }

    // Parse musical key
    const keyParts = musicalKey.split(/\s+/);
    const rootKey = briefResult?.recommendedKey || keyParts[0] || "D";
    const scaleType = briefResult?.recommendedScale || keyParts.slice(1).join(" ") || "minor";

    const musicIntent = {
      genre: briefResult?.genre || genres[0] || "electronic",
      subgenre: briefResult?.subgenre || "",
      tempo: tempoBpm,
      key: rootKey,
      scale: scaleType,
      mood: briefResult?.mood || mood || "neutral",
      energy: briefResult?.energyLevel || 5,
      structure: sections,
      instruments: briefResult?.instruments || ["kick", "bass", "synth", "pad"],
      atmosphere: briefResult?.atmosphere || "immersive",
      durationSeconds,
      genres: genres,
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
