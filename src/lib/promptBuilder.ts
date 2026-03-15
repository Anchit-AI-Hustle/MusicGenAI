import { CreativeContext } from "@/types/creative-context";
import { findGenreByName } from "./musicData/genres";
import { findLanguage } from "./musicData/languages";
import { findMood } from "./musicData/moods";
import { findVocalProfileByGenreAndLanguage } from "./musicData/vocals";
import { ARTIST_DATABASE } from "./musicData/artists";

export function buildMasterPrompt(context: CreativeContext): string {
  const genreDef = findGenreByName(context.genre);
  const langDef = findLanguage(context.vocalLanguage || "English");
  const moodDef = findMood(context.mood);
  const vocalProfile = findVocalProfileByGenreAndLanguage(
    context.genre,
    context.vocalLanguage || "English",
    context.vocalGender || (context.vocalIntensity > 70 ? "male" : "female")
  );

  const artistRef = ARTIST_DATABASE.find(a => a.name === context.artistInspiration);

  // 1. Core Musical Identity
  const identity = `A ${context.mood.toLowerCase()} ${context.genre} track${context.subgenre ? ` in the style of ${context.subgenre}` : ""}.`;

  // 2. Technical Specs
  const specs = `Tempo: ${context.tempo} BPM. Time Signature: ${genreDef?.timeSignature || "4/4"}. Mood: ${context.mood}.`;

  // 3. Instrumentation & Production Style
  const instrumentation = genreDef
    ? `Featuring ${genreDef.primaryInstruments.join(", ")}. Production style: ${genreDef.productionStyle}. ${moodDef ? moodDef.productionElements.join(", ") : ""}`
    : `Standard ${context.genre} instrumentation.`;

  // 4. Vocal Profile
  const vocals = context.instrumentalOnly
    ? "This is an instrumental-only track. No vocals."
    : `Vocals: ${vocalProfile.style}. Characteristics: ${genreDef?.vocalCharacteristics || "Standard vocals"}. Language: ${context.vocalLanguage}.`;

  // 5. Stylistic Inspiration
  const inspiration = artistRef
    ? `Inspired by ${artistRef.name}: ${artistRef.productionNotes}.`
    : context.artistInspiration ? `Inspiration: ${context.artistInspiration}.` : "";

  // 6. Keywords
  const keywords = [
    ...(genreDef?.modelPromptKeywords || []),
    ...(moodDef ? [moodDef.modelPromptKeywords] : []),
    context.videoStyle ? `Visual/Video Style: ${context.videoStyle}` : ""
  ].filter(Boolean).join(", ");

  // 7. Lyrics Context (if available)
  const lyricsTheme = context.lyricTheme ? `Theme: ${context.lyricTheme}.` : "";

  // Assemble
  return `
[MASTER MUSIC GEN BLUEPRINT]
IDENTITY: ${identity}
SPECS: ${specs}
INSTRUMENTATION: ${instrumentation}
VOCALS: ${vocals}
INSPIRATION: ${inspiration}
LYRICS CONTEXT: ${lyricsTheme}
TAGS: ${keywords}
DESCRIPTION: ${context.songDescription}
`.trim();
}
