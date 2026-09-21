import type {
  AudioAnalysis,
  Beatmap,
  BeatNote,
  Difficulty,
  DifficultyProfile
} from "../types";

const profiles: Record<Difficulty, DifficultyProfile> = {
  Easy:   { subdivision: 1, density: 0.72, minGap: 0.34, holdChance: 0.08, movement: 0.42, accentBoost: 1.2 },
  Normal: { subdivision: 2, density: 0.88, minGap: 0.25, holdChance: 0.10, movement: 0.58, accentBoost: 1.3 },
  Hard:   { subdivision: 2, density: 1.06, minGap: 0.19, holdChance: 0.14, movement: 0.76, accentBoost: 1.45 },
  Expert: { subdivision: 4, density: 1.22, minGap: 0.13, holdChance: 0.18, movement: 0.94, accentBoost: 1.65 }
};

class PRNG {
  constructor(private state: number) {}
  next(): number {
    let x = this.state | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    return ((x >>> 0) / 4294967296);
  }
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sampleAt(values: number[], time: number, duration: number): number {
  if (!values.length || duration <= 0) return 0;
  const index = Math.max(0, Math.min(values.length - 1, Math.floor((time / duration) * values.length)));
  return values[index] ?? 0;
}

function choosePosition(prng: PRNG, previous: { x: number; y: number } | null, movement: number): { x: number; y: number } {
  const safe = 0.11;
  let x = safe + prng.next() * (1 - safe * 2);
  let y = safe + prng.next() * (1 - safe * 2);

  if (previous) {
    const maxDistance = 0.15 + movement * 0.56;
    const angle = prng.next() * Math.PI * 2;
    const distance = 0.16 + prng.next() * maxDistance;
    x = Math.max(safe, Math.min(1 - safe, previous.x + Math.cos(angle) * distance));
    y = Math.max(safe, Math.min(1 - safe, previous.y + Math.sin(angle) * distance));
  }
  return { x, y };
}

export function generateBeatmap(
  analysis: AudioAnalysis,
  difficulty: Difficulty,
  seedText: string
): Beatmap {
  const profile = profiles[difficulty];
  const seed = hashSeed(`${seedText}:${difficulty}:${analysis.bpm}`);
  const prng = new PRNG(seed);
  const beat = 60 / analysis.bpm;
  const step = beat / profile.subdivision;
  const notes: BeatNote[] = [];

  let previousPosition: { x: number; y: number } | null = null;
  let lastTime = -Infinity;
  let id = 0;

  for (let time = Math.max(0.5, step); time < analysis.duration - 0.4; time += step) {
    const energy = sampleAt(analysis.energy, time, analysis.duration);
    const low = sampleAt(analysis.low, time, analysis.duration);
    const mid = sampleAt(analysis.mid, time, analysis.duration);
    const high = sampleAt(analysis.high, time, analysis.duration);

    const isAccent = analysis.peaks.some((peak) => Math.abs(peak - time) < step * 0.45);
    const musicalWeight =
      (energy * 0.48 + low * 0.16 + mid * 0.24 + high * 0.12) *
      (isAccent ? profile.accentBoost : 1);

    const threshold = 0.29 + (1 - profile.density) * 0.14;
    const randomGate = 0.56 + prng.next() * 0.44;
    if (musicalWeight * randomGate < threshold) continue;
    if (time - lastTime < profile.minGap) continue;

    const position = choosePosition(prng, previousPosition, profile.movement);
    const hold = prng.next() < profile.holdChance && musicalWeight > 0.62;
    const duration = hold ? Math.min(beat * (1 + Math.floor(prng.next() * 2)), analysis.duration - time - 0.15) : 0;

    notes.push({
      id: id++,
      time,
      x: position.x,
      y: position.y,
      kind: hold ? "hold" : "tap",
      duration,
      radius: Math.max(22, 34 - profile.movement * 7),
      accent: isAccent || musicalWeight > 0.78
    });

    previousPosition = position;
    lastTime = time + (hold ? duration * 0.45 : 0);
  }

  // Guarantee a playable opening phrase if the source is unusually quiet.
  if (notes.length < 8 && analysis.duration > 4) {
    for (let i = 0; i < 8; i++) {
      const time = 1 + i * beat;
      if (time >= analysis.duration - 0.4) break;
      const position = choosePosition(prng, previousPosition, profile.movement);
      notes.push({
        id: id++,
        time,
        x: position.x,
        y: position.y,
        kind: "tap",
        duration: 0,
        radius: 30,
        accent: i % 4 === 0
      });
      previousPosition = position;
    }
    notes.sort((a, b) => a.time - b.time);
  }

  return {
    difficulty,
    bpm: analysis.bpm,
    duration: analysis.duration,
    notes,
    seed
  };
}

export { profiles };
