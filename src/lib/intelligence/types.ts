/**
 * Shared types for the Music Intelligence Engine.
 * Every stage of the pipeline reads/writes a CompositionPlan.
 */

export type Mode =
  | "major"
  | "natural-minor"
  | "harmonic-minor"
  | "melodic-minor"
  | "dorian"
  | "phrygian"
  | "phrygian-dominant"
  | "lydian"
  | "mixolydian"
  | "locrian"
  | "pentatonic-major"
  | "pentatonic-minor"
  | "blues"
  | "raga"          // Indian classical, raga name in `ragaName`
  | "maqam"         // Arabic, maqam name in `maqamName`
  | "drone";

export type TimeSignature =
  | "4/4"
  | "3/4"
  | "6/8"
  | "12/8"
  | "5/4"
  | "7/8"
  | "indian-taal";

export interface MotifPlan {
  id: "hook" | "verse" | "counter" | "bridge" | "tag";
  description: string;
  bars: number;
  intervalRangeSemitones: number;  // ≤ 9 for hooks
  intendedRepeatCount: number;      // hook ≥4, verse ≥3
  contour: "arch" | "wave" | "ascending" | "descending" | "pivot" | "range-expansion";
  developmentPlan?: ("repetition" | "sequence" | "inversion" | "augmentation" | "diminution" | "fragmentation" | "reharmonization")[];
}

export interface EmotionalArcStep {
  sectionName: string;
  primaryEmotion: string;          // e.g. "yearning", "triumphant", "melancholic"
  intensity: number;               // 0-1
  surpriseElement?: string;        // optional: "key change up half-step", "deceptive cadence", etc.
}

export interface SectionPlan {
  name: string;                    // "verse-1", "chorus-1", etc.
  durationSeconds: number;
  bars: number;
  energy: number;                  // 0-1
  density: number;                 // 0-1
  vocalDensity: number;            // 0-1
  harmonicRhythm: number;          // chords per bar
  transitionIn: string;
  primaryProgressionId?: string;   // chord-emotion-database id
  instruments: string[];
  notes?: string;
}

export interface VocalPlan {
  hasVocals: boolean;
  language?: string;
  style?: string;                  // "rap", "melodic", "operatic", "spoken-word", "growl"...
  register?: "low" | "mid-low" | "mid" | "mid-high" | "high" | "falsetto";
  processing?: ("auto-tune-light" | "auto-tune-heavy" | "reverb-plate" | "reverb-hall" | "delay" | "saturation" | "doubling" | "harmony-stack" | "ad-libs")[];
  harmonyStackVoices?: number;     // 0 = no stack; 4-6 typical for K-pop chorus
}

export interface MixTargets {
  lufsIntegrated: number;          // e.g. -8 for pop, -14 for lo-fi
  truePeakDb: number;              // -1.0 default
  stereoWidthPct: number;          // 0-100
  monoBassThresholdHz: number;     // default 120
  compressionTargetGrDb: number;   // glue compression amount
  sidechainBassToKickDb: number;
  bandBudgetDbRel: {
    low_60_120: number;
    mid_low_120_500: number;
    mid_500_2k: number;
    presence_2k_5k: number;
    high_5k_10k: number;
    air_10k_20k: number;
  };
}

export interface VisualPlan {
  aestheticId: string;             // key into VISUAL_STYLE_KNOWLEDGE_BASE
  perSectionPalette: { sectionName: string; dominant: string; support: string; accent: string; highlights: string[] }[];
  cameraArchetype: string;
  cutRhythm: { sectionName: string; cutsPerBar: number }[];
  deliveryTarget: "shorts" | "youtube-16-9" | "square" | "spotify-canvas" | "hifi-master";
  resolution: { width: number; height: number };
  fps: number;
}

export interface CompositionPlan {
  brief: {
    mood: string;
    genre: string;
    audience?: string;
    language?: string;
    occasion?: string;
    references?: string[];
    durationSeconds: number;
    instrumentalOnly: boolean;
  };
  resolved: {
    genreId: string;
    bpm: number;
    key: string;
    mode: Mode;
    ragaName?: string;
    maqamName?: string;
    timeSignature: TimeSignature;
    progressionId: string;          // primary progression
    progressionRomanNumerals: string[];
    progressionVoicingExample: string[];
    archetypeId: string;
    sections: SectionPlan[];
    motifs: MotifPlan[];
    emotionalArc: EmotionalArcStep[];
    vocal: VocalPlan;
    mixTargets: MixTargets;
    visual: VisualPlan;
    references: string[];
    primaryInstruments: string[];
  };
  prompts: {
    audio?: string;
    video?: string;
    lyrics?: string;
  };
  postRender?: {
    measuredLUFS?: number;
    measuredTruePeakDb?: number;
    qualityScore?: number;
    issues?: string[];
  };
  meta: {
    planVersion: string;
    createdAt: string;              // ISO
    seed?: string;
  };
}

export interface QualityScore {
  total: number;                   // 0-100
  components: {
    hookClarityAt30s: number;
    energyCurveCorrectness: number;
    surpriseToPredictabilityRatio: number;
    motifRepetitionCount: number;
    cadenceStrengthAtSectionEnds: number;
    mixClarity: number;
    finalThirdPayoffIntensity: number;
  };
  issues: string[];
}
