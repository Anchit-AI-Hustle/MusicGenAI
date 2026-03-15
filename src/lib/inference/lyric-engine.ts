/**
 * LyricEngine: Generates high-quality lyrics with structural timing labels.
 * Addresses Engineering Note 3 & 5: Syllable count targets and structural labels.
 */

import { CompositionPlan } from "./composition-engine";
import { getLyricsInstruction } from "../musicData/languages";

export interface LyricLine {
  text: string;
  startTime: number;
  duration: number;
  section: string;
  syllables: number;
}

export interface LyricGenerationResult {
  fullLyrics: string;
  lines: LyricLine[];
}

/**
 * Heuristic syllable counter (basic).
 * In production, this would use a language-specific phoneme library.
 */
function countSyllables(text: string): number {
  return text.split(" ").reduce((acc, word) => {
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    if (w.length <= 3) return acc + 1;
    return acc + Math.ceil(w.length / 2.5);
  }, 0);
}

export function buildLyricPrompt(
  genre: string,
  mood: string,
  language: string,
  description: string,
  plan: CompositionPlan
): string {
  const langInstruction = getLyricsInstruction(language, description);
  
  const structureSummary = plan.structure.sections.map(s => 
    `- ${s.name}: ${s.measures} measures, target ${s.lyricsLines} lines`
  ).join("\n");

  return `
You are a Grammy-winning songwriter and poet.
TASK: Write lyrics for a ${genre} song that is ${mood}.
STORY: ${description}

LANGUAGE INSTRUCTIONS:
${langInstruction}

SONG STRUCTURE:
BPM: ${plan.bpm}
Total Measures: ${plan.structure.totalMeasures}
Sections:
${structureSummary}

CRITICAL RULES:
1. Label every section with [SECTION_NAME] (e.g. [VERSE 1], [CHORUS]).
2. For ${plan.bpm} BPM, aim for 6-10 syllables per line for verses, and 4-8 for choruses to ensure they are catchy.
3. If the language is ${language} and it is not English, use romanized transliteration only.
4. Ensure the chorus is repeated exactly as defined in the structure.
5. Provide the lyrics strictly in the following format:
[SECTION]
Line 1
Line 2
...
`;
}

/**
 * Post-processes generated lyrics to add timing and syllable metadata.
 */
export function processLyrics(
  rawLyrics: string,
  plan: CompositionPlan
): LyricGenerationResult {
  const lines: LyricLine[] = [];
  const rawSplit = rawLyrics.split("\n").filter(l => l.trim().length > 0);
  
  let currentSection = "Intro";
  let currentTime = 0;
  
  // Calculate seconds per measure
  const secondsPerMeasure = (4 / plan.bpm) * 60; // Assuming 4/4

  for (const line of rawSplit) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      currentSection = trimmed.slice(1, -1);
      continue;
    }

    const syllables = countSyllables(trimmed);
    
    // Naive timing: distribute lines evenly across section measures
    // Find current section in plan
    const sectionDef = plan.structure.sections.find(s => 
      s.name.toUpperCase() === currentSection.toUpperCase() || 
      currentSection.toUpperCase().includes(s.name.toUpperCase())
    );
    
    const linesInSectionCount = rawSplit.filter(l => {
        // This is a rough heuristic to find lines belonging to this section in the text
        // In a real implementation we'd parse the structure more robustly
        return !l.startsWith("["); 
    }).length / (plan.structure.sections.length || 1);

    const duration = (sectionDef ? sectionDef.measures * secondsPerMeasure : 8) / (linesInSectionCount || 4);

    lines.push({
      text: trimmed,
      startTime: currentTime,
      duration,
      section: currentSection,
      syllables
    });

    currentTime += duration;
  }

  return {
    fullLyrics: rawLyrics,
    lines
  };
}
