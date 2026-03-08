import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== Call Lovable AI with tool calling =====
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

    // ===== STEP 1: Sentiment Analysis =====
    const sentiment = await callAI(
      LOVABLE_API_KEY,
      "You are a music psychology expert. Analyze text for emotional and stylistic signals relevant to music production.",
      `Analyze this music request:
Prompt: "${musicPrompt}"
Genres: ${genres.join(", ") || "Not specified"}
Lyrics: "${lyrics || "None"}"
Artist Inspiration: "${artistInspiration || "None"}"
Tempo: ${tempoBpm} BPM
Mood: "${mood || "Not specified"}"
Vocal Style: ${vocalStyle || "Instrumental"}
Extract: emotion, energy (1-10), darkness (-10 to 10), aggression (1-10).`,
      "extract_sentiment",
      "Extract emotional and stylistic signals",
      {
        emotionPolarity: { type: "string", description: "Primary emotion" },
        energyIntensity: { type: "number", description: "Energy 1-10" },
        darknessBrightness: { type: "number", description: "Darkness(-10) to brightness(10)" },
        aggressionLevel: { type: "number", description: "Aggression 1-10" },
      },
      ["emotionPolarity", "energyIntensity", "darknessBrightness", "aggressionLevel"]
    ) || { emotionPolarity: "neutral", energyIntensity: 5, darknessBrightness: 0, aggressionLevel: 3 };

    // ===== STEP 2: Production Brief =====
    const briefResult = await callAI(
      LOVABLE_API_KEY,
      "You are an expert music producer. Generate a production brief for AI music synthesis. Be specific about instruments, sonic textures, and production techniques.",
      `User prompt: "${musicPrompt}"
Genres: ${genres.join(", ") || "electronic"}
Tempo: ${tempoBpm} BPM
Key: ${musicalKey}
Artist Inspiration: "${artistInspiration || "None"}"
Mood: "${mood || sentiment.emotionPolarity}"
Sentiment: energy=${sentiment.energyIntensity}/10, darkness=${sentiment.darknessBrightness}, aggression=${sentiment.aggressionLevel}/10

Generate a production brief with: genre, subgenre, mood, atmosphere, instruments (4-8 specific instruments), energy description, and musical key/scale recommendations.`,
      "create_production_brief",
      "Create a structured production brief",
      {
        genre: { type: "string", description: "Primary genre" },
        subgenre: { type: "string", description: "Subgenre" },
        mood: { type: "string", description: "Mood description" },
        atmosphere: { type: "string", description: "Atmospheric quality" },
        instruments: {
          type: "array", items: { type: "string" },
          description: "4-8 specific instruments/synths to use",
        },
        energyDescription: { type: "string", description: "Energy arc description" },
        recommendedKey: { type: "string", description: "Musical key, e.g. 'D'" },
        recommendedScale: { type: "string", description: "Scale type, e.g. 'minor'" },
      },
      ["genre", "subgenre", "mood", "atmosphere", "instruments", "energyDescription", "recommendedKey", "recommendedScale"]
    );

    // ===== STEP 3: Song Structure =====
    const structureResult = await callAI(
      LOVABLE_API_KEY,
      `You are a professional song structure planner for ${genres[0] || "electronic"} music.
Plan a song with sections. Each section has a name, duration (seconds), and energy level (0.0 to 1.0).
Section durations MUST sum to EXACTLY ${durationSeconds} seconds.
Common sections: intro, build, drop, breakdown, second_drop, bridge, climax, outro.
Energy should follow a natural arc: low → build → high → break → high → resolve.`,
      `Plan structure for a ${durationSeconds}-second ${genres[0] || "electronic"} track at ${tempoBpm} BPM.
Mood: ${sentiment.emotionPolarity}. Energy: ${sentiment.energyIntensity}/10.
Vocal structure: "${vocalStructure}".
Artist inspiration: "${artistInspiration || "None"}".

Return sections with name, duration (seconds), energy (0.0-1.0), and description.
Durations MUST sum to exactly ${durationSeconds}.`,
      "plan_structure",
      "Plan song structure with sections",
      {
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Section name" },
              duration: { type: "number", description: "Duration in seconds" },
              energy: { type: "number", description: "Energy level 0.0-1.0" },
              description: { type: "string", description: "Musical description" },
            },
            required: ["name", "duration", "energy", "description"],
          },
        },
      },
      ["sections"]
    );

    // Build fallback structure if AI fails
    const aiSections = structureResult?.sections || [];
    let sections: Array<{ name: string; duration: number; energy: number; description: string }>;

    if (aiSections.length > 0) {
      // Normalize durations to match exactly
      const totalAiDur = aiSections.reduce((s: number, sec: any) => s + (sec.duration || 0), 0);
      const ratio = totalAiDur > 0 ? durationSeconds / totalAiDur : 1;
      sections = aiSections.map((sec: any) => ({
        name: sec.name || "section",
        duration: Math.max(2, Math.round((sec.duration || 10) * ratio)),
        energy: Math.max(0, Math.min(1, sec.energy || 0.5)),
        description: sec.description || "",
      }));
      // Fix rounding error on last section
      const currentTotal = sections.reduce((s, sec) => s + sec.duration, 0);
      if (currentTotal !== durationSeconds && sections.length > 0) {
        sections[sections.length - 1].duration += durationSeconds - currentTotal;
      }
    } else {
      // Fallback structure
      const sectionTemplates = [
        { name: "intro", pct: 0.1, energy: 0.2 },
        { name: "build", pct: 0.12, energy: 0.5 },
        { name: "drop", pct: 0.2, energy: 0.9 },
        { name: "breakdown", pct: 0.1, energy: 0.25 },
        { name: "build_2", pct: 0.1, energy: 0.6 },
        { name: "second_drop", pct: 0.2, energy: 0.95 },
        { name: "outro", pct: 0.18, energy: 0.15 },
      ];
      let remaining = durationSeconds;
      sections = sectionTemplates.map((tmpl, i) => {
        const isLast = i === sectionTemplates.length - 1;
        const dur = isLast ? remaining : Math.round(durationSeconds * tmpl.pct);
        remaining -= dur;
        return { name: tmpl.name, duration: Math.max(2, dur), energy: tmpl.energy, description: "" };
      });
    }

    // Parse musical key
    const keyParts = musicalKey.split(/\s+/);
    const rootKey = briefResult?.recommendedKey || keyParts[0] || "D";
    const scaleType = briefResult?.recommendedScale || keyParts.slice(1).join(" ") || "minor";

    // ===== Build MusicIntent =====
    const musicIntent = {
      genre: briefResult?.genre || genres[0] || "electronic",
      subgenre: briefResult?.subgenre || "",
      tempo: tempoBpm,
      key: rootKey,
      scale: scaleType,
      mood: briefResult?.mood || mood || sentiment.emotionPolarity,
      energy: sentiment.energyIntensity,
      structure: sections,
      instruments: briefResult?.instruments || ["kick", "bass", "synth", "pad"],
      atmosphere: briefResult?.atmosphere || "immersive",
      durationSeconds,
    };

    return new Response(JSON.stringify({ musicIntent, sentiment }), {
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
