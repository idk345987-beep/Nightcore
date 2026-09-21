import type { Beatmap, GameStats, JudgementResult } from "../types";

const WINDOWS = {
  perfect: 0.055,
  great: 0.105,
  good: 0.17
};

export class GameSession {
  readonly stats: GameStats = {
    score: 0,
    combo: 0,
    maxCombo: 0,
    accuracy: 100,
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    total: 0
  };

  private judged = new Set<number>();
  private holding = new Map<number, { startedAt: number }>();

  constructor(readonly beatmap: Beatmap) {}

  reset(): void {
    this.judged.clear();
    this.holding.clear();
    this.stats.score = 0;
    this.stats.combo = 0;
    this.stats.maxCombo = 0;
    this.stats.accuracy = 100;
    this.stats.perfect = 0;
    this.stats.great = 0;
    this.stats.good = 0;
    this.stats.miss = 0;
    this.stats.total = 0;
  }

  judgeClick(now: number, pointer: { x: number; y: number }, width: number, height: number): { noteId: number; result: JudgementResult } | null {
    let bestNote = null;
    let bestDistance = Infinity;

    for (const note of this.beatmap.notes) {
      if (this.judged.has(note.id)) continue;
      const delta = Math.abs(now - note.time);
      if (delta > WINDOWS.good) continue;

      const dx = pointer.x - note.x * width;
      const dy = pointer.y - note.y * height;
      const distance = Math.hypot(dx, dy);
      const hitRadius = note.radius * 1.55;

      if (distance > hitRadius) continue;
      if (delta < bestDistance) {
        bestDistance = delta;
        bestNote = note;
      }
    }

    if (!bestNote) return null;

    const delta = Math.abs(now - bestNote.time);
    const result = this.toJudgement(delta);
    this.judged.add(bestNote.id);
    this.apply(result);

    if (bestNote.kind === "hold" && result.label !== "MISS") {
      this.holding.set(bestNote.id, { startedAt: now });
    }

    return { noteId: bestNote.id, result };
  }

  update(now: number, pointer: { x: number; y: number }, width: number, height: number, mouseDown: boolean): JudgementResult[] {
    const results: JudgementResult[] = [];

    for (const note of this.beatmap.notes) {
      if (this.judged.has(note.id)) continue;
      if (now > note.time + WINDOWS.good) {
        this.judged.add(note.id);
        const result: JudgementResult = { label: "MISS", points: 0, weight: 0 };
        this.apply(result);
        results.push(result);
      }
    }

    for (const [noteId, state] of this.holding) {
      const note = this.beatmap.notes.find((candidate) => candidate.id === noteId);
      if (!note) continue;

      const dx = pointer.x - note.x * width;
      const dy = pointer.y - note.y * height;
      const inside = Math.hypot(dx, dy) <= note.radius * 1.7;

      if (!mouseDown || !inside) {
        this.holding.delete(noteId);
        const completed = Math.max(0, Math.min(1, (now - state.startedAt) / Math.max(0.001, note.duration)));
        if (completed < 0.8) {
          this.stats.combo = 0;
          this.stats.miss++;
        } else {
          this.stats.score += Math.round(150 * completed);
        }
      } else if (now >= note.time + note.duration) {
        this.holding.delete(noteId);
        this.stats.score += 150;
      }
    }

    return results;
  }

  get judgedIds(): ReadonlySet<number> {
    return this.judged;
  }

  isHolding(noteId: number): boolean {
    return this.holding.has(noteId);
  }

  private toJudgement(delta: number): JudgementResult {
    if (delta <= WINDOWS.perfect) return { label: "PERFECT", points: 1000, weight: 1 };
    if (delta <= WINDOWS.great) return { label: "GREAT", points: 700, weight: 0.8 };
    if (delta <= WINDOWS.good) return { label: "GOOD", points: 400, weight: 0.5 };
    return { label: "MISS", points: 0, weight: 0 };
  }

  private apply(result: JudgementResult): void {
    this.stats.total++;
    this.stats.score += result.points;

    switch (result.label) {
      case "PERFECT":
        this.stats.perfect++;
        this.stats.combo++;
        break;
      case "GREAT":
        this.stats.great++;
        this.stats.combo++;
        break;
      case "GOOD":
        this.stats.good++;
        this.stats.combo++;
        break;
      case "MISS":
        this.stats.miss++;
        this.stats.combo = 0;
        break;
    }

    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
    const weighted =
      this.stats.perfect * 1 +
      this.stats.great * 0.8 +
      this.stats.good * 0.5;

    this.stats.accuracy = this.stats.total > 0 ? (weighted / this.stats.total) * 100 : 100;
  }
}
