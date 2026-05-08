/**
 * Rule-based English syllabifier with primary-vowel + stress detection.
 *
 * Pure heuristic — no dictionary, no model. Good enough to drive the
 * vocoder voice's vowel selection at the rhythm of the lyric.
 *
 * Algorithm:
 *   1. Split a line into words (whitespace + punctuation strip).
 *   2. For each word, find vowel groups; each vowel group seeds a syllable.
 *   3. Distribute consonants between vowel groups using a simple max-onset
 *      rule (consonant clusters lean toward the following syllable).
 *   4. Each syllable's primary vowel maps to one of our 6 formant slots:
 *      ah / ee / oo / oh / eh / uh.
 *   5. Stress: first syllable of polysyllabic words gets primary stress;
 *      mono-syllables with > 4 letters get stressed.
 *
 * The mapping is intentional and audible — the chant follows the lyric.
 */

import type { Vowel } from "./voices";

export interface Syllable {
  /** The syllable text (lowercase). */
  text: string;
  /** Primary vowel for vocoder formant selection. */
  vowel: Vowel;
  /** True for stressed syllables (gets ~1.2× velocity in the vocoder). */
  stressed: boolean;
  /** Index of the source word in the line. */
  wordIndex: number;
  /** Position within the word (0 = first syllable). */
  positionInWord: number;
}

export interface SyllabifiedLine {
  words: string[];
  syllables: Syllable[];
}

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

/**
 * Map an English vowel cluster to one of our 6 formant slots.
 *
 * Heuristic: prefer the *last* phonetic vowel sound in the cluster
 * (this matches how the vowel actually rings in singing — "boat" rings
 * "oh", "rain" rings "eh" → "ay" → "eh", "fire" rings "ah-ee" → "ah").
 */
function clusterToFormantVowel(cluster: string): Vowel {
  const c = cluster.toLowerCase();
  // Common digraphs and diphthongs first
  if (c.includes("ee") || c.includes("ea") || c.includes("ie") || c.includes("y")) return "ee";
  if (c.includes("oo") || c.includes("ou") || c.includes("ew") || c.includes("u")) return "oo";
  if (c.includes("oa") || c.includes("ow") || c.includes("oh") || c.includes("o"))  return "oh";
  if (c.includes("ai") || c.includes("ay") || c.includes("ei") || c.includes("ey")) return "eh";
  if (c.includes("e"))                                                                return "eh";
  if (c.includes("ah") || c.includes("a"))                                            return "ah";
  return "uh";
}

export function syllabifyLine(line: string): SyllabifiedLine {
  const words = (line.toLowerCase().match(/[a-zA-Z']+/g) ?? []);
  const out: Syllable[] = [];
  for (let wi = 0; wi < words.length; wi++) {
    const sylls = syllabifyWord(words[wi]);
    sylls.forEach((s, posInWord) => {
      out.push({
        text: s.text,
        vowel: s.vowel,
        stressed: stressOf(words[wi], posInWord, sylls.length),
        wordIndex: wi,
        positionInWord: posInWord,
      });
    });
  }
  return { words, syllables: out };
}

interface RawSyllable { text: string; vowel: Vowel; }

function syllabifyWord(word: string): RawSyllable[] {
  if (!word) return [];
  // Find vowel-group runs; everything else is consonant
  const groups: { type: "v" | "c"; text: string }[] = [];
  let i = 0;
  while (i < word.length) {
    const isVowel = VOWELS.has(word[i]);
    let j = i;
    while (j < word.length && VOWELS.has(word[j]) === isVowel) j++;
    groups.push({ type: isVowel ? "v" : "c", text: word.slice(i, j) });
    i = j;
  }

  if (groups.length === 0) return [];
  if (!groups.some(g => g.type === "v")) {
    // No vowels — treat entire word as one schwa syllable
    return [{ text: word, vowel: "uh" }];
  }

  // Build syllables: each vowel group anchors one syllable.
  // Consonant groups distribute via simple max-onset (cluster stays with
  // the FOLLOWING syllable when possible).
  const sylls: RawSyllable[] = [];
  let pending = "";
  for (let k = 0; k < groups.length; k++) {
    const g = groups[k];
    if (g.type === "c") {
      // Initial consonant cluster: belongs to the first vowel group
      if (sylls.length === 0) {
        pending += g.text;
        continue;
      }
      // Cluster between vowels — split: 1 consonant to previous, rest to next
      if (g.text.length <= 1) {
        // Single consonant goes to the next syllable (max onset)
        pending = g.text;
      } else {
        const split = 1;
        sylls[sylls.length - 1].text += g.text.slice(0, split);
        pending = g.text.slice(split);
      }
      continue;
    }
    // Vowel group — emit syllable
    const text = pending + g.text;
    pending = "";
    sylls.push({ text, vowel: clusterToFormantVowel(g.text) });
  }
  // Trailing consonant cluster — append to last syllable
  if (pending) {
    sylls[sylls.length - 1].text += pending;
  }
  // Edge case: word starts with consonant cluster only — already handled by pending
  return sylls;
}

function stressOf(word: string, positionInWord: number, totalSyllables: number): boolean {
  if (totalSyllables === 1) return word.length >= 4;
  // Most English polysyllables stress on the first syllable; this is a
  // crude approximation but adequate for vocoder velocity shaping.
  return positionInWord === 0;
}
