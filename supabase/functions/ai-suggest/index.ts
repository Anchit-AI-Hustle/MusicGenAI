import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildUniversalMusicKnowledgePrompt } from "../_shared/universal-music-knowledge.ts";

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

const CREATIVE_ANGLES = [
  "unexpected instrument combinations",
  "hybrid musical styles (fusion of two genres)",
  "creative arrangement ideas",
  "unconventional structure or pacing",
  "surprising rhythmic patterns",
  "atmospheric or textural focus",
];

interface StyleFamilyProfile {
  family: string;
  substyles: string[];
  tempoRange: [number, number];
  instruments: string[];
  moods: string[];
  arrangements: string[];
}

const STYLE_FAMILY_LIBRARY: StyleFamilyProfile[] = [
  { family: "Electronic", substyles: ["dub techno", "progressive house", "IDM", "breakbeat", "trance"], tempoRange: [112, 150], instruments: ["drum machines", "modular synths", "sub bass", "arpeggiators"], moods: ["hypnotic", "futuristic", "euphoric"], arrangements: ["club build and release", "progressive layering", "late-night pulse"] },
  { family: "Hip Hop / Rap", substyles: ["boom bap", "trap", "drill", "lo-fi hip hop", "jazz rap"], tempoRange: [70, 100], instruments: ["drum machine", "808 bass", "sample chops", "keys"], moods: ["gritty", "confessional", "swaggering"], arrangements: ["verse-forward", "hook-driven", "cypher-style rotation"] },
  { family: "Rock / Metal", substyles: ["indie rock", "post-punk", "alt metal", "shoegaze rock", "garage rock"], tempoRange: [90, 150], instruments: ["electric guitar", "live drums", "bass guitar", "amp textures"], moods: ["urgent", "anthemic", "raw"], arrangements: ["band crescendo", "riff-led chorus", "dynamic breakdown"] },
  { family: "Pop", substyles: ["synth pop", "alt pop", "dance pop", "bedroom pop", "art pop"], tempoRange: [90, 132], instruments: ["hook synths", "tight drums", "bass", "glossy vocal layers"], moods: ["bright", "heartbroken", "playful"], arrangements: ["hook-first", "verse-pre-chorus-chorus", "radio-tight arc"] },
  { family: "Jazz / Blues", substyles: ["bebop", "smooth jazz", "jazz fusion", "soul jazz", "electric blues"], tempoRange: [95, 180], instruments: ["piano", "upright bass", "saxophone", "brush drums"], moods: ["sultry", "nimble", "late-night"], arrangements: ["head-solo-head", "improvised turns", "swinging ensemble"] },
  { family: "Classical / Orchestral", substyles: ["chamber music", "symphonic poem", "minimalist ensemble", "romantic score", "baroque-inspired"], tempoRange: [55, 140], instruments: ["strings", "woodwinds", "brass", "timpani"], moods: ["dramatic", "elegant", "cinematic"], arrangements: ["movement-like arc", "motivic development", "orchestral swell"] },
  { family: "Ambient / Cinematic", substyles: ["dark ambient", "drone", "cinematic underscore", "neo-ambient", "post-classical ambient"], tempoRange: [40, 90], instruments: ["pads", "drones", "felt piano", "textural strings"], moods: ["immersive", "haunting", "weightless"], arrangements: ["slow evolution", "textural bloom", "scene-building atmosphere"] },
  { family: "World / Folk", substyles: ["Celtic folk", "Anatolian folk", "Nordic folk", "Appalachian folk", "desert blues"], tempoRange: [70, 125], instruments: ["acoustic strings", "hand percussion", "folk winds", "drones"], moods: ["earthy", "storytelling", "ritual"], arrangements: ["call and response", "traveling ballad", "communal refrain"] },
  { family: "Reggae / Dub", substyles: ["roots reggae", "dub", "steppers", "dub poetry", "rocksteady"], tempoRange: [68, 110], instruments: ["offbeat guitar", "deep bass", "rimshot drums", "delay effects"], moods: ["sun-warmed", "meditative", "resistant"], arrangements: ["bass-led groove", "dropout dub sections", "chant hook"] },
  { family: "Latin / Afro", substyles: ["afrobeats", "salsa", "cumbia", "reggaeton", "highlife"], tempoRange: [88, 128], instruments: ["polyrhythmic percussion", "bass", "guitars", "horns"], moods: ["festive", "sensual", "kinetic"], arrangements: ["percussion lift", "dance callouts", "cyclical chorus"] },
  { family: "Indian / Asian Traditions", substyles: ["raga-inspired electronica", "qawwali fusion", "ghazal noir", "taiko-driven score", "gamelan ambient"], tempoRange: [60, 150], instruments: ["tabla", "tanpura", "bansuri", "sarangi"], moods: ["devotional", "intricate", "mystic"], arrangements: ["alap to pulse", "tala-driven expansion", "cyclical refrain"] },
  { family: "Experimental / Avant-garde", substyles: ["glitch collage", "electroacoustic", "noise pop", "free improvisation", "deconstructed club"], tempoRange: [50, 170], instruments: ["found sound", "granular textures", "prepared instruments", "fractured drums"], moods: ["unsettling", "inventive", "volatile"], arrangements: ["fragmented episodes", "abrupt contrast", "nonlinear narrative"] },
];

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

