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

const ENHANCE_PROMPTS: Record<string, string> = {
  trackName: "Take this track name and make it more evocative, unique, and memorable. Preserve the core idea but elevate it.",
  prompt: "Take this music prompt and expand it with richer detail — add specific instruments, textures, spatial qualities, and emotional arcs. Make it more vivid and production-ready.",
  genres: "Refine these genre selections — suggest more specific sub-genres or complementary genres that sharpen the sonic identity. Return as comma-separated list.",
  lyrics: "Enhance these lyrics/themes — add more poetic depth, stronger imagery, better flow, and emotional resonance. Keep the core meaning intact.",
  artistInspiration: "Expand on these artist inspirations — add complementary artists that would create a richer sonic palette while staying cohesive.",
  vocalLanguage: "Refine the language selection — suggest languages that would add unique character while fitting the genre and mood.",
  videoStyle: "Enhance this video style description — add specific visual techniques, color palettes, camera movements, and artistic references.",
};

function buildContext(context: any): string {
  if (!context) return "";
  const parts: string[] = [];
  if (context.title) parts.push(`Track Name: ${context.title}`);
  if (context.musicPrompt) parts.push(`Prompt: ${context.musicPrompt}`);
  if (context.genres?.length) parts.push(`Genres: ${context.genres.join(", ")}`);
  if (context.durationSeconds) parts.push(`Duration: ${Math.floor(context.durationSeconds / 60)}m ${context.durationSeconds % 60}s`);
  if (context.vocalLanguages?.length) parts.push(`Languages: ${context.vocalLanguages.join(", ")}`);
  if (context.lyrics) parts.push(`Lyrics/Theme: ${context.lyrics}`);
  if (context.artistInspiration) parts.push(`Artist Inspiration: ${context.artistInspiration}`);
  return parts.length > 0 ? `\n\nContext from other fields:\n${parts.join("\n")}` : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { field, value, context, action = "suggest" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const isEnhance = action === "enhance";
    const prompts = isEnhance ? ENHANCE_PROMPTS : FIELD_PROMPTS;
    const fieldPrompt = prompts[field] || (isEnhance ? "Improve and enhance this value." : "Provide a helpful suggestion for this music creation field.");

    const contextStr = buildContext(context);

    let userContent: string;
    if (isEnhance) {
      userContent = `${fieldPrompt}\n\nCurrent value: "${value}"${contextStr}`;
    } else {
      const currentValueNote = value
        ? `\n\nThe user has already entered: "${value}". Generate a completely NEW and DIFFERENT suggestion. Do NOT repeat or slightly modify their input.`
        : "\n\nThe field is empty. Suggest a creative starting point.";
      userContent = `${fieldPrompt}${contextStr}${currentValueNote}`;
    }

    const systemPrompt = `You are a music production AI assistant. You help users craft their musical vision.
CRITICAL RULES:
- Generate ALL outputs dynamically based on the user's context. NEVER return example text, template phrases, or placeholder content.
- Every response must be unique and creative. Vary your vocabulary, phrasing, and ideas across calls.
- Analyze the user's filled fields deeply: genre influences mood, mood influences lyrics, BPM influences energy descriptions.
- Be specific, vivid, and inspiring. Avoid generic or cliché descriptions.
- Keep output concise (1-3 sentences max for text fields, or a short comma-separated list for selection fields like genres/languages).
- For the "genres" field, return ONLY a comma-separated list of genre names, nothing else.
- For the "vocalLanguage" field, return ONLY a comma-separated list of language names, nothing else.`;

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
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_suggestion",
              description: "Return the suggestion or enhanced value for the music creation field",
              parameters: {
                type: "object",
                properties: {
                  suggestion: { type: "string", description: "The suggested or enhanced value for the field" },
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
