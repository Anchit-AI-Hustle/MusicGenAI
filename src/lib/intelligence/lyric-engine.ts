/**
 * Local lyric engine.
 *
 * Generates structured lyrics from a brief — entirely on-device, with no
 * model and no API call. Pulls vocabulary from genre-specific word banks,
 * mines the user's description for nouns/verbs, and assembles them into
 * stanzas that respect the section structure of the resolved
 * CompositionPlan.
 *
 * Output:
 *   {
 *     verses:  [phrase, phrase, phrase, phrase],
 *     chorus:  [phrase, phrase, phrase, phrase],
 *     bridge:  [phrase, phrase],
 *   }
 *
 * Each "phrase" is a string suitable for a single bar of singing
 * (~8-14 syllables for typical pop tempo). The vocoder voice in
 * sequencer.ts maps the phrase to chant events by syllabifying each word
 * and assigning the primary vowel of every syllable to a chant pitch.
 *
 * This is intentionally a *small* generator. It does not attempt to write
 * "good" lyrics — it writes lyrics that sing, that derive from the user's
 * brief, and that vary per seed. For real songwriting use the AI backend.
 */

import type { CompositionPlan } from "./types";

export interface LyricBundle {
  /** Title in singing-form (used as the chorus opener). */
  title: string;
  /** 4 lines of verse 1. */
  verse1: string[];
  /** 4 lines of verse 2 (different content from verse 1). */
  verse2: string[];
  /** 4 lines of chorus, repeated identically across choruses. */
  chorus: string[];
  /** 2 lines of bridge that contrast verse/chorus. */
  bridge: string[];
  /** Lines that play in the outro (often a tag of the chorus). */
  outro: string[];
  /** All-words concatenation, useful for downstream alignment. */
  fullText: string;
}

interface LyricInput {
  prompt?: string;
  mood: string;
  genre: string;
  language?: string;
  seed?: string;
}

// ---------------------------------------------------------------------------
// Word banks per mood — used as a fallback when the prompt has no useful
// nouns. Keep these short, image-driven, and singable (mostly mono- and
// di-syllabic words).
// ---------------------------------------------------------------------------

const MOOD_NOUNS: Record<string, string[]> = {
  uplifting:    ["sun", "fire", "wave", "wings", "road", "sky", "morning", "dawn"],
  anthemic:     ["fire", "lights", "city", "thunder", "storm", "dream", "diamond"],
  nostalgic:    ["letters", "memory", "summer", "echoes", "polaroid", "porch", "highway"],
  romantic:     ["heart", "moon", "river", "garden", "honey", "evening", "promise"],
  yearning:     ["distance", "shadow", "horizon", "smoke", "echo", "midnight", "ghost"],
  melancholic:  ["rain", "winter", "silence", "ashes", "doorway", "candle", "letter"],
  dark:         ["night", "shadow", "hollow", "thunder", "iron", "smoke", "midnight"],
  menacing:     ["chains", "fire", "blade", "crown", "shadow", "concrete", "throne"],
  cinematic:    ["mountain", "horizon", "thunder", "rivers", "fortress", "exodus"],
  epic:         ["thunder", "kingdom", "rising", "fortress", "mountain", "lightning"],
  euphoric:     ["lights", "stardust", "neon", "diamond", "weightless", "fever"],
  chill:        ["evening", "streetlight", "rooftop", "rainfall", "coffee", "sunday"],
  party:        ["lights", "weekend", "speakers", "fever", "neon", "kicker", "bottle"],
  moody:        ["shadow", "smoke", "midnight", "highway", "neon", "silence", "rain"],
  sensual:      ["velvet", "honey", "midnight", "whisper", "shadow", "satin"],
  calm:         ["river", "garden", "morning", "ocean", "candle", "silence", "field"],
  default:      ["light", "shadow", "fire", "river", "city", "night", "morning"],
};

