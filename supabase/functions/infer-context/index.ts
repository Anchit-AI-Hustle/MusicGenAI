import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { description } = await req.json();
    if (!description) {
      return new Response(JSON.stringify({ error: "Description is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `Analyze the song description and extract musical parameters. 
            If a parameter isn't mentioned, infer the most likely choice.
            Return ONLY a raw JSON object with these keys:
            {
              "genre": string,
              "vocalLanguage": string,
              "mood": string,
              "tempo": number,
              "artistInspiration": string,
              "lyricTheme": string,
              "subgenre": string,
              "instrumentalOnly": boolean
            }`
          },
          { role: "user", content: `Song description: "${description}"` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "infer_musical_context",
            description: "Infer musical context from description",
            parameters: {
              type: "object",
              properties: {
                genre: { type: "string" },
                vocalLanguage: { type: "string" },
                mood: { type: "string" },
                tempo: { type: "number" },
                artistInspiration: { type: "string" },
                lyricTheme: { type: "string" },
                subgenre: { type: "string" },
                instrumentalOnly: { type: "boolean" }
              },
              required: ["genre", "vocalLanguage", "mood", "tempo", "artistInspiration", "lyricTheme", "subgenre", "instrumentalOnly"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "infer_musical_context" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI call failed:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI inference failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const result = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : null;

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("infer-context error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
