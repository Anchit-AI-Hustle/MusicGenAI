/**
 * Generation nonce — one source of truth for "this is a fresh request".
 *
 * Combines a process-wide monotonic counter with `Date.now()` and a small
 * random suffix so that:
 *
 *   1. Two clicks within the same millisecond still produce distinct nonces
 *      (counter increments).
 *   2. The string is stable across the whole pipeline — composition plan,
 *      lyric engine, sequencer RNG, model-call seeds, video render seed.
 *   3. It's short enough to surface in the UI for users who want to
 *      reproduce a track they liked.
 *
 * Format: `gn_<base36 timestamp>_<base36 counter>_<6-char random>`.
 *
 * Used by every "AI suggest", "Generate", and "Generate video" entry point.
 */

let counter = 0;

export function nextGenerationNonce(prefix: string = "gn"): string {
  counter = (counter + 1) >>> 0;
  const ts = Date.now().toString(36);
  const c  = counter.toString(36);
  const r  = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${c}_${r}`;
}

/**
 * Salt an existing seed with a fresh nonce. Used when callers already have
 * a per-session/per-user seed but want to ensure inter-click uniqueness.
 */
export function saltSeed(seed: string | undefined, prefix: string = "gn"): string {
  const nonce = nextGenerationNonce(prefix);
  return seed ? `${seed}~${nonce}` : nonce;
}
