import type { Beatmap, BeatNote } from "../types";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

export class GameRenderer {
  private particles: Particle[] = [];
  private lastTime = performance.now();
  private pulse = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = this.canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(
    beatmap: Beatmap,
    now: number,
    pointer: { x: number; y: number },
    judged: ReadonlySet<number>,
    holding: (id: number) => boolean,
    intensity: number
  ): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const dt = Math.min(0.05, (performance.now() - this.lastTime) / 1000);
    this.lastTime = performance.now();

    this.pulse *= Math.pow(0.001, dt);
    const gradient = ctx.createRadialGradient(
      width * 0.55, height * 0.42, 10,
      width * 0.55, height * 0.42, Math.max(width, height) * 0.75
    );
    gradient.addColorStop(0, `rgba(31, 22, 72, ${0.9 + intensity * 0.1})`);
    gradient.addColorStop(0.5, "rgba(10, 11, 35, 1)");
    gradient.addColorStop(1, "rgba(3, 4, 14, 1)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    this.drawLightRibbons(ctx, width, height, now, intensity);
    this.drawParticles(ctx, dt, width, height, intensity);

    for (const note of beatmap.notes) {
      if (judged.has(note.id)) continue;

      const age = now - note.time;
      if (age < -1.4 || age > note.duration + 0.25) continue;

      this.drawNote(ctx, note, now, width, height, holding(note.id));
    }

    // Player reticle.
    ctx.save();
    ctx.translate(pointer.x, pointer.y);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 18;
    ctx.shadowColor = "rgba(74, 230, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(0, 0, 18 + this.pulse * 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(-26, 0); ctx.lineTo(-9, 0);
    ctx.moveTo(9, 0); ctx.lineTo(26, 0);
    ctx.moveTo(0, -26); ctx.lineTo(0, -9);
    ctx.moveTo(0, 9); ctx.lineTo(0, 26);
    ctx.stroke();
    ctx.restore();
  }

  burst(x: number, y: number, hue = 190, amount = 16): void {
    this.pulse = 1;
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 180;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.5,
        maxLife: 0.35 + Math.random() * 0.5,
        size: 1 + Math.random() * 4,
        hue
      });
    }
  }

  private drawLightRibbons(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    intensity: number
  ): void {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineWidth = 2 + intensity * 3;

    for (let lane = 0; lane < 5; lane++) {
      const baseY = height * (0.12 + lane * 0.2);
      ctx.beginPath();
      for (let x = -20; x <= width + 20; x += 24) {
        const y = baseY
          + Math.sin(x * 0.004 + time * (0.4 + intensity) + lane) * (20 + intensity * 24)
          + Math.sin(x * 0.011 - time * 0.25) * 10;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `hsla(${190 + lane * 28}, 100%, 68%, ${0.025 + intensity * 0.035})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, dt: number, width: number, height: number, intensity: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    if (intensity > 0.62 && Math.random() < intensity * 0.35) {
      this.particles.push({
        x: Math.random() * width,
        y: height + 5,
        vx: (Math.random() - 0.5) * 12,
        vy: -(25 + Math.random() * 70) * intensity,
        life: 0.8 + Math.random() * 1.2,
        maxLife: 0.8 + Math.random() * 1.2,
        size: 1 + Math.random() * 2.5,
        hue: 180 + Math.random() * 110
      });
    }

    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 10 * dt;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = `hsla(${p.hue}, 100%, 72%, ${alpha * 0.7})`;
      ctx.shadowBlur = 12;
      ctx.shadowColor = `hsla(${p.hue}, 100%, 65%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      return p.life > 0;
    });

    ctx.restore();
  }

  private drawNote(
    ctx: CanvasRenderingContext2D,
    note: BeatNote,
    now: number,
    width: number,
    height: number,
    isHolding: boolean
  ): void {
    const x = note.x * width;
    const y = note.y * height;
    const radius = note.radius;

    const approach = Math.max(0, Math.min(1, (now - note.time + 1.2) / 1.2));
    const ringRadius = radius + (1 - approach) * 74;
    const alpha = now < note.time ? 0.35 + approach * 0.65 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "lighter";

    if (note.kind === "hold") {
      const endX = x;
      const endY = y;
      ctx.strokeStyle = "rgba(160, 120, 255, 0.55)";
      ctx.lineWidth = 10;
      ctx.shadowBlur = 20;
      ctx.shadowColor = "rgba(170, 110, 255, 0.7)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }

    ctx.strokeStyle = note.accent ? "rgba(255, 85, 205, 0.95)" : "rgba(63, 226, 255, 0.95)";
    ctx.lineWidth = 3;
    ctx.shadowBlur = 24;
    ctx.shadowColor = note.accent ? "rgba(255, 55, 194, 0.9)" : "rgba(45, 215, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 30;
    ctx.fillStyle = note.accent ? "rgba(255, 76, 205, 0.88)" : "rgba(55, 221, 255, 0.82)";
    ctx.beginPath();
    ctx.arc(x, y, radius * (isHolding ? 1.12 : 1), 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(8, 8, 25, 0.9)";
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.47, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}
