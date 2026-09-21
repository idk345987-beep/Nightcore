import type { AudioAnalysis } from "../types";

interface WorkerInput {
  samples: Float32Array;
  sampleRate: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function rms(samples: Float32Array, start: number, end: number): number {
  let sum = 0;
  const from = Math.max(0, start);
  const to = Math.min(samples.length, end);
  if (to <= from) return 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (to - from));
}

function bandEnergy(samples: Float32Array, start: number, size: number, sampleRate: number, lowHz: number, highHz: number): number {
  const n = Math.min(size, samples.length - start);
  if (n < 16) return 0;

  // A small DFT is enough for a visual/gameplay MVP and keeps the worker cheap.
  let energy = 0;
  const bins = 18;
  for (let k = 1; k <= bins; k++) {
    const frequency = (k / (bins + 1)) * (sampleRate / 2);
    if (frequency < lowHz || frequency >= highHz) continue;

    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i += 2) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, n - 1));
      const angle = (2 * Math.PI * k * i) / n;
      const sample = samples[start + i] * window;
      re += sample * Math.cos(angle);
      im -= sample * Math.sin(angle);
    }
    energy += Math.sqrt(re * re + im * im) / n;
  }
  return energy;
}

function normalize(values: number[]): number[] {
  const max = Math.max(...values, 1e-8);
  return values.map((v) => clamp01(v / max));
}

function estimateBpm(onsets: number[], frameRate: number): number {
  const minBpm = 70;
  const maxBpm = 190;
  let bestBpm = 120;
  let bestScore = -Infinity;

  for (let bpm = minBpm; bpm <= maxBpm; bpm += 1) {
    const lag = (60 * frameRate) / bpm;
    let score = 0;
    for (let i = Math.ceil(lag); i < onsets.length; i++) {
      const a = onsets[i];
      const b = onsets[Math.round(i - lag)];
      score += a * b;
    }
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }

  // Prefer conventional half/double-time values if the estimate drifts.
  if (bestBpm < 90) bestBpm *= 2;
  if (bestBpm > 180) bestBpm /= 2;
  return Math.round(bestBpm);
}

self.onmessage = (event: MessageEvent<WorkerInput>) => {
  const { samples, sampleRate } = event.data;
  const duration = samples.length / sampleRate;
  const frameSize = Math.max(512, Math.floor(sampleRate * 0.04644)); // ~21.5 fps
  const frameRate = sampleRate / frameSize;
  const frameCount = Math.max(1, Math.ceil(samples.length / frameSize));

  const energyRaw: number[] = [];
  const lowRaw: number[] = [];
  const midRaw: number[] = [];
  const highRaw: number[] = [];

  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * frameSize;
    energyRaw.push(rms(samples, start, start + frameSize));
    lowRaw.push(bandEnergy(samples, start, frameSize, sampleRate, 30, 180));
    midRaw.push(bandEnergy(samples, start, frameSize, sampleRate, 180, 1800));
    highRaw.push(bandEnergy(samples, start, frameSize, sampleRate, 1800, 8000));
  }

  const energy = normalize(energyRaw);
  const low = normalize(lowRaw);
  const mid = normalize(midRaw);
  const high = normalize(highRaw);

  const onsets = energy.map((value, i) => {
    const previous = energy[Math.max(0, i - 2)];
    return Math.max(0, value - previous);
  });

  const bpm = estimateBpm(onsets, frameRate);
  const beatLength = 60 / bpm;
  const beatTimes: number[] = [];
  for (let time = 0; time < duration; time += beatLength) beatTimes.push(time);

  const peaks: number[] = [];
  for (let i = 2; i < onsets.length - 2; i++) {
    if (
      onsets[i] > 0.12 &&
      onsets[i] >= onsets[i - 1] &&
      onsets[i] >= onsets[i + 1] &&
      onsets[i] >= onsets[i - 2] &&
      onsets[i] >= onsets[i + 2]
    ) {
      peaks.push(i / frameRate);
    }
  }

  const result: AudioAnalysis = {
    duration,
    sampleRate,
    bpm,
    beatTimes,
    energy,
    low,
    mid,
    high,
    peaks
  };

  (self as DedicatedWorkerGlobalScope).postMessage(result);
};
