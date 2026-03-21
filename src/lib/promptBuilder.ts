import { CreativeContext } from "@/types/creative-context";
import { findGenreByName } from "./musicData/genres";

export function buildMinimaxPrompt(context: CreativeContext): string {
  const genreInfo = findGenreByName(context.genre);
  
  const keywords = genreInfo?.modelPromptKeywords || [];
  
  let prompt = `${context.genre} song`;
  if (context.mood) prompt += `, ${context.mood} mood`;
  if (context.tempo) prompt += `, ${context.tempo} tempo`;
  if (context.artistInspiration) prompt += `, inspired by ${context.artistInspiration}`;
  if (keywords.length > 0) prompt += `, ${keywords.join(", ")}`;
  
  if (context.instrumentalOnly) {
    prompt += ", instrumental only, no vocals, high quality production";
  } else {
    prompt += `, ${context.vocalStyle} vocals, sung in ${context.vocalLanguage}`;
  }
  
  if (context.songDescription) {
    prompt += `. Concept: ${context.songDescription}`;
  }
  
  return prompt;
}

export function buildStableAudioPrompt(context: CreativeContext): string {
    const genreInfo = findGenreByName(context.genre);
    const keywords = genreInfo?.modelPromptKeywords || [];
    
    let prompt = `${context.genre}`;
    if (context.mood) prompt += `, ${context.mood}`;
    if (context.tempo) prompt += `, ${context.tempo} tempo`;
    
    if (keywords.length > 0) prompt += `, ${keywords.join(", ")}`;
    
    prompt += ", high quality, instrumental, no vocals, 440hz, stereo";
    
    return prompt;
}

export function buildElevenLabsTTSPrompt(context: CreativeContext): string {
  // TTS doesn't need music tags, just the style of Voice
  return `${context.vocalLanguage} ${context.vocalStyle} ${context.mood}`;
}

export function buildElevenLabsMusicPrompt(context: CreativeContext): string {
    const genreInfo = findGenreByName(context.genre);
    let prompt = genreInfo?.elevenLabsStyleHint || context.genre;
    if (context.artistInspiration) prompt += ` style of ${context.artistInspiration}`;
    if (context.mood) prompt += `, ${context.mood} mood`;
    if (context.tempo) prompt += `, ${context.tempo} tempo`;
    prompt += `, ${context.vocalStyle} vocals in ${context.vocalLanguage}`;

    return prompt;
}

export function buildMasterPrompt(context: CreativeContext): string {
  const genreInfo = findGenreByName(context.genre);
  const subgenre = context.subgenre || "General";
  const tempo = context.tempo || genreInfo?.bpmTypical || 110;
  const description = context.songDescription || "No description provided";
  const language = context.vocalLanguage || "English";
  const vocalStyle = context.vocalStyle || "Contemporary";
  const effects = (context.vocalEffects || []).join(", ") || "None";
  const structure = context.songStructure || context.structureType || "Verse-Chorus-Bridge";
  const inspiration = context.artistInspiration || "No specific artist";
  const instrumentation = genreInfo?.primaryInstruments?.join(", ") || "drums, bass, harmony layers";

  return [
    "[MASTER MUSIC GEN BLUEPRINT]",
    `IDENTITY: A ${String(context.mood || "dynamic").toLowerCase()} ${context.genre} track in the style of ${subgenre}.`,
    `SPECS: Tempo: ${tempo} BPM. Duration: ${context.duration || 120}s. Structure: ${structure}.`,
    `INSTRUMENTATION: ${instrumentation}.`,
    `VOCALS: ${vocalStyle} vocals in ${language}. Intensity ${context.vocalIntensity || 5}/10. Effects: ${effects}.`,
    `LYRICS: Theme "${context.lyricsTheme || context.mood || "Open"}".`,
    `INSPIRATION: Inspired by ${inspiration}: keep production traits, but create an original composition.`,
    `CONTEXT: ${description}`,
  ].join("\n");
}
