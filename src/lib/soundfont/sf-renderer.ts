/**
 * SoundFont-backed offline renderer.
 *
 * Takes the MIDI events your existing music-engine already plans (bassline,
 * melody, chord progression — each with midi + duration + velocity) and
 * renders them through a real sampled General-MIDI soundfont using
 * `spessasynth_lib`. The output is a regular `AudioBuffer` that drops into
 * the same per-stem buffer slot the oscillator path used.
 *
 * The soundfont is loaded once per session, cached in IndexedDB after the
 * first fetch, and reused across every segment / song.
 *
 * Drums + FX intentionally stay on the existing noise-synth path — they
 * sound fine and percussion soundfonts add complexity without much win.
 */
import { Midi } from "@tonejs/midi";

export interface SfNoteEvent {
  /** Time in seconds relative to the start of the buffer being rendered. */
  time: number;
  /** MIDI note number (0–127). */
  midi: number;
  /** Note length in seconds. */
  duration: number;
  /** Velocity 0–1 (will be scaled to 0–127 in the MIDI). */
  velocity: number;
}

export type SfStem = "bass" | "lead" | "pads";

/**
 * GM program numbers per stem. Chosen to match the timbre the existing
 * oscillator engine was reaching for:
 *   - Bass:  GM 34 "Electric Bass (finger)" — punchy, sits below the mix
 *   - Lead:  GM 81 "Lead 1 (square)" → readable on hooks
 *   - Pads:  GM 89 "Pad 2 (warm)"  → warm, sustained chord bed
 *
 * Anyone can override by passing `programOverrides` to renderEvents().
 */
const DEFAULT_PROGRAMS: Record<SfStem, number> = {
  bass: 34,
  lead: 81,
  pads: 89,
};

const CHANNEL_BY_STEM: Record<SfStem, number> = {
  bass: 0,
  lead: 1,
  pads: 2,
};

/**
 * Public URL to the default SoundFont. Override via env or call site.
 *
 * If you want the highest quality, drop your own .sf3 (or .sf2) into
 * `public/soundfonts/default.sf3` and the renderer will pick it up.
 *
 * `GeneralUserGS` (free, by S. Christian Collins) is a good default —
 * ~30 MB SF3 with the full GM set + drums. Other options:
 *   - FluidR3_GM  (~140 MB SF2)  — broader instrument range
 *   - MuseScore_General (~35 MB SF3) — bundled with MuseScore
 *
 * SF3 is heavily preferred for browser delivery (Opus-compressed samples
 * are ~5× smaller than uncompressed SF2).
 */
const DEFAULT_SOUNDFONT_URL =
  (typeof import.meta !== "undefined"
    ? (import.meta as ImportMeta & { env?: { VITE_SOUNDFONT_URL?: string } }).env?.VITE_SOUNDFONT_URL
    : undefined) ?? "/soundfonts/default.sf3";

const IDB_NAME = "musevibe-soundfont-cache";
const IDB_STORE = "fonts";

let sfBufferPromise: Promise<ArrayBuffer> | null = null;

async function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIdb(key: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openIdb();
    return await new Promise<ArrayBuffer | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as ArrayBuffer) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // IDB unavailable (private browsing, etc.) — fall through to network.
    return null;
  }
}

async function saveToIdb(key: string, buf: ArrayBuffer): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(buf, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Cache failure is non-fatal — we already have the buffer in memory.
  }
}

/**
 * Fetch + cache the soundfont. The same promise is reused for the lifetime
 * of the tab, so concurrent callers (parallel segment renders) share one
 * download.
 */
