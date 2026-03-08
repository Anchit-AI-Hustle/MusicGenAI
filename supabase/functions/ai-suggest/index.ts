import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MOOD_DESCRIPTORS = [
  "dark", "aggressive", "melancholic", "uplifting", "atmospheric", "hypnotic",
  "ethereal", "brooding", "euphoric", "haunting", "serene", "chaotic",
  "dreamy", "fierce", "nostalgic", "triumphant", "mysterious", "playful",
];

const ENVIRONMENT_DESCRIPTORS = [
  "warehouse", "festival", "club", "underground", "arena", "studio",
  "rooftop", "desert", "cathedral", "forest", "ocean", "cityscape",
  "neon-lit", "industrial", "coastal", "mountain", "subterranean",
];

const ENERGY_DESCRIPTORS = [
  "minimal", "driving", "intense", "progressive", "explosive",
  "pulsating", "relentless", "flowing", "thunderous", "simmering",
  "cascading", "raw", "polished", "volatile", "steady",
];

const STYLE_PATTERNS = [
  "genre + mood + environment",
  "mood + genre + instrumentation",
  "environment + genre + energy",
  "energy + mood + genre + texture",
  "genre + environment + mood + rhythm",
];

function pickRandom<T>(arr: T[], seed: number, count = 1): T[] {
  const shuffled = [...arr].sort(() => Math.sin(seed++) - 0.5);
  return shuffled.slice(0, count);
}

const FIELD_PROMPTS: Record<string, string> = {
  albumName: "Suggest a short, evocative album title (2-5 words max). Be creative and memorable. Return ONLY the title, no descriptions or explanations.",
  albumVibe: "Suggest a vivid album-wide mood/vibe description. Describe the overarching atmosphere, sonic palette, and emotional journey of the album.",
  trackName: "Suggest a creative, evocative track name for a music piece. Return ONLY the title (2-5 words). No descriptions.",
  prompt: "Suggest a detailed music prompt describing mood, energy, atmosphere, and imagery for a track. Be vivid and cinematic.",
  genres: "Suggest 2-4 fitting music genres from any style worldwide. Return as comma-separated list.",
  lyrics: "Suggest lyrical themes, storylines, or actual lyrics. Be poetic and emotionally resonant.",
  artistInspiration: "Suggest 2-3 artists whose style would complement this track. Include diverse influences.",
  vocalLanguage: "Suggest vocal language(s) that would best fit this track's genre and mood.",
  videoStyle: "Suggest a visual style for a music video. Be specific about colors, movements, and aesthetic.",
  tempoBpm: "Suggest a BPM value (60-200) that fits the genre, mood, and energy of this track. Return ONLY a number.",
  duration: "Suggest a duration in seconds (30-600) that fits the genre and structure. Return ONLY a number.",
  vocalStructure: "Suggest a vocal structure for this song using section names separated by ' – '. Consider lyrics length, genre, and mood.",
  vocalStyle: "Suggest a vocal style that fits the genre and lyrics. Return a short description like 'Female Vocal', 'Rap Vocal', 'Ethereal Choir', etc.",
  vocalIntensity: "Suggest a vocal intensity level from 1-10 based on the track's energy. Return ONLY a number.",
  vocalEffects: "Suggest vocal effects as a comma-separated list. Choose from or create effects like Reverb, Delay, Chorus, Distortion, Autotune, Vocoder, or other creative effects that fit the genre.",
  mood: "Suggest a mood/atmosphere description that fits the genre and context. Be evocative and specific.",
  songStructure: "Suggest a song structure using section names connected by ' → '. Be creative and genre-appropriate.",
};

const ENHANCE_PROMPTS: Record<string, string> = {
  albumName: "Take this album name and make it more evocative and memorable. Return ONLY the improved title (2-5 words), no descriptions.",
  albumVibe: "Enhance this album vibe description — add richer sonic textures, stronger emotional arcs, and more specific imagery.",
  trackName: "Take this track name and make it more evocative, unique, and memorable. Return ONLY the improved title (2-5 words), no descriptions.",
  prompt: "Take this music prompt and expand it with richer detail — add specific instruments, textures, spatial qualities, and emotional arcs.",
  genres: "Refine these genre selections — suggest more specific sub-genres or complementary genres. Return as comma-separated list.",
  lyrics: "Enhance these lyrics/themes — add more poetic depth, stronger imagery, better flow. Keep the core meaning.",
  artistInspiration: "Expand on these artist inspirations — add complementary artists for a richer sonic palette.",
  vocalLanguage: "Refine the language selection — suggest languages that add unique character while fitting the genre.",
  videoStyle: "Enhance this video style — add specific visual techniques, color palettes, camera movements.",
  tempoBpm: "Adjust this BPM slightly to improve musical fit. Return ONLY a number between 60-200.",
  duration: "Adjust this duration to better fit the genre and structure. Return ONLY a number in seconds between 30-600.",
  vocalStructure: "Refine this vocal structure with additional sections. Return section names separated by ' – '.",
  vocalStyle: "Refine this vocal style to be more specific and nuanced. Add descriptive modifiers.",
  vocalIntensity: "Adjust this intensity value based on the genre and energy context. Return ONLY a number between 1-10.",
  vocalEffects: "Refine these vocal effects — add complementary effects or replace with better-fitting ones. Return as comma-separated list.",
  mood: "Enhance this mood description — make it more vivid, specific, and evocative.",
  songStructure: "Refine this song structure — add or adjust sections for better dynamics. Return sections connected by ' → '.",
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
  if (context.tempoBpm) parts.push(`Tempo: ${context.tempoBpm} BPM`);
  if (context.mood) parts.push(`Mood: ${context.mood}`);
  if (context.musicalKey) parts.push(`Key: ${context.musicalKey}`);
  if (context.vocalStructure) parts.push(`Vocal Structure: ${context.vocalStructure}`);
  if (context.vocalStyle) parts.push(`Vocal Style: ${context.vocalStyle}`);
  if (context.vocalIntensity) parts.push(`Vocal Intensity: ${context.vocalIntensity}/10`);
  if (context.vocalEffects?.length) parts.push(`Vocal Effects: ${context.vocalEffects.join(", ")}`);
  if (context.songStructure) parts.push(`Song Structure: ${context.songStructure}`);
  return parts.length > 0 ? `\n\nContext from other fields:\n${parts.join("\n")}` : "";
}

