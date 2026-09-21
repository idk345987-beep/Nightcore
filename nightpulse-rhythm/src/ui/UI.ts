import type { Difficulty, SongRecord } from "../types";

export type Screen = "home" | "songs" | "settings" | "credits";

export class UI {
  constructor(
    private readonly root: HTMLElement,
    private readonly viewLabel: HTMLElement,
    private readonly input: HTMLInputElement
  ) {}

  showScreen(screen: Screen, songs: SongRecord[], selectedDifficulty: Difficulty, on: {
    navigate: (screen: Screen) => void;
    importSong: () => void;
    selectSong: (song: SongRecord, difficulty: Difficulty) => void;
    deleteSong: (song: SongRecord) => void;
    difficulty: (difficulty: Difficulty) => void;
  }): void {
    this.viewLabel.textContent = screen.toUpperCase();
    this.root.innerHTML = "";

    if (screen === "home") {
      this.root.innerHTML = `
        <section class="hero">
          <div class="hero-copy">
            <p class="eyebrow">LOCAL-FIRST RHYTHM GAME</p>
            <h1>CHASE THE<br><span>NEON BEAT.</span></h1>
            <p class="hero-text">Import your own music. Let NightPulse shape it into a playable one-handed rhythm map.</p>
            <div class="button-row">
              <button class="primary" data-action="songs">PLAY</button>
              <button class="secondary" data-action="import">IMPORT SONG</button>
            </div>
            <div class="feature-line"><span>01</span> AUDIO ANALYSIS <span>02</span> AUTO-MAPPING <span>03</span> MOUSE ONLY</div>
          </div>
          <div class="hero-visual" aria-hidden="true">
            <div class="orbit orbit-a"></div>
            <div class="orbit orbit-b"></div>
            <div class="core">✦</div>
            <div class="visual-title">NIGHT<br>PULSE</div>
          </div>
        </section>
        <section class="quick-grid">
          <button class="quick-card" data-action="songs"><strong>${songs.length}</strong><span>LOCAL SONGS</span></button>
          <button class="quick-card" data-action="settings"><strong>4</strong><span>DIFFICULTIES</span></button>
          <button class="quick-card" data-action="credits"><strong>0</strong><span>UPLOADS</span></button>
        </section>
      `;
    }

    if (screen === "songs") {
      const cards = songs.length
        ? songs.map((song) => this.songCard(song, selectedDifficulty)).join("")
        : `<div class="empty-state"><div class="empty-icon">♪</div><h2>No songs yet</h2><p>Import an MP3, WAV or OGG file. Analysis happens locally.</p><button class="primary" data-action="import">IMPORT SONG</button></div>`;

      this.root.innerHTML = `
        <section class="section-head">
          <div><p class="eyebrow">LIBRARY</p><h1>SONG SELECT</h1></div>
          <button class="secondary" data-action="import">+ IMPORT</button>
        </section>
        <div class="difficulty-bar">
          ${(["Easy","Normal","Hard","Expert"] as Difficulty[]).map((d) =>
            `<button class="${d === selectedDifficulty ? "difficulty active" : "difficulty"}" data-difficulty="${d}">${d}</button>`
          ).join("")}
        </div>
        <section class="song-grid">${cards}</section>
      `;
    }

    if (screen === "settings") {
      this.root.innerHTML = `
        <section class="narrow-page">
          <p class="eyebrow">SYSTEM</p>
          <h1>SETTINGS</h1>
          <div class="panel settings-panel">
            <label class="setting"><span>Master volume</span><input id="volume-range" type="range" min="0" max="100" value="${localStorage.getItem("np-volume") ?? "90"}"></label>
            <label class="setting"><span>Reduce visual effects</span><input id="reduced-effects" type="checkbox" ${localStorage.getItem("np-reduced") === "1" ? "checked" : ""}></label>
            <div class="setting-note">Audio analysis and imported songs remain local to this browser.</div>
          </div>
        </section>
      `;
      this.root.querySelector<HTMLInputElement>("#volume-range")?.addEventListener("input", (event) => {
        localStorage.setItem("np-volume", String((event.target as HTMLInputElement).value));
      });
      this.root.querySelector<HTMLInputElement>("#reduced-effects")?.addEventListener("change", (event) => {
        localStorage.setItem("np-reduced", (event.target as HTMLInputElement).checked ? "1" : "0");
      });
    }

    if (screen === "credits") {
      this.root.innerHTML = `
        <section class="narrow-page">
          <p class="eyebrow">ABOUT</p>
          <h1>CREDITS</h1>
          <div class="panel credits-panel">
            <h2>NightPulse</h2>
            <p>An original local-first rhythm-game prototype built with TypeScript, Vite, Canvas and Web Audio.</p>
            <p>No third-party songs, anime artwork, osu! assets or copied game code are included.</p>
            <div class="credit-line"><span>ENGINE</span><strong>Canvas + Web Audio</strong></div>
            <div class="credit-line"><span>BUILD</span><strong>Vite + TypeScript</strong></div>
            <div class="credit-line"><span>LICENSE</span><strong>MIT</strong></div>
          </div>
        </section>
      `;
    }

    this.root.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
      element.addEventListener("click", () => {
        const action = element.dataset.action;
        if (action === "songs") on.navigate("songs");
        if (action === "import") on.importSong();
        if (action === "settings") on.navigate("settings");
        if (action === "credits") on.navigate("credits");
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-difficulty]").forEach((element) => {
      element.addEventListener("click", () => on.difficulty(element.dataset.difficulty as Difficulty));
    });

    this.root.querySelectorAll<HTMLElement>("[data-song-id]").forEach((element) => {
      element.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        const song = songs.find((candidate) => candidate.id === element.dataset.songId);
        if (!song) return;
        if (target.closest("[data-delete]")) {
          on.deleteSong(song);
          return;
        }
        on.selectSong(song, selectedDifficulty);
      });
    });
  }

  triggerImport(): void {
    this.input.click();
  }

  toast(message: string): void {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    document.getElementById("toast-root")?.appendChild(node);
    window.setTimeout(() => node.remove(), 3200);
  }

  private songCard(song: SongRecord, difficulty: Difficulty): string {
    const best = JSON.parse(localStorage.getItem(`np-score:${song.id}:${difficulty}`) ?? "null") as { score: number; accuracy: number } | null;
    const hue = (song.bpm * 3) % 360;
    return `
      <article class="song-card" data-song-id="${song.id}" style="--card-hue:${hue}">
        <div class="cover">
          <div class="cover-grid"></div>
          <div class="cover-bpm">${song.bpm || "—"} BPM</div>
          <div class="cover-title">${escapeHtml(song.name).slice(0, 22)}</div>
          <div class="cover-symbol">✦</div>
        </div>
        <div class="song-info">
          <div><h3>${escapeHtml(song.name)}</h3><p>${escapeHtml(song.artist || song.fileName)}</p></div>
          <button class="delete-song" data-delete title="Remove from library">×</button>
        </div>
        <div class="song-meta"><span>${formatTime(song.duration)}</span><span>${difficulty}</span><span>${best ? `${best.accuracy.toFixed(1)}%` : "NEW"}</span></div>
      </article>
    `;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char] ?? char));
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
