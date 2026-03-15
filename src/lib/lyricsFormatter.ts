import { CreativeContext } from "@/types/creative-context";

export function formatLyricsForMinimax(lyrics: string, context: CreativeContext): string {
  if (!lyrics) return "";
  
  // Minimax uses a specific XML-like tag structure for lyrics
  // Make sure structural tags exist
  
  let formatted = lyrics;
  
  // Fallbacks if AI didn't add structure
  if (!formatted.includes("[Verse") && !formatted.includes("[Chorus]")) {
    const paragraphs = formatted.split("\n\n").filter(p => p.trim());
    if (paragraphs.length === 0) return "";
    
    formatted = "";
    paragraphs.forEach((p, i) => {
      if (i === 1 || i === paragraphs.length - 1) {
        formatted += `[Chorus]\n${p}\n\n`;
      } else {
        formatted += `[Verse]\n${p}\n\n`;
      }
    });
  }

  // Minimax specifically ignores text before the first section tag
  // So ensure it starts with a tag
  if (!formatted.trim().startsWith("[")) {
    formatted = `[Intro]\n${formatted}`;
  }

  // Ensure timestamps/syllable markers from our older engine are stripped
  // Minimax infers rhythm purely from structure and commas
  formatted = formatted.replace(/<[^>]+>/g, ""); // Strip XML style timestamps
  formatted = formatted.replace(/\[\d+:\d+:\d+\]/g, ""); // Strip [00:00:00] format
  
  return formatted.trim();
}

export function formatLyricsForElevenLabs(lyrics: string): string {
   if (!lyrics) return "";
   
   // ElevenLabs is more forgiving but likes standard song structure markers
   return lyrics.trim();
}

export function generateInstrumentalPrompt(context: CreativeContext): string {
    return "[Instrumental]\n[Build]\n[Drop]\n[Breakdown]\n[Outro]";
}
