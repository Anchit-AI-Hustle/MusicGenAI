/**
 * Transition Engine
 * Renders audio transitions between song sections: risers, sweeps, fills, impacts.
 */

export type TransitionType = 'riser' | 'fill' | 'reverse_cymbal' | 'filter_sweep' | 'silence' | 'crash';

/**
 * Render a riser (ascending noise sweep) into the audio context.
 */
export function renderRiser(
  ctx: OfflineAudioContext, destination: AudioNode,
  startTime: number, duration: number, velocity: number
): void {
  const bufSize = Math.ceil(ctx.sampleRate * duration);
  const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
  
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(200, startTime);
  filter.frequency.exponentialRampToValueAtTime(8000, startTime + duration);
  filter.Q.value = 2;
  
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(velocity * 0.35, startTime + duration * 0.9);
  gain.gain.linearRampToValueAtTime(0.001, startTime + duration);
  
  src.connect(filter).connect(gain).connect(destination);
  src.start(startTime);
  src.stop(startTime + duration + 0.01);
}

/**
 * Render a crash cymbal.
 */
export function renderCrash(
  ctx: OfflineAudioContext, destination: AudioNode,
  time: number, velocity: number
): void {
  const duration = 1.5;
  const bufSize = Math.ceil(ctx.sampleRate * duration);
  const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
  
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 5000;
  
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 0.4, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  
  src.connect(filter).connect(gain).connect(destination);
  src.start(time);
  src.stop(time + duration + 0.01);
}

/**
 * Render a reverse cymbal (builds up to a point).
 */
export function renderReverseCymbal(
  ctx: OfflineAudioContext, destination: AudioNode,
  startTime: number, duration: number, velocity: number
): void {
  const bufSize = Math.ceil(ctx.sampleRate * duration);
  const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  // Reverse envelope in the buffer itself
  for (let i = 0; i < bufSize; i++) {
    const env = (i / bufSize); // ramp up
    data[i] = (Math.random() * 2 - 1) * env;
  }
  
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(2000, startTime);
  filter.frequency.linearRampToValueAtTime(6000, startTime + duration);
  
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(velocity * 0.3, startTime + duration);
  
  src.connect(filter).connect(gain).connect(destination);
  src.start(startTime);
  src.stop(startTime + duration + 0.01);
}

/**
 * Render a filter sweep (low-pass opening).
 */
export function renderFilterSweep(
  ctx: OfflineAudioContext, destination: AudioNode,
  startTime: number, duration: number, velocity: number
): void {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 100;
  
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(200, startTime);
  filter.frequency.exponentialRampToValueAtTime(4000, startTime + duration);
  filter.Q.value = 8;
  
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(velocity * 0.2, startTime + duration * 0.5);
  gain.gain.linearRampToValueAtTime(0.001, startTime + duration);
  
  osc.connect(filter).connect(gain).connect(destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

/**
 * Render a transition between sections.
 */
export function renderTransition(
  ctx: OfflineAudioContext, destination: AudioNode,
  type: TransitionType, time: number, duration: number, energy: number
): void {
  const transitionDur = Math.min(duration, 2); // max 2 seconds
  const startTime = Math.max(0, time - transitionDur);
  
  switch (type) {
    case 'riser':
      renderRiser(ctx, destination, startTime, transitionDur, energy);
      break;
    case 'crash':
      renderCrash(ctx, destination, time, energy);
      break;
    case 'reverse_cymbal':
      renderReverseCymbal(ctx, destination, startTime, transitionDur, energy);
      break;
    case 'filter_sweep':
      renderFilterSweep(ctx, destination, startTime, transitionDur, energy);
      break;
    case 'fill':
      // Fills are handled by the drum engine
      break;
    case 'silence':
      // Brief silence is inherent
      break;
  }
}
