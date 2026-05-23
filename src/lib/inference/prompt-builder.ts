/**
 * PromptBuilder: The central hub for prompt assembly.
 * Combines data from all previous engines into a high-density string
 * for music generation models.
 */

import { CreativeContext } from "@/types/creative-context";
import { CompositionPlan } from "./composition-engine";
import { findGenreByName } from "@/lib/musicData/genres";
import { findMood } from "@/lib/musicData/moods";
import { ARTIST_STYLES } from "@/lib/musicData/artists";

export interface MasterPrompts {
  instrumentalPrompt: string;
  vocalPrompt: string;
  mixingInstruction: string;
}

export function buildMasterPrompts(
  context: CreativeContext,
  plan: CompositionPlan
): MasterPrompts {
  const genre = findGenreByName(context.genre);
  const mood = findMood(context.mood);
  const genreName = context.genre || 'pop';
  const moodName = context.mood || 'energetic';
  const delayMs = Math.round(60000 / plan.bpm);

  const mixPalette: Record<string, string> = {
    'hip-hop': 'sub-heavy 808s mono below 120Hz, sidechained pads ducking 4dB to kick, vinyl crackle at -24dB, glossy hi-hat presence shelf +2dB at 12kHz',
    'trap': '808 sub with pitch slides, rolling hi-hat triplets, tight clap/snare layered with noise transient, dark wide reverbed pads',
    'pop': 'glossy polished production, wide stereo with mono center (kick/bass/vocal), punchy kick with 3-5kHz click transient, stacked harmonies',
    'rock': 'midrange guitar crunch 1-4kHz, room mic blended 20%, bass locked to kick fundamental, 2-bus glue compression 2-3dB GR',
    'metal': 'high-gain guitars panned L80/R80, triggered double kick at 60Hz, drop-tuned bass following root, wall of sound density',
    'edm': 'sidechain compression 6dB on pads/bass to kick, wide supersaw stereo field, punchy transient-shaped kick, glossy lead with harmonics',
    'jazz': 'warm tape emulation 15ips, intimate room 1.2s plate reverb, gentle bus compression 1.5:1 ratio, natural instrument separation',
    'classical': 'concert hall reverb RT60 2.5s, wide stereo Decca tree imaging, dynamic range preserved, no bus compression',
    'rnb': 'smooth sub bass -8dB below kick, stacked vocal harmonies wide stereo, Wurlitzer/Rhodes with chorus, warm tape saturation',
    'ambient': 'algorithmic reverb 6s+ decay, slow attack pads 200ms+, stereo width 100%, soft tube saturation, no hard transients',
    'folk': 'ribbon mic warmth on acoustic guitar, intimate room IR, gentle 2-bus compression, natural upright bass resonance',
  };

  const instrumentalParts: string[] = [];

  instrumentalParts.push(`${genreName} music, ${moodName} mood`);
  instrumentalParts.push(`${plan.bpm} BPM in ${plan.key} ${plan.scale}`);

  const artist = ARTIST_STYLES.find(a => a.name === context.artistInspiration);
  if (artist) {
    instrumentalParts.push(`inspired by ${artist.name} (${artist.productionNotes})`);
  }

  if (genre?.modelPromptKeywords) {
    instrumentalParts.push(...genre.modelPromptKeywords);
  }

  if (mood?.promptKeywords?.length) {
    instrumentalParts.push(...mood.promptKeywords);
  }

  const prodDetails = mixPalette[genreName.toLowerCase()] ?? 'balanced production, mono bass below 120Hz, stereo width 70%';
  instrumentalParts.push(prodDetails);
  instrumentalParts.push(`delay/reverb tails timed to tempo (1/4 note = ${delayMs}ms)`);
  instrumentalParts.push('defined transient detail on drums, stereo width on pads and FX');

  const instrumentalPrompt = instrumentalParts.join(", ") + ".";

  const vocalParts: string[] = [];
  vocalParts.push(`${context.vocalStyle || 'mixed voice'} vocals`);
  vocalParts.push(`singing in ${context.vocalLanguage || 'English'}`);

  if (genre?.vocalCharacteristics) {
    vocalParts.push(genre.vocalCharacteristics);
  }

  vocalParts.push(`phrasing locked to ${plan.bpm} BPM groove`);
  vocalParts.push('processing: gentle optical compression (3-4dB GR), plate reverb (1.6s decay, pre-delay 40ms), de-esser at 6-8kHz, presence boost +2dB at 3.5kHz');

  const vocalPrompt = vocalParts.join(", ") + ".";

  const genreLower = genreName.toLowerCase();
  const mixChar = genreLower.includes("lo-fi") ? "muffled and warm with tape saturation"
    : genreLower.includes("pop") ? "bright and crisp with vocal-forward balance"
    : genreLower.includes("metal") ? "saturated and aggressive with tight low-end"
    : genreLower.includes("jazz") ? "warm and intimate with natural room ambience"
    : genreLower.includes("ambient") ? "spacious and immersive with deep reverb"
    : "cleanly with balanced frequency separation";

  const mixingInstruction = `High-end mix: blend the ${context.vocalStyle || 'mixed voice'} vocals ${mixChar} with the ${genreName} instrumental at ${plan.bpm} BPM. Mono bass below 120Hz, vocal sitting -3dB to -6dB above instrumental bed, kick and snare cutting through with 3-5kHz transient presence, pads and reverb returns at -18dB to -12dB for depth without masking. Master bus: gentle glue compression (2:1, 2-3dB GR), brickwall limiter at -1dB true peak. Target -14 LUFS integrated loudness.`;

  return {
    instrumentalPrompt,
    vocalPrompt,
    mixingInstruction
  };
}
