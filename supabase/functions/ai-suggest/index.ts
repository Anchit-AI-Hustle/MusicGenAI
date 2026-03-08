import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIELD_PROMPTS: Record<string, string> = {
  trackName: "Suggest a creative, evocative track name for a music piece. Consider the context of other fields if provided.",
  prompt: "Suggest a detailed music prompt describing mood, energy, atmosphere, and imagery for a track. Be vivid and cinematic.",
  genres: "Suggest 2-4 fitting music genres from any style worldwide. Return as comma-separated list.",
  lyrics: "Suggest lyrical themes, storylines, or actual lyrics. Be poetic and emotionally resonant.",
  artistInspiration: "Suggest 2-3 artists whose style would complement this track. Include diverse influences.",
  vocalLanguage: "Suggest vocal language(s) that would best fit this track's genre and mood.",
  videoStyle: "Suggest a visual style for a music video. Be specific about colors, movements, and aesthetic.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { field, value, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const fieldPrompt = FIELD_PROMPTS[field] || "Provide a helpful suggestion for this music creation field.";

    let contextStr = "";
    if (context) {
      const parts: string[] = [];
      if (context.title) parts.push(`Track Name: ${context.title}`);
      if (context.musicPrompt) parts.push(`Prompt: ${context.musicPrompt}`);
      if (context.genres?.length) parts.push(`Genres: ${context.genres.join(", ")}`);
      if (context.durationSeconds) parts.push(`Duration: ${Math.floor(context.durationSeconds / 60)}m ${context.durationSeconds % 60}s`);
      if (context.vocalLanguages?.length) parts.push(`Languages: ${context.vocalLanguages.join(", ")}`);
      if (context.lyrics) parts.push(`Lyrics/Theme: ${context.lyrics}`);
      if (context.artistInspiration) parts.push(`Artist Inspiration: ${context.artistInspiration}`);
      if (parts.length > 0) {
        contextStr = `\n\nContext from other fields:\n${parts.join("\n")}`;
      }
    }

    const currentValueNote = value
      ? `\n\nThe user has already entered: "${value}". Improve, clarify, or expand on it while preserving the user's intent. Do NOT replace their meaning.`
      : "\n\nThe field is empty. Suggest a creative starting point.";

    const systemPrompt = `You are a music production AI assistant. You help users craft their musical vision.
CRITICAL RULES:
- Generate ALL suggestions dynamically based on the user's context. NEVER return example text, template phrases, or placeholder content.
- Every response must be unique and creative. Vary your vocabulary, phrasing, and ideas across calls.
- Analyze the user's filled fields deeply: genre influences mood, mood influences lyrics, BPM influences energy descriptions.
- Be specific, vivid, and inspiring. Avoid generic or cliché descriptions.
- Keep suggestions concise (1-3 sentences max for text fields, or a short list for selection fields).`;

    // Use varying temperature (0.9-1.1) for creative diversity across identical inputs
    const temperature = 0.9 + Math.random() * 0.2;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${fieldPrompt}${contextStr}${currentValueNote}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_suggestion",
              description: "Return a suggestion for the music creation field",
              parameters: {
                type: "object",
                properties: {
                  suggestion: { type: "string", description: "The suggested value for the field" },
                },
                required: ["suggestion"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "provide_suggestion" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI suggestion failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let suggestion = "";

    if (toolCall?.function?.arguments) {
      const args = JSON.parse(toolCall.function.arguments);
      suggestion = args.suggestion || "";
    } else {
      suggestion = data.choices?.[0]?.message?.content || "";
    }

    return new Response(JSON.stringify({ suggestion, field }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-suggest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