function pickRandom<T>(arr: T[], seed: number, count = 1): T[] {
  const rng = createSeededRng(`${seed}:${arr.length}`);
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

const FIELD_PROMPTS: Record<string, string> = {
  albumName: "Suggest a short, evocative album title (2-5 words max). Be creative and memorable. Return ONLY the title, no descriptions or explanations.",
  albumVibe: "Write a thorough, Suno/Udio-grade album-wide vibe description. No upper word limit — be as detailed as the album warrants (minimum 8 sentences). Cover the overarching sonic palette, the specific genres/subgenres each track set could explore, recurring instruments and textures across the album, the production aesthetic (warm tape vs glossy digital vs gritty lo-fi etc.), the emotional arc from opener to closer, the listener scene the album should evoke, and reference artists per track set. Be vivid and specific — name real instruments, real production techniques, and real reference artists.",
  trackName: "Suggest a creative, evocative track name for a music piece. Return ONLY the title (2-5 words). No descriptions.",
  prompt: "Write a thorough, Suno/Udio-grade music generation prompt. No upper word limit — be as detailed as the brief warrants (minimum 8 sentences). Be specific and dense. Cover: (1) precise genre + subgenre, (2) concrete tempo in BPM and key/scale, (3) every relevant named instrument and sound design element with its role in the mix, (4) full vocal description (gender, register, technique, language, intensity, phrasing) OR explicit instrumental note, (5) production adjectives covering low/mid/high end, stereo image, reverb/delay sizing, and saturation/compression character, (6) 2-3 reference artists, (7) a vivid scene or emotional arc the track should evoke, (8) the dynamic arc across sections (intro/verse/pre/chorus/bridge/outro). No generic adjectives alone — every claim should be concrete.",
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
  albumVibe: "Expand this album vibe into a thorough, Suno/Udio-grade prompt. No upper word limit — be as detailed as the brief warrants (minimum 8 sentences). Preserve the user's core idea, then layer in: specific subgenres for each track set, named instruments and textures, production aesthetic adjectives, emotional arc opener-to-closer, listener scene, and reference artists per set. Replace any generic word with a concrete one — every adjective must be paired with a specific instrument, technique, or reference.",
  trackName: "Take this track name and make it more evocative, unique, and memorable. Return ONLY the improved title (2-5 words), no descriptions.",
  prompt: "Expand this prompt into a thorough, Suno/Udio-grade music generation prompt. No upper word limit — be as detailed as the brief warrants (minimum 8 sentences). Preserve the user's core intent. Add precise BPM + key, every relevant named instrument with its mix role, full vocal description (or instrumental note), production adjectives covering low/mid/high end + stereo image + reverb/delay + saturation, 2-3 reference artists, a vivid scene/emotional arc, and the dynamic arc across sections. Replace every generic adjective with a concrete claim.",
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

const NEW_PROMPTS: Record<string, string> = {
  albumName: "Invent a completely fresh album title unrelated to previous ideas. Return ONLY the title.",
  albumVibe: "Generate a fresh, Suno/Udio-grade album vibe. No upper word limit — be as detailed as the album warrants (minimum 8 sentences). New sonic identity, different genre family from any prior suggestion, named instruments, production aesthetic, emotional arc opener-to-closer, listener scene, and reference artists. Be concrete — no generic adjectives without paired specifics.",
  trackName: "Invent a completely fresh track title unrelated to previous ideas. Return ONLY the title.",
  prompt: "Generate a fresh, Suno/Udio-grade music generation prompt. No upper word limit — be as detailed as the brief warrants (minimum 8 sentences). Different genre family from prior ideas. Include: precise BPM + key, every relevant named instrument with its mix role, full vocal description (or instrumental note), production adjectives covering low/mid/high end + stereo image + reverb/delay + saturation, 2-3 reference artists, a vivid scene/emotional arc, and the dynamic arc across sections.",
  genres: "Generate a completely fresh set of 2-4 genres or hybrid styles from any musical tradition worldwide. Return as comma-separated list.",
  lyrics: "Generate a completely fresh lyrical premise or lyric fragment with a different emotional angle.",
  artistInspiration: "Generate a completely fresh set of artist inspirations with wider stylistic contrast.",
  vocalLanguage: "Generate a completely fresh language palette for the vocals. Return as comma-separated list.",
  videoStyle: "Generate a completely fresh procedural visual direction with different motion, palette, and geometry.",
  tempoBpm: "Generate a completely fresh BPM choice that leads to a different musical feel. Return ONLY a number.",
  duration: "Generate a completely fresh duration choice that implies a different structural pacing. Return ONLY a number.",
  vocalStructure: "Generate a completely fresh vocal structure using section names separated by ' – '.",
  vocalStyle: "Generate a completely fresh vocal style. Return ONLY a short description.",
  vocalIntensity: "Generate a completely fresh vocal intensity between 1 and 10. Return ONLY a number.",
  vocalEffects: "Generate a completely fresh vocal effects chain. Return as comma-separated list.",
  mood: "Generate a completely fresh mood description that does not resemble prior ideas.",
  songStructure: "Generate a completely fresh song structure using section names connected by ' → '.",
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

function buildEntropyDirective(seed: number, previousSuggestions: string[], requestNonce?: string): string {
  const moods = pickRandom(MOOD_DESCRIPTORS, seed, 2);
  const envs = pickRandom(ENVIRONMENT_DESCRIPTORS, seed + 100, 2);
  const energies = pickRandom(ENERGY_DESCRIPTORS, seed + 200, 1);
  const pattern = pickRandom(STYLE_PATTERNS, seed + 300, 1)[0];
  const angle = pickRandom(CREATIVE_ANGLES, seed + 400, 1)[0];

  let directive = `\n\n--- VARIATION DIRECTIVE (seed: ${seed}) ---`;
  if (requestNonce) directive += `\nRequest nonce: ${requestNonce}`;
  directive += `\nStyle pattern to follow: ${pattern}`;
  directive += `\nCreative angle: Introduce ${angle}`;
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

function sampleStyleFamily(seed: number, previousGenreFamilies: string[] = []) {
  const rng = createSeededRng(`style-family:${seed}:${previousGenreFamilies.join("|")}`);
  const lastFamily = previousGenreFamilies.at(-1);
  const candidateFamilies = STYLE_FAMILY_LIBRARY.filter((profile) => profile.family !== lastFamily);
  const familyProfile = candidateFamilies[Math.floor(rng() * candidateFamilies.length)] || STYLE_FAMILY_LIBRARY[Math.floor(rng() * STYLE_FAMILY_LIBRARY.length)];
  const substyle = familyProfile.substyles[Math.floor(rng() * familyProfile.substyles.length)];
  const mood = familyProfile.moods[Math.floor(rng() * familyProfile.moods.length)];
  const arrangement = familyProfile.arrangements[Math.floor(rng() * familyProfile.arrangements.length)];
  const instrumentCount = Math.min(familyProfile.instruments.length, 3 + Math.floor(rng() * 2));
  const instruments = pickRandom(familyProfile.instruments, seed + 77, instrumentCount);
  return {
    family: familyProfile.family,
    substyle,
    tempoRange: familyProfile.tempoRange,
    mood,
    arrangement,
    instruments,
  };
}

function buildStyleSamplerDirective(sampled: ReturnType<typeof sampleStyleFamily>, previousGenreFamilies: string[] = []) {
  const previousFamily = previousGenreFamilies.at(-1);
  let directive = `\n\n--- STYLE SAMPLER ---`;
  directive += `\nSelected genre family: ${sampled.family}`;
  directive += `\nSelected substyle: ${sampled.substyle}`;
  directive += `\nTempo range: ${sampled.tempoRange[0]}-${sampled.tempoRange[1]} BPM`;
  directive += `\nInstrument palette: ${sampled.instruments.join(", ")}`;
  directive += `\nMood axis: ${sampled.mood}`;
  directive += `\nArrangement style: ${sampled.arrangement}`;
  if (previousFamily) {
    directive += `\nCRITICAL: The previous suggestion used the genre family "${previousFamily}". Do NOT repeat that family in this response.`;
  }
  directive += `\nUse this sampled family as the primary style frame unless the user's existing context explicitly requires something else. Do not default back to techno, hard techno, or generic electronic phrasing unless this sampler selected Electronic.`;
  return directive;
}

function buildStructuredSuggestion(field: string, suggestion: string, context: any, sampledStyle?: ReturnType<typeof sampleStyleFamily>) {
  const structured = {
    genre: Array.isArray(context?.genres) ? [...context.genres] : [],
    mood: context?.mood || "",
    energy: context?.energy || "",
    tempo: context?.tempoBpm != null ? String(context.tempoBpm) : "",
    artist_inspiration: context?.artistInspiration || "",
    lyrics: context?.lyrics || "",
    description: context?.musicPrompt || "",
    prompt: context?.musicPrompt || "",
  };

  switch (field) {
    case "genres":
      structured.genre = suggestion.split(",").map((item: string) => item.trim()).filter(Boolean);
      break;
    case "mood":
      structured.mood = suggestion;
      break;
    case "tempoBpm":
      structured.tempo = suggestion;
      break;
    case "artistInspiration":
      structured.artist_inspiration = suggestion;
      break;
    case "lyrics":
      structured.lyrics = suggestion;
      break;
    case "prompt":
      structured.description = suggestion;
      structured.prompt = suggestion;
      break;
  }

  if (sampledStyle) {
    if (structured.genre.length === 0 && (field === "prompt" || field === "genres")) {
      structured.genre = [sampledStyle.substyle];
    }
    if (!structured.tempo && field !== "duration") {
      structured.tempo = String(Math.round((sampledStyle.tempoRange[0] + sampledStyle.tempoRange[1]) / 2));
    }
    if (!structured.mood) {
      structured.mood = sampledStyle.mood;
    }
  }

  return structured;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { field, value, context, action = "suggest", previousSuggestions = [], previousGenreFamilies = [], randomSeed = 0, requestNonce = "", generationDNA = null } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const isEnhance = action === "enhance";
    const isNew = action === "new";
    const prompts = isEnhance ? ENHANCE_PROMPTS : isNew ? NEW_PROMPTS : FIELD_PROMPTS;
    const fieldPrompt = prompts[field] || (isEnhance ? "Improve and enhance this value." : "Provide a helpful suggestion for this music creation field.");

    const contextStr = buildContext(context);
    const fallbackSeed = randomSeed || hashSeed(`${requestNonce || crypto.randomUUID()}:${Date.now()}`);
    const entropyDirective = buildEntropyDirective(fallbackSeed, previousSuggestions || [], requestNonce);
    const sampledStyle = sampleStyleFamily(fallbackSeed, previousGenreFamilies || []);
    const styleSamplerDirective = buildStyleSamplerDirective(sampledStyle, previousGenreFamilies || []);
    const universalKnowledgePrompt = buildUniversalMusicKnowledgePrompt({
      musicPrompt: context?.musicPrompt || value,
      genres: context?.genres || [],
      mood: context?.mood || "",
      artistInspiration: context?.artistInspiration || "",
      generationDNA,
    });
    const dnaDirective = generationDNA
      ? `\nGenerationDNA seed: ${generationDNA.seed}
Motif shape: ${generationDNA.motifShape}
Groove bias: ${generationDNA.grooveBias}
Harmonic mood: ${generationDNA.harmonicMood}
Texture density: ${generationDNA.textureDensity}
Visual energy: ${generationDNA.visualEnergy}
Color signature: ${(generationDNA.colorSignature || []).join(", ")}
Arrangement style: ${generationDNA.arrangementStyle}`
      : "";

    let userContent: string;
    if (isEnhance) {
      userContent = `${fieldPrompt}\n\nCurrent value: "${value}"${contextStr}${dnaDirective}\n${universalKnowledgePrompt}${styleSamplerDirective}${entropyDirective}`;
    } else if (isNew) {
      userContent = `${fieldPrompt}${contextStr}${dnaDirective}\n${universalKnowledgePrompt}${styleSamplerDirective}\n\nCreate something substantially different from any prior phrasing or idea.${entropyDirective}`;
    } else {
      const currentValueNote = value
        ? `\n\nThe user has already entered: "${value}". Generate a completely NEW and DIFFERENT suggestion. Do NOT repeat or slightly modify their input.`
        : "\n\nThe field is empty. Suggest a creative starting point.";
      userContent = `${fieldPrompt}${contextStr}${dnaDirective}\n${universalKnowledgePrompt}${styleSamplerDirective}${currentValueNote}${entropyDirective}`;
    }

    const systemPrompt = `You are a music production AI assistant. You help users craft their musical vision.
CRITICAL RULES:
- You have access to UniversalMusicKnowledge across historical eras, world regions, vocal traditions, production lineages, and hybrid genres.
- Before writing a suggestion, anchor it to the sampled genre family and substyle provided in the STYLE SAMPLER block.
- Rotate across global style families. Never repeat the immediately previous genre family when a prior family is provided.
- Do not default to hard techno, industrial techno, or generic electronic descriptors unless the sampled family is Electronic or the user explicitly asked for that.
- Generate ALL outputs dynamically. NEVER return example text, template phrases, or placeholder content.
- Every response MUST be unique. Use completely different wording, vocabulary, phrasing, and creative angles each time.
- Treat each request nonce as a hard requirement for novelty. Never reuse previous wording even when the field and context are similar.
- If previous suggestions are listed, you MUST avoid repeating any of them — not even paraphrased versions.
- Draw from the variation directive's descriptors and style pattern to ensure novelty.
- Analyze the user's filled fields deeply: genre influences mood, mood influences lyrics, BPM influences energy.
- For "new" actions, do not preserve the current wording. Invent a new concept with different imagery, production cues, and stylistic framing.
- Be specific, vivid, and inspiring. Avoid generic or cliché descriptions.
- LENGTH RULES BY FIELD TYPE (this overrides any prior concision instruction):
  - PROSE FIELDS ("prompt", "albumVibe", "videoStyle", "mood", "lyrics"): write a thorough, generation-ready prompt. NO upper word limit — be as detailed as the brief demands. Minimum 8 sentences. Treat the output as a Suno/Udio-grade music-generation prompt. ALWAYS include in this order:
    1) Genre + subgenre (specific, e.g. "Punjabi drill with UK garage swing", not just "pop")
    2) Tempo (concrete BPM) and key/scale if relevant
    3) 4-8 specific instruments / sound design elements
    4) Vocal description: gender, register, technique, language, intensity
    5) Production adjectives: 3-5 of {warm, punchy, lush, lo-fi, wide stereo, sidechained, analog tape, glossy, gritty, airy, tight low end, sub-heavy, vinyl crackle}
    6) Reference artists for style (2-3)
    7) A vivid scene or emotional arc (1-2 sentences of imagery the listener should feel)
  - ID/LABEL FIELDS (below): keep terse as instructed.
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

    // High temperature + top_p for maximum creativity — rebuild per attempt for unique seeds
    const buildRequestBody = () => {
      const rng = createSeededRng(`${randomSeed}:${requestNonce}:${field}:${action}:${value}`);
      const temperature = 0.92 + rng() * 0.08;
      const attemptSeed = Math.floor(rng() * 1000000);
      const entropyRefresh = buildEntropyDirective(attemptSeed, previousSuggestions || [], requestNonce);
      const attemptSampledStyle = sampleStyleFamily(attemptSeed, previousGenreFamilies || []);
      const attemptStyleDirective = buildStyleSamplerDirective(attemptSampledStyle, previousGenreFamilies || []);
      
      let freshUserContent: string;
      if (isEnhance) {
        freshUserContent = `${fieldPrompt}\n\nCurrent value: "${value}"${contextStr}${dnaDirective}\n${universalKnowledgePrompt}${attemptStyleDirective}${entropyRefresh}`;
      } else if (isNew) {
        freshUserContent = `${fieldPrompt}${contextStr}${dnaDirective}\n${universalKnowledgePrompt}${attemptStyleDirective}\n\nCreate a brand new concept that avoids all previous ideas.${entropyRefresh}`;
      } else {
        const currentValueNote = value
          ? `\n\nThe user has already entered: "${value}". Generate a completely NEW and DIFFERENT suggestion. Do NOT repeat or slightly modify their input.`
          : "\n\nThe field is empty. Suggest a creative starting point.";
        freshUserContent = `${fieldPrompt}${contextStr}${dnaDirective}\n${universalKnowledgePrompt}${attemptStyleDirective}${currentValueNote}${entropyRefresh}`;
      }
      
      return JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature,
        top_p: 0.95,
        // Generous ceiling so prose fields ("prompt", "albumVibe",
        // "videoStyle", "mood", "lyrics") can produce thorough,
        // Suno/Udio-grade output without truncation. Short-label fields
        // use a tiny fraction of this anyway, so the only cost is a slightly
        // larger upper bound on worst-case latency.
        max_tokens: 2400,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: freshUserContent },
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
                  structured: {
                    type: "object",
                    properties: {
                      genre: { type: "array", items: { type: "string" } },
                      mood: { type: "string" },
                      energy: { type: "string" },
                      tempo: { type: "string" },
                      artist_inspiration: { type: "string" },
                      lyrics: { type: "string" },
                      description: { type: "string" },
                      prompt: { type: "string" },
                    },
                    additionalProperties: false,
                  },
                },
                required: ["suggestion"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "provide_suggestion" } },
      });
    };

    // Retry with exponential backoff for rate limits
    const MAX_RETRIES = 2;
    let lastError = "";
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delayRng = createSeededRng(`${randomSeed}:${requestNonce}:retry:${attempt}`);
        const delay = Math.min(1000 * Math.pow(2, attempt) + delayRng() * 500, 8000);
        await new Promise(r => setTimeout(r, delay));
      }

      // Build fresh request body per attempt for unique entropy
      const requestBody = buildRequestBody();

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      if (response.status === 429) {
        lastError = "Rate limit exceeded";
        console.log(`Rate limited on attempt ${attempt + 1}, retrying...`);
        continue;
      }

      if (!response.ok) {
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
        const structured = args.structured || buildStructuredSuggestion(field, suggestion, context, sampledStyle);
        return new Response(JSON.stringify({ suggestion, field, action, seed: generationDNA?.seed || String(fallbackSeed), structured, genreFamily: sampledStyle.family }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        suggestion = data.choices?.[0]?.message?.content || "";
      }

      return new Response(JSON.stringify({
        suggestion,
        field,
        action,
        seed: generationDNA?.seed || String(fallbackSeed),
        structured: buildStructuredSuggestion(field, suggestion, context, sampledStyle),
        genreFamily: sampledStyle.family,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All retries exhausted
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
      status: 429,
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
