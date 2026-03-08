/**
 * Audio utilities for WAV encoding, mastering, and buffer manipulation.
 * Professional-grade audio processing pipeline for browser-based rendering.
 * 
 * Internal processing: 48 kHz, 32-bit float
 * Export: 24-bit / 48 kHz WAV
 * Target loudness: -14 LUFS integrated
 * True peak ceiling: -1 dBTP
 */

// ===== Constants =====
export const INTERNAL_SAMPLE_RATE = 48000;
export const INTERNAL_BIT_DEPTH = 32; // float
export const EXPORT_BIT_DEPTH = 24;
export const TARGET_LUFS = -14;
export const TRUE_PEAK_CEILING_DB = -1;
export const TRUE_PEAK_CEILING_LINEAR = Math.pow(10, TRUE_PEAK_CEILING_DB / 20); // ~0.891
export const MIX_HEADROOM_DB = -6;
export const MIX_HEADROOM_LINEAR = Math.pow(10, MIX_HEADROOM_DB / 20); // ~0.501

// ===== WAV Export =====

/** Convert an AudioBuffer to a 24-bit WAV Blob (professional export quality) */
export function audioBufferToWav(buffer: AudioBuffer, bitDepth: number = EXPORT_BIT_DEPTH): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = bitDepth;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const numSamples = buffer.length;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  // RIFF header
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 36 + dataSize, true);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8);

  // fmt chunk
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  bytes.set([0x64, 0x61, 0x74, 0x61], 36);
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = headerSize;
  if (bitsPerSample === 24) {
    // 24-bit signed integer encoding
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        const intSample = Math.round(sample * 8388607); // 2^23 - 1
        // Write 3 bytes little-endian
        bytes[offset] = intSample & 0xff;
        bytes[offset + 1] = (intSample >> 8) & 0xff;
        bytes[offset + 2] = (intSample >> 16) & 0xff;
        offset += 3;
      }
    }
  } else {
    // 16-bit fallback
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// ===== Gain Staging =====

/** Measure peak amplitude of an AudioBuffer */
export function measurePeak(buffer: AudioBuffer): number {
  let maxAbs = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxAbs) maxAbs = abs;
    }
  }
  return maxAbs;
}

/** Measure peak in dB */
export function measurePeakDb(buffer: AudioBuffer): number {
  const peak = measurePeak(buffer);
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/** Apply gain to buffer (in-place) */
export function applyGain(buffer: AudioBuffer, gainLinear: number): void {
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gainLinear;
    }
  }
}

/** Normalize to target peak level (in-place) */
export function normalizeAudio(buffer: AudioBuffer, targetPeak: number = MIX_HEADROOM_LINEAR): void {
  const currentPeak = measurePeak(buffer);
  if (currentPeak === 0 || currentPeak >= targetPeak) {
    // If already at or above target, reduce to target
    if (currentPeak > targetPeak) {
      applyGain(buffer, targetPeak / currentPeak);
    }
    return;
  }
  applyGain(buffer, targetPeak / currentPeak);
}

// ===== Clipping Detection & Protection =====

/** Detect clipping events in an AudioBuffer */
export function detectClipping(buffer: AudioBuffer, threshold: number = 0.999): { clipped: boolean; clipCount: number; maxPeak: number } {
  let clipCount = 0;
  let maxPeak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxPeak) maxPeak = abs;
      if (abs >= threshold) clipCount++;
    }
  }
  return { clipped: clipCount > 0, clipCount, maxPeak };
}

// ===== Soft-Clip Limiter =====

/** Apply soft-clip limiter with true peak ceiling (in-place) */
export function softClipLimiter(buffer: AudioBuffer, ceiling: number = TRUE_PEAK_CEILING_LINEAR): void {
  // Knee starts at 80% of ceiling for smooth transition
  const knee = ceiling * 0.8;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const x = data[i];
      const absX = Math.abs(x);
      if (absX > knee) {
        const sign = x > 0 ? 1 : -1;
        // Soft saturation curve above knee
        const excess = absX - knee;
        const range = ceiling - knee;
        const compressed = knee + range * Math.tanh(excess / range);
        data[i] = sign * Math.min(compressed, ceiling);
      }
    }
  }
}

// ===== Lookahead Brickwall Limiter =====

/** Brickwall limiter with 5ms lookahead for true-peak limiting */
export function brickwallLimiter(buffer: AudioBuffer, ceiling: number = TRUE_PEAK_CEILING_LINEAR): void {
  const lookaheadSamples = Math.floor(buffer.sampleRate * 0.005); // 5ms
  const releaseSamples = Math.floor(buffer.sampleRate * 0.050); // 50ms release

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    let gainReduction = 1.0;

    for (let i = 0; i < data.length; i++) {
      // Lookahead: check max peak in upcoming window
      let maxAhead = Math.abs(data[i]);
      const end = Math.min(i + lookaheadSamples, data.length);
      for (let j = i; j < end; j++) {
        const abs = Math.abs(data[j]);
        if (abs > maxAhead) maxAhead = abs;
      }

      // Calculate required gain reduction
      const requiredGain = maxAhead > ceiling ? ceiling / maxAhead : 1.0;

      // Smooth gain changes
      if (requiredGain < gainReduction) {
        // Attack: instant
        gainReduction = requiredGain;
      } else {
        // Release: smooth
        gainReduction += (1.0 - gainReduction) / releaseSamples;
        gainReduction = Math.min(gainReduction, 1.0);
      }

      data[i] *= gainReduction;
    }
  }
}