const MOOD_VERBS: Record<string, string[]> = {
  uplifting:    ["rise", "shine", "carry", "fly", "wake", "open", "dance"],
  anthemic:     ["rise", "burn", "shake", "break", "stand", "shine", "run"],
  nostalgic:    ["remember", "linger", "fade", "return", "miss", "hold", "drift"],
  romantic:     ["love", "hold", "find", "kiss", "stay", "follow", "remember"],
  yearning:     ["wait", "search", "remember", "ache", "wander", "follow", "long"],
  melancholic:  ["fall", "fade", "weep", "leave", "miss", "linger", "break"],
  dark:         ["burn", "fall", "break", "haunt", "fade", "drown", "vanish"],
  menacing:     ["rise", "burn", "break", "stand", "claim", "rule", "reign"],
  cinematic:    ["rise", "march", "stand", "fall", "carry", "bind", "thunder"],
  epic:         ["rise", "march", "thunder", "burn", "claim", "stand", "shake"],
  euphoric:     ["fly", "rise", "shine", "burn", "open", "dance", "drift"],
  chill:        ["drift", "watch", "wait", "linger", "stay", "wander", "rest"],
  party:        ["dance", "burn", "shake", "rise", "fly", "move", "jump"],
  moody:        ["drift", "fade", "wander", "linger", "remember", "follow"],
  sensual:      ["move", "linger", "hold", "follow", "fall", "stay", "drift"],
  calm:         ["breathe", "rest", "drift", "wait", "open", "still", "follow"],
  default:      ["go", "wait", "find", "hold", "see", "rise", "fall"],
};

// "anchor" lines per mood — provide narrative scaffolding; words inside
// {n} and {v} get filled with mood-appropriate noun/verb picks.
const MOOD_PHRASES: Record<string, string[]> = {
  uplifting: [
    "We {v} into the {n}",
    "Hold the {n}, never let go",
    "I can feel the {n} {v}",
    "Open up the {n}",
  ],
  anthemic: [
    "We are the {n} tonight",
    "Watch us {v} the {n}",
    "Nothing stops the {n}",
    "Stand up, we {v} again",
  ],
  nostalgic: [
    "Old {n} on the wall",
    "I still {v} that {n}",
    "Take me back to the {n}",
    "Some things never {v}",
  ],
  romantic: [
    "You're the {n} I {v}",
    "Stay with me, my {n}",
    "I want to {v} your {n}",
    "Every {n}, I {v}",
  ],
  yearning: [
    "I {v} for the {n}",
    "Across the {n} I call",
    "Where did the {n} go?",
    "Send me a {n} tonight",
  ],
  melancholic: [
    "The {n} {v} again",
    "I let the {n} go",
    "Empty {n}, empty {n}",
    "Nothing left to {v}",
  ],
  dark: [
    "Walking through the {n}",
    "Let the {n} {v} down",
    "Nothing but the {n} now",
    "I {v} into the {n}",
  ],
  menacing: [
    "We {v} the {n} alone",
    "No one {v}s the {n}",
    "Watch the {n} {v}",
    "The {n} is mine to take",
  ],
  cinematic: [
    "Beyond the {n} we {v}",
    "Hold the line, hold the {n}",
    "We {v} into the storm",
    "Let the {n} carry us home",
  ],
  epic: [
    "Through the {n} we {v}",
    "Raise the {n} again",
    "We {v} the {n} of old",
    "Nothing breaks the {n}",
  ],
  euphoric: [
    "We {v} above the {n}",
    "Higher than the {n} tonight",
    "Lost inside the {n}",
    "Nothing but the {n} ahead",
  ],
  chill: [
    "Just another {n}",
    "We {v} the slow {n}",
    "Everything stays still",
    "Soft {n} in the air",
  ],
  party: [
    "We {v} the {n} all night",
    "Loud {n}, no goodbye",
    "Watch us {v} the {n}",
    "{n}s up, hands up",
  ],
  moody: [
    "Low {n} on my mind",
    "Everything {v}s slow",
    "Nothing but the {n}",
    "I {v} in the silence",
  ],
  sensual: [
    "Soft {n} on my skin",
    "Stay closer, my {n}",
    "Let me {v} your {n}",
    "Slow {n}, slow burn",
  ],
  calm: [
    "Breathe with me, {n}",
    "Watch the {n} pass",
    "All is {n}, all is light",
    "We {v} with the tide",
  ],
  default: [
    "We {v} into the {n}",
    "Hold the {n} close",
    "I {v} for the {n}",
    "Let the {n} {v} again",
  ],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateLyrics(input: LyricInput, plan: CompositionPlan): LyricBundle {
  const seed = input.seed ?? plan.meta.seed ?? "default";
  const rng = seededRng(seed);

  const mood = normalizeMood(input.mood);
  const promptNouns = extractNouns(input.prompt ?? "");
  const promptVerbs = extractVerbs(input.prompt ?? "");
  const nouns  = [...promptNouns, ...(MOOD_NOUNS[mood] ?? MOOD_NOUNS.default)];
  const verbs  = [...promptVerbs, ...(MOOD_VERBS[mood] ?? MOOD_VERBS.default)];
  const templates = MOOD_PHRASES[mood] ?? MOOD_PHRASES.default;

  // Title — seed a short noun-led phrase. Used as chorus opener.
  const title = capitalize(`${pick(nouns, rng)} ${pick(verbs, rng)}`);

  // Build verses: 4 distinct phrases per verse using rotating template/noun/verb
  const verse1 = pickPhrases(4, templates, nouns, verbs, rng);
  const verse2 = pickPhrases(4, templates, nouns, verbs, rng, /*offset*/ 2);

  // Chorus: 4 phrases with the title as anchor on lines 1 and 3
  const chorus: string[] = [];
  chorus.push(`${title}`);
  chorus.push(fillTemplate(pick(templates, rng), nouns, verbs, rng));
  chorus.push(`${title}`);
  chorus.push(fillTemplate(pick(templates, rng), nouns, verbs, rng));

  // Bridge: 2 phrases with contrasting nouns/verbs
  const bridge = pickPhrases(2, templates, nouns, verbs, rng, /*offset*/ 4);

  // Outro: 1 line tag of the title
  const outro = [title];

  const fullText = [...verse1, ...chorus, ...verse2, ...chorus, ...bridge, ...chorus, ...outro].join("\n");

  return { title, verse1, verse2, chorus, bridge, outro, fullText };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeMood(m: string): string {
  const x = (m ?? "").toLowerCase().trim();
  for (const k of Object.keys(MOOD_NOUNS)) {
    if (x.includes(k)) return k;
  }
  return "default";
}

const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","in","on","to","for","with","by","at","from",
  "is","was","are","were","be","been","being","this","that","these","those","i","you",
  "he","she","we","they","it","my","your","our","their","his","her","its","not","no",
  "song","track","music","lyrics","write","make","create","generate","please",
]);

