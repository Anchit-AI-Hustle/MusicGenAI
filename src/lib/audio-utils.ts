/**
 * Audio utilities for WAV encoding and buffer manipulation.
 * All audio rendering happens in-browser using OfflineAudioContext.
 */

/** Convert an AudioBuffer to a WAV Blob */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const numSamples = buffer.length;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  // RIFF header
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt chunk
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  bytes.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataSize, true);

  // Interleave channels and write PCM samples
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = headerSize;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/** Apply simple loudness normalization to an AudioBuffer (in-place) */
export function normalizeAudio(buffer: AudioBuffer, targetPeak: number = 0.95): void {
  let maxAbs = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxAbs) maxAbs = abs;
    }
  }

  if (maxAbs === 0 || maxAbs >= targetPeak) return;

  const gain = targetPeak / maxAbs;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gain;
    }
  }
}

/** Apply a simple soft-clip limiter to an AudioBuffer (in-place) */
export function softClipLimiter(buffer: AudioBuffer, threshold: number = 0.9): void {
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const x = data[i];
      if (x > threshold) {
        data[i] = threshold + (1 - threshold) * Math.tanh((x - threshold) / (1 - threshold));
      } else if (x < -threshold) {
        data[i] = -threshold - (1 - threshold) * Math.tanh((-x - threshold) / (1 - threshold));
      }
    }
  }
}

// Musical scale utilities
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