function getSoundFont(url: string = DEFAULT_SOUNDFONT_URL): Promise<ArrayBuffer> {
  if (sfBufferPromise) return sfBufferPromise;
  sfBufferPromise = (async () => {
    const cached = await loadFromIdb(url);
    if (cached && cached.byteLength > 0) return cached;
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`SoundFont fetch failed: ${res.status} ${res.statusText}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 1024) {
      throw new Error(`SoundFont at ${url} looks too small (${buf.byteLength} bytes) — wrong path?`);
    }
    await saveToIdb(url, buf);
    return buf;
  })().catch((err) => {
    // Reset so a later retry can re-attempt the fetch instead of failing
    // forever from a transient error.
    sfBufferPromise = null;
    throw err;
  });
  return sfBufferPromise;
}

interface SpessaSynthLib {
  Synthetizer: new (
    destination: AudioNode,
    soundFontBuffer: ArrayBuffer,
    enableEventSystem?: boolean,
    presetList?: unknown,
    config?: unknown,
  ) => SynthetizerInstance;
  Sequencer: new (
    midiBuffers: { binary: ArrayBuffer; altName?: string }[],
    synth: SynthetizerInstance,
    options?: { skipToFirstNoteOn?: boolean; autoPlay?: boolean },
  ) => SequencerInstance;
}

interface SynthetizerInstance {
  // The library exposes more — these are the methods we touch.
  isReady: Promise<void>;
  programChange(channel: number, program: number): void;
}

interface SequencerInstance {
  loadNewSongList(midiBuffers: { binary: ArrayBuffer; altName?: string }[]): void;
  play(): void;
}

let libPromise: Promise<SpessaSynthLib> | null = null;
let workletPromise: Promise<void> | null = null;

async function getSpessaLib(): Promise<SpessaSynthLib> {
  if (!libPromise) {
    libPromise = (async () => {
      // Dynamic import so the bundle doesn't pull spessasynth into the main
      // chunk — only consumed when the user actually opts into SF rendering.
      const mod = (await import("spessasynth_lib")) as unknown as SpessaSynthLib;
      return mod;
    })();
  }
  return libPromise;
}

/**
 * Register the AudioWorklet processor on the given context. Each new
 * OfflineAudioContext needs its own registration, but the underlying
 * module URL can be reused via the worklet cache.
 */
async function ensureWorklet(ctx: BaseAudioContext): Promise<void> {
  // The library bundles a worklet processor; Vite needs the `?url` query
  // to emit it as a static asset and give us the resolvable URL.
  if (!workletPromise) {
    workletPromise = (async () => {
      // Resolved at build time by Vite — the import returns a string URL.
      const mod = (await import(
        /* @vite-ignore */
        "spessasynth_lib/synthetizer/worklet_processor.min.js?url"
      )) as { default: string };
      return mod.default;
    })().then(() => undefined) as Promise<void>;
  }
  await workletPromise;

  const workletUrlMod = (await import(
    /* @vite-ignore */
    "spessasynth_lib/synthetizer/worklet_processor.min.js?url"
  )) as { default: string };
  // addModule throws if the module is already registered on this context,
  // but each OfflineAudioContext is fresh, so we always call it.
  await ctx.audioWorklet.addModule(workletUrlMod.default);
}

/**
 * Build a single-track MIDI binary from a list of note events. All notes
 * land on `channel`, all play `program`. Tempo is fixed at 120 BPM
 * (irrelevant — we encode times in ticks relative to that tempo so the
 * absolute seconds line up regardless).
 */
function eventsToMidiBlob(
  events: SfNoteEvent[],
  channel: number,
  program: number,
  totalDurationSeconds: number,
): ArrayBuffer {
  const midi = new Midi();
  midi.header.setTempo(120);
  const ppq = midi.header.ppq;
  const secondsPerBeat = 60 / 120;
  const secondsPerTick = secondsPerBeat / ppq;

  const track = midi.addTrack();
  track.channel = channel;
  track.instrument.number = program;

  for (const evt of events) {
    if (evt.midi < 0 || evt.midi > 127) continue;
    const velocity = Math.max(0, Math.min(1, evt.velocity));
    if (velocity <= 0) continue;
    const startTicks = Math.max(0, Math.round(evt.time / secondsPerTick));
    const durTicks = Math.max(1, Math.round(evt.duration / secondsPerTick));
    track.addNote({
      midi: Math.round(evt.midi),
      ticks: startTicks,
      durationTicks: durTicks,
      velocity,
    });
  }

  // Add a silent tail so the sequencer doesn't stop before the buffer
  // actually ends — otherwise long note releases on the final notes get cut.
  const tailTicks = Math.max(1, Math.round((totalDurationSeconds + 0.5) / secondsPerTick));
  track.addNote({
    midi: 0,
    ticks: tailTicks,
    durationTicks: 1,
    velocity: 0,
  });

  return midi.toArray().buffer.slice(0) as ArrayBuffer;
}

export interface SoundFontStatus {
  /** True once the soundfont is loaded and the worklet is registered. */
  ready: boolean;
  /** Last error message if loading failed; empty string otherwise. */
  lastError: string;
}

let cachedStatus: SoundFontStatus = { ready: false, lastError: "" };

export function getSoundFontStatus(): SoundFontStatus {
  return { ...cachedStatus };
}

/**
 * Preload the soundfont + library bundle so the first generation doesn't
 * pay the cold-start cost. Safe to call multiple times.
 */
export async function preloadSoundFont(url?: string): Promise<SoundFontStatus> {
  try {
    await Promise.all([getSoundFont(url), getSpessaLib()]);
    cachedStatus = { ready: true, lastError: "" };
  } catch (err) {
    cachedStatus = { ready: false, lastError: err instanceof Error ? err.message : String(err) };
  }
  return getSoundFontStatus();
}

/**
 * Render a list of MIDI events through the soundfont, returning an
 * AudioBuffer that can be slotted into the existing stem-buffer array.
 *
 * Single-stem render — one program, one channel. Run once per stem per
 * segment. Each call creates its own OfflineAudioContext so concurrent
 * renders (segment concurrency = 2 in the engine) don't collide.
 */
export async function renderEventsToBuffer(opts: {
  events: SfNoteEvent[];
  durationSeconds: number;
  sampleRate: number;
  numChannels?: number;
  stem: SfStem;
  programOverride?: number;
  /** Output gain (linear), applied via the destination. Defaults to 1.0. */
  gain?: number;
  soundFontUrl?: string;
}): Promise<AudioBuffer> {
  const { events, durationSeconds, sampleRate, stem } = opts;
  const numChannels = opts.numChannels ?? 2;
  const program = opts.programOverride ?? DEFAULT_PROGRAMS[stem];
  const channel = CHANNEL_BY_STEM[stem];

  const ctx = new OfflineAudioContext(
    numChannels,
    Math.max(1, Math.ceil(sampleRate * durationSeconds)),
    sampleRate,
  );

  await ensureWorklet(ctx);
  const sfBuffer = await getSoundFont(opts.soundFontUrl);
  const lib = await getSpessaLib();

  const synth = new lib.Synthetizer(ctx.destination, sfBuffer);
  await synth.isReady;
  synth.programChange(channel, program);

  const midiBlob = eventsToMidiBlob(events, channel, program, durationSeconds);
  const sequencer = new lib.Sequencer(
    [{ binary: midiBlob, altName: `${stem}-segment.mid` }],
    synth,
    { skipToFirstNoteOn: false, autoPlay: false },
  );
  sequencer.play();

  return ctx.startRendering();
}

/**
 * Convenience: render bass + lead + pads in parallel for one segment.
 * Returns the three buffers ready to drop into the engine's per-stem slots.
 */
export async function renderSegmentStems(opts: {
  bassEvents: SfNoteEvent[];
  leadEvents: SfNoteEvent[];
  padEvents: SfNoteEvent[];
  durationSeconds: number;
  sampleRate: number;
  numChannels?: number;
  soundFontUrl?: string;
}): Promise<{ bass: AudioBuffer; lead: AudioBuffer; pads: AudioBuffer }> {
  const { durationSeconds, sampleRate, numChannels, soundFontUrl } = opts;
  const [bass, lead, pads] = await Promise.all([
    renderEventsToBuffer({
      events: opts.bassEvents, durationSeconds, sampleRate, numChannels, stem: "bass", soundFontUrl,
    }),
    renderEventsToBuffer({
      events: opts.leadEvents, durationSeconds, sampleRate, numChannels, stem: "lead", soundFontUrl,
    }),
    renderEventsToBuffer({
      events: opts.padEvents, durationSeconds, sampleRate, numChannels, stem: "pads", soundFontUrl,
    }),
  ]);
  return { bass, lead, pads };
}
