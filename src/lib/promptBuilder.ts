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
   // A comprehensive prompt describing everything for MusicContext
   return buildMinimaxPrompt(context);
}
