/**
 * Tiny WAV (PCM 16-bit) encoder — Float32Array channels → ArrayBuffer.
 * Used after the master pass to hand a finished file back to the user.
 *
 * No deps. Browser-safe.
 */

export function encodeWav16(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numCh = channels.length;
  const numFrames = channels[0]?.length ?? 0;
  const blockAlign = numCh * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);
  let p = 0;

  // RIFF chunk
  writeAscii(view, p, "RIFF"); p += 4;
  view.setUint32(p, 36 + dataSize, true); p += 4;
  writeAscii(view, p, "WAVE"); p += 4;

  // fmt subchunk
  writeAscii(view, p, "fmt "); p += 4;
  view.setUint32(p, 16, true); p += 4;          // subchunk size
  view.setUint16(p, 1, true); p += 2;           // PCM format
  view.setUint16(p, numCh, true); p += 2;
  view.setUint32(p, sampleRate, true); p += 4;
  view.setUint32(p, byteRate, true); p += 4;
  view.setUint16(p, blockAlign, true); p += 2;
  view.setUint16(p, 16, true); p += 2;          // bits per sample

  // data subchunk
  writeAscii(view, p, "data"); p += 4;
  view.setUint32(p, dataSize, true); p += 4;

  // Interleaved 16-bit signed samples
  for (let n = 0; n < numFrames; n++) {
    for (let c = 0; c < numCh; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][n]));
      const i16 = v < 0 ? v * 0x8000 : v * 0x7fff;
      view.setInt16(p, i16, true);
      p += 2;
    }
  }
  return buffer;
}

function writeAscii(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}