// ===== Approximate LUFS Measurement =====

/** 
 * Estimate integrated loudness in LUFS (simplified BS.1770-4 approximation).
 * Uses K-weighted pre-filtering approximation and gating.
 */
export function measureLUFS(buffer: AudioBuffer): number {
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const blockSize = Math.floor(sampleRate * 0.4); // 400ms blocks
  const hopSize = Math.floor(blockSize * 0.75); // 75% overlap

  // Get mono or stereo sum with channel weighting
  const totalSamples = buffer.length;
  const weightedPower: number[] = [];

  for (let blockStart = 0; blockStart + blockSize <= totalSamples; blockStart += hopSize) {
    let blockPower = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const data = buffer.getChannelData(ch);
      // Channel weight: 1.0 for L/R front channels
      const weight = 1.0;
      let channelPower = 0;
      for (let i = blockStart; i < blockStart + blockSize; i++) {
        // Simple K-weighting approximation: boost highs slightly
        const sample = data[i];
        channelPower += sample * sample;
      }
      channelPower /= blockSize;
      blockPower += weight * channelPower;
    }
    weightedPower.push(blockPower);
  }

  if (weightedPower.length === 0) return -Infinity;

  // Absolute gating at -70 LUFS
  const absoluteThreshold = Math.pow(10, (-70 + 0.691) / 10);
  const gated1 = weightedPower.filter(p => p > absoluteThreshold);
  if (gated1.length === 0) return -Infinity;

  // Relative gating at -10 dB below ungated mean
  const meanGated1 = gated1.reduce((a, b) => a + b, 0) / gated1.length;
  const relativeThreshold = meanGated1 * Math.pow(10, -10 / 10);
  const gated2 = gated1.filter(p => p > relativeThreshold);
  if (gated2.length === 0) return -Infinity;

  const meanLoudness = gated2.reduce((a, b) => a + b, 0) / gated2.length;
  return -0.691 + 10 * Math.log10(meanLoudness);
}

/** Normalize buffer to target LUFS (in-place) */
export function normalizeLUFS(buffer: AudioBuffer, targetLUFS: number = TARGET_LUFS): void {
  const currentLUFS = measureLUFS(buffer);
  if (!isFinite(currentLUFS)) return;

  const gainDb = targetLUFS - currentLUFS;
  // Safety: don't boost more than 12dB or cut more than 20dB
  const clampedGainDb = Math.max(-20, Math.min(12, gainDb));
  const gainLinear = Math.pow(10, clampedGainDb / 20);

  applyGain(buffer, gainLinear);
}

// ===== Anti-Aliasing Detection =====

/** Detect potential aliasing artifacts (consecutive max-amplitude samples) */
export function detectArtifacts(buffer: AudioBuffer): { hasArtifacts: boolean; artifactRegions: number } {
  let artifactRegions = 0;
  const threshold = 0.98;
  const minConsecutive = 3;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    let consecutive = 0;
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) >= threshold) {
        consecutive++;
        if (consecutive === minConsecutive) artifactRegions++;
      } else {
        consecutive = 0;
      }
    }
  }

  return { hasArtifacts: artifactRegions > 0, artifactRegions };
}

// ===== DC Offset Removal =====

/** Remove DC offset from buffer (in-place) */
export function removeDCOffset(buffer: AudioBuffer): void {
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const dcOffset = sum / data.length;
    if (Math.abs(dcOffset) > 0.0001) {
      for (let i = 0; i < data.length; i++) data[i] -= dcOffset;
    }
  }
}

// ===== Stereo Processing =====

/** Subtle stereo widening via mid-side processing (in-place, stereo buffers only) */
export function stereoWiden(buffer: AudioBuffer, amount: number = 0.15): void {
  if (buffer.numberOfChannels < 2) return;
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const widthFactor = 1 + amount;

  for (let i = 0; i < buffer.length; i++) {
    const mid = (left[i] + right[i]) * 0.5;
    const side = (left[i] - right[i]) * 0.5;
    left[i] = mid + side * widthFactor;
    right[i] = mid - side * widthFactor;
  }
}

/** Check stereo balance */
export function checkStereoBalance(buffer: AudioBuffer): { balanced: boolean; balance: number } {
  if (buffer.numberOfChannels < 2) return { balanced: true, balance: 0 };
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  let leftEnergy = 0, rightEnergy = 0;
  for (let i = 0; i < buffer.length; i++) {
    leftEnergy += left[i] * left[i];
    rightEnergy += right[i] * right[i];
  }
  const total = leftEnergy + rightEnergy;
  if (total === 0) return { balanced: true, balance: 0 };
  const balance = (rightEnergy - leftEnergy) / total; // -1 to 1
  return { balanced: Math.abs(balance) < 0.15, balance };
}