const VERB_HINTS = ["run","fly","fall","rise","love","miss","wait","hold","find","break","burn","dance","sing","cry","laugh","fight","go","stay","leave","come","fade","dream","feel","know","want","need","sleep","wake","hide","seek","walk","talk","kiss","hope","fear"];

function extractNouns(prompt: string): string[] {
  if (!prompt) return [];
  const tokens = prompt.toLowerCase().match(/[a-zA-Z']+/g) ?? [];
  const candidates = tokens.filter(t => !STOPWORDS.has(t) && t.length > 2 && !VERB_HINTS.includes(t));
  return Array.from(new Set(candidates)).slice(0, 12);
}

function extractVerbs(prompt: string): string[] {
  if (!prompt) return [];
  const tokens = prompt.toLowerCase().match(/[a-zA-Z']+/g) ?? [];
  const verbs = tokens.filter(t => VERB_HINTS.includes(t));
  return Array.from(new Set(verbs));
}

function pickPhrases(
  n: number,
  templates: string[],
  nouns: string[],
  verbs: string[],
  rng: () => number,
  offset = 0,
): string[] {
  const out: string[] = [];
  const used = new Set<string>();
  let attempts = 0;
  while (out.length < n && attempts < n * 4) {
    attempts++;
    const tpl = templates[(out.length + offset) % templates.length];
    const phrase = fillTemplate(tpl, nouns, verbs, rng);
    if (used.has(phrase)) continue;
    used.add(phrase);
    out.push(phrase);
  }
  while (out.length < n) out.push(fillTemplate(templates[0], nouns, verbs, rng));
  return out;
}

function fillTemplate(tpl: string, nouns: string[], verbs: string[], rng: () => number): string {
  return tpl
    .replace(/\{n\}/g, () => pick(nouns, rng))
    .replace(/\{v\}/g, () => pick(verbs, rng));
}

function pick<T>(list: T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function seededRng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
