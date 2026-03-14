export interface GenerationDNALike {
  seed?: string;
  motifShape?: number;
  grooveBias?: number;
  harmonicMood?: number;
  textureDensity?: number;
  visualEnergy?: number;
  arrangementStyle?: string;
  colorSignature?: string[];
}

export interface UniversalMusicKnowledgeDomain {
  name: string;
  rules: string[];
}

export const UniversalMusicKnowledge = {
  historicalEras: [
    "ancient ceremonial traditions",
    "medieval and renaissance practices",
    "baroque and classical craft",
    "romantic and impressionist color",
    "modernist and avant-garde experimentation",
    "analog studio eras of the 20th century",
    "digital and post-digital production cultures",
  ],
  culturalRegions: [
    "West African and diasporic rhythm traditions",
    "South Asian melodic and rhythmic systems",
    "East Asian court, folk, and contemporary traditions",
    "Middle Eastern and North African modal practices",
    "European orchestral, folk, and club lineages",
    "Latin American and Caribbean groove systems",
    "North American vernacular, electronic, and experimental forms",
    "Oceanic and Indigenous vocal and ceremonial traditions",
  ],
  domains: {
    musicTheory: {
      name: "musicTheory",
      rules: [
        "Use tonal, modal, pentatonic, chromatic, or drone-based logic depending on the prompt.",
        "Allow motivic repetition, call-and-response, ostinato, or through-composed development.",
        "Do not assume Western verse-chorus logic unless the prompt suggests it.",
      ],
    },
    harmonySystems: {
      name: "harmonySystems",
      rules: [
        "Support functional harmony, modal harmony, parallel planing, pedal-point harmony, and non-functional movement.",
        "Permit sparse harmony or single-drone structures for traditions that center rhythm, timbre, or chant.",
      ],
    },
    rhythmSystems: {
      name: "rhythmSystems",
      rules: [
        "Support straight pulse, swing, additive meters, tala-like cycles, clave-like patterns, and layered polyrhythm.",
        "Rhythm may be the primary identity of the track even when harmony is minimal.",
      ],
    },
    instrumentFamilies: {
      name: "instrumentFamilies",
      rules: [
        "Select from percussion, plucked strings, bowed strings, winds, brass, voice, analog synths, digital synths, found sound, and hybrid processing.",
        "Treat instrument choices as cultural and textural signals, not a fixed genre checklist.",
      ],
    },
    orchestrationTechniques: {
      name: "orchestrationTechniques",
      rules: [
        "Use layering, unison reinforcement, counter-lines, drone beds, punctuated accents, antiphony, and spatial contrast.",
        "Texture density should evolve across sections instead of staying flat.",
      ],
    },
    songStructureConventions: {
      name: "songStructureConventions",
      rules: [
        "Support strophic forms, verse-chorus forms, suite-like movement, cyclic builds, ritual repetition, and freeform arcs.",
        "Section order and duration should be adapted from prompt intent, not prebuilt templates.",
      ],
    },
    productionStyles: {
      name: "productionStyles",
      rules: [
        "Production may emphasize room realism, tape saturation, club transients, cinematic space, lo-fi grit, or hyper-detailed modern polish.",
        "Mix and master choices should match the implied listening context.",
      ],
    },
    vocalTraditions: {
      name: "vocalTraditions",
      rules: [
        "Support chant, folk lead, rap flow, whispered intimacy, choir, melisma, spoken-word, vocoder, and instrumental absence.",
        "If lyrics exist, phrasing should follow rhythm identity rather than force a pop cadence.",
      ],
    },
  } satisfies Record<string, UniversalMusicKnowledgeDomain>,
};

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

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const KEYWORD_LENSES = [
  { match: /\b(choir|chant|hymn|sacred|ritual)\b/i, domain: "vocalTraditions", hint: "ceremonial vocal layering and sustained tonal gravity" },
  { match: /\b(tabla|raga|sitar|tanpura|bollywood|raag)\b/i, domain: "rhythmSystems", hint: "cyclical rhythm and modal melodic emphasis" },
  { match: /\b(gamelan|koto|shamisen|erhu|pipa|taiko)\b/i, domain: "instrumentFamilies", hint: "idiomatic struck and plucked timbres with pentatonic or modal color" },
  { match: /\b(trap|drill|808|rap)\b/i, domain: "productionStyles", hint: "sub-heavy low end, sparse harmonic framing, and vocal-forward rhythm" },
  { match: /\b(techno|warehouse|club|rave|acid)\b/i, domain: "songStructureConventions", hint: "DJ-aware tension arcs, repeated hooks, and movement by layering" },
  { match: /\b(cinematic|orchestral|score|epic)\b/i, domain: "orchestrationTechniques", hint: "register contrast, evolving motifs, and large-scale dynamic contour" },
  { match: /\b(folk|traditional|acoustic|roots)\b/i, domain: "musicTheory", hint: "motif-led phrasing with vernacular melodic simplicity" },
  { match: /\b(jazz|fusion|bebop|soul|funk)\b/i, domain: "harmonySystems", hint: "extended harmony, syncopation, and fluid groove identity" },
];

export function inferUniversalMusicContext(input: {
  musicPrompt?: string;
  genres?: string[];
  mood?: string;
  artistInspiration?: string;
  generationDNA?: GenerationDNALike | null;
}) {
  const combined = [
    input.musicPrompt || "",
    (input.genres || []).join(" "),
    input.mood || "",
    input.artistInspiration || "",
  ].join(" ").trim();
  const seed = input.generationDNA?.seed || combined || `${Date.now()}`;
  const rng = createSeededRng(seed);

  const matchedHints = KEYWORD_LENSES
    .filter(({ match }) => match.test(combined))
    .map(({ hint }) => hint);

  const domainEntries = Object.values(UniversalMusicKnowledge.domains);
  const sampledDomains = shuffleWithRng(domainEntries, rng).slice(0, 3);
  const sampledRegions = shuffleWithRng(UniversalMusicKnowledge.culturalRegions, rng).slice(0, 2);
  const sampledEras = shuffleWithRng(UniversalMusicKnowledge.historicalEras, rng).slice(0, 2);

  const inferredRules = sampledDomains.flatMap(domain => domain.rules.slice(0, 1));
  const descriptors = [...matchedHints, ...inferredRules];

  return {
    eras: sampledEras,
    regions: sampledRegions,
    domains: sampledDomains.map(domain => domain.name),
    descriptors,
  };
}

export function buildUniversalMusicKnowledgePrompt(input: {
  musicPrompt?: string;
  genres?: string[];
  mood?: string;
  artistInspiration?: string;
  generationDNA?: GenerationDNALike | null;
}) {
  const context = inferUniversalMusicContext(input);
  return `UniversalMusicKnowledge guidance:
- Treat music knowledge as universal across eras and regions.
- Consider historical anchors: ${context.eras.join("; ")}.
- Consider regional/cultural lenses: ${context.regions.join("; ")}.
- Apply domain rules from: ${context.domains.join(", ")}.
- Style cues inferred from the prompt: ${context.descriptors.join("; ")}.
- Do not reduce the result to a fixed genre list. Infer the musical behavior directly from the prompt and GenerationDNA.`;
}
