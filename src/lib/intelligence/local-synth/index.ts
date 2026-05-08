/**
 * Local-synth public API.
 *
 * Renders a `CompositionPlan` into stereo PCM entirely in the browser via
 * OfflineAudioContext. Zero external API calls. Same plan + same seed
 * always produces the same audio.
 *
 * Pair with `master-pass.ts` for LUFS-targeted mastering and
 * `wav-encoder.ts` for download-ready WAV blobs.
 */

export * from "./theory";
export * from "./voices";
export * from "./sequencer";
export * from "./render";