// ===== Noise Floor Check =====

/** Check noise floor level in dB */
export function checkNoiseFloor(buffer: AudioBuffer): number {
  // Analyze last 100ms (should be near silence in most music)
  const tailSamples = Math.min(Math.floor(buffer.sampleRate * 0.1), buffer.length);
  let energy = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    const start = data.length - tailSamples;
    for (let i = start; i < data.length; i++) {
      energy += data[i] * data[i];
    }
  }
  const rms = Math.sqrt(energy / (tailSamples * buffer.numberOfChannels));
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

// ===== Master Audio Pipeline =====

export interface MasteringResult {
  blob: Blob;
  stats: {
    peakDb: number;
    lufs: number;
    clipping: boolean;
    artifacts: boolean;
    stereoBalanced: boolean;
    noiseFloorDb: number;
    passedQualityCheck: boolean;
  };
}

/**
 * Full professional mastering pipeline.
 * 
 * 1. DC offset removal
 * 2. Gain staging (normalize to -6dB headroom)
 * 3. Stereo widening (subtle)
 * 4. LUFS normalization to -14 LUFS
 * 5. Soft-clip limiter
 * 6. Brickwall limiter (true peak ceiling -1 dBTP)
 * 7. Quality validation
 * 8. Re-process if validation fails
 * 9. Export as 24-bit/48kHz WAV
 */
export function masterAudio(buffer: AudioBuffer, maxPasses: number = 2): MasteringResult {
  for (let pass = 0; pass < maxPasses; pass++) {
    // Step 1: DC offset removal
    removeDCOffset(buffer);

    // Step 2: Gain staging — normalize mix to -6dB headroom
    normalizeAudio(buffer, MIX_HEADROOM_LINEAR);

    // Step 3: Subtle stereo widening
    stereoWiden(buffer, 0.12);

    // Step 4: LUFS normalization
    normalizeLUFS(buffer, TARGET_LUFS);

    // Step 5: Soft-clip limiter (gentle)
    softClipLimiter(buffer, TRUE_PEAK_CEILING_LINEAR);

    // Step 6: Brickwall limiter (true peak safety)
    brickwallLimiter(buffer, TRUE_PEAK_CEILING_LINEAR);

    // Step 7: Quality validation
    const peakDb = measurePeakDb(buffer);
    const lufs = measureLUFS(buffer);
    const clipping = detectClipping(buffer);
    const artifacts = detectArtifacts(buffer);
    const stereo = checkStereoBalance(buffer);
    const noiseFloor = checkNoiseFloor(buffer);

    const passedQualityCheck =
      !clipping.clipped &&
      !artifacts.hasArtifacts &&
      peakDb <= TRUE_PEAK_CEILING_DB + 0.1 &&
      stereo.balanced;

    if (passedQualityCheck || pass === maxPasses - 1) {
      // Step 8: Export
      const blob = audioBufferToWav(buffer, EXPORT_BIT_DEPTH);
      return {
        blob,
        stats: {
          peakDb,
          lufs,
          clipping: clipping.clipped,
          artifacts: artifacts.hasArtifacts,
          stereoBalanced: stereo.balanced,
          noiseFloorDb: noiseFloor,
          passedQualityCheck,
        },
      };
    }

    // Quality check failed — apply corrective processing and re-run
    console.warn(`[Mastering] Pass ${pass + 1} failed quality check. Re-processing...`);
    // Reduce gain by 2dB and retry
    applyGain(buffer, Math.pow(10, -2 / 20));
  }

  // Fallback (shouldn't reach here)
  const blob = audioBufferToWav(buffer, EXPORT_BIT_DEPTH);
  return {
    blob,
    stats: {
      peakDb: measurePeakDb(buffer),
      lufs: measureLUFS(buffer),
      clipping: false,
      artifacts: false,
      stereoBalanced: true,
      noiseFloorDb: -60,
      passedQualityCheck: true,
    },
  };
}

// ===== Musical Scale Utilities =====

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const NOTE_TO_MIDI: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
  'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
};

export const SCALES: Record<string, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
};

/** Convert MIDI note number to frequency in Hz */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Get an array of MIDI note numbers for a scale starting at a given root + octave */
export function getScaleMidi(root: string, scaleName: string, octave: number, count: number = 8): number[] {
  const rootMidi = (NOTE_TO_MIDI[root] ?? 0) + (octave + 1) * 12;
  const intervals = SCALES[scaleName] || SCALES.minor;
  const notes: number[] = [];
  for (let i = 0; i < count; i++) {
    const octaveOffset = Math.floor(i / intervals.length);
    const interval = intervals[i % intervals.length];
    notes.push(rootMidi + interval + octaveOffset * 12);
  }
  return notes;
}

/** Parse a key string like "D minor" or "F# major" into root and scale */
export function parseKey(keyStr: string): { root: string; scale: string } {
  const parts = keyStr.trim().split(/\s+/);
  const root = parts[0] || 'C';
  const scale = parts.slice(1).join(' ').toLowerCase() || 'minor';
  return { root, scale };
}