function buildEntropyDirective(seed: number, previousSuggestions: string[]): string {
  const moods = pickRandom(MOOD_DESCRIPTORS, seed, 2);
  const envs = pickRandom(ENVIRONMENT_DESCRIPTORS, seed + 100, 2);
  const energies = pickRandom(ENERGY_DESCRIPTORS, seed + 200, 1);
  const pattern = pickRandom(STYLE_PATTERNS, seed + 300, 1)[0];

  let directive = `\n\n--- VARIATION DIRECTIVE (seed: ${seed}) ---`;
  directive += `\nStyle pattern to follow: ${pattern}`;
  directive += `\nDraw inspiration from these descriptors: ${[...moods, ...envs, ...energies].join(", ")}`;

  if (previousSuggestions.length > 0) {
    directive += `\n\nCRITICAL: The following suggestions were ALREADY given. You MUST NOT repeat, rephrase, or slightly modify any of them. Generate something completely different in wording, structure, and style:`;
    previousSuggestions.forEach((s, i) => {
      directive += `\n  ${i + 1}. "${s}"`;
    });
    directive += `\n\nUse different vocabulary, sentence structure, and creative angles than ALL of the above.`;
  }

  return directive;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { field, value, context, action = "suggest", previousSuggestions = [], randomSeed = 0 } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const isEnhance = action === "enhance";
    const prompts = isEnhance ? ENHANCE_PROMPTS : FIELD_PROMPTS;
    const fieldPrompt = prompts[field] || (isEnhance ? "Improve and enhance this value." : "Provide a helpful suggestion for this music creation field.");

    const contextStr = buildContext(context);
    const entropyDirective = buildEntropyDirective(randomSeed || Math.floor(Math.random() * 100000), previousSuggestions || []);

    let userContent: string;
    if (isEnhance) {
      userContent = `${fieldPrompt}\n\nCurrent value: "${value}"${contextStr}${entropyDirective}`;
    } else {
      const currentValueNote = value
        ? `\n\nThe user has already entered: "${value}". Generate a completely NEW and DIFFERENT suggestion. Do NOT repeat or slightly modify their input.`
        : "\n\nThe field is empty. Suggest a creative starting point.";
      userContent = `${fieldPrompt}${contextStr}${currentValueNote}${entropyDirective}`;
    }

    const systemPrompt = `You are a music production AI assistant. You help users craft their musical vision.
CRITICAL RULES:
- Generate ALL outputs dynamically. NEVER return example text, template phrases, or placeholder content.
- Every response MUST be unique. Use completely different wording, vocabulary, phrasing, and creative angles each time.
- If previous suggestions are listed, you MUST avoid repeating any of them — not even paraphrased versions.
- Draw from the variation directive's descriptors and style pattern to ensure novelty.
- Analyze the user's filled fields deeply: genre influences mood, mood influences lyrics, BPM influences energy.
- Be specific, vivid, and inspiring. Avoid generic or cliché descriptions.
- Keep output concise (1-3 sentences max for text fields, or a short comma-separated list for selection fields).
- For "albumName": return ONLY a short album title (2-5 words). No descriptions, no genre labels, no dashes or subtitles.
- For "trackName": return ONLY a short track title (2-5 words). No descriptions, no genre labels, no dashes or subtitles.
- For "genres": return ONLY a comma-separated list of genre names.
- For "vocalLanguage": return ONLY a comma-separated list of language names.
- For "tempoBpm": return ONLY a single integer number between 60-200.
- For "vocalIntensity": return ONLY a single integer number between 1-10.
- For "vocalStructure": return ONLY section names separated by " – ".
- For "vocalStyle": return ONLY a short style description (1-4 words).
- For "vocalEffects": return ONLY a comma-separated list of effect names.
- For "songStructure": return ONLY section names connected by " → ".`;

    // High temperature + top_p for maximum creativity
    const temperature = 0.95 + Math.random() * 0.15;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature,
        top_p: 0.95,
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
