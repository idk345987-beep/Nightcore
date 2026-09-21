export type Difficulty = "Easy" | "Normal" | "Hard" | "Expert";
export type NoteKind = "tap" | "hold";

export interface AudioAnalysis {
  duration: number;
  sampleRate: number;
  bpm: number;
  beatTimes: number[];
  energy: number[];
  low: number[];
  mid: number[];
  high: number[];
  peaks: number[];
}

export interface SongRecord {
  id: string;
  name: string;
  fileName: string;
  artist: string;
  duration: number;
  bpm: number;
  objectUrl?: string;
  data?: ArrayBuffer;
  analysis?: AudioAnalysis;
  addedAt: number;
}

export interface BeatNote {
  id: number;
  time: number;
  x: number;
  y: number;
  kind: NoteKind;
  duration: number;
  radius: number;
  accent: boolean;
}

export interface Beatmap {
  difficulty: Difficulty;
  bpm: number;
  duration: number;
  notes: BeatNote[];
  seed: number;
}

export interface DifficultyProfile {
  subdivision: number;
  density: number;
  minGap: number;
  holdChance: number;
  movement: number;
  accentBoost: number;
}

export interface JudgementResult {
  label: "PERFECT" | "GREAT" | "GOOD" | "MISS";
  points: number;
  weight: number;
}

export interface GameStats {
  score: number;
  combo: number;
  maxCombo: number;
  accuracy: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  total: number;
}
