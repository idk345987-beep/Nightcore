import "./style.css";
import { analyzeAudio } from "./audio/analyzer";
import { AudioEngine } from "./audio/AudioEngine";
import { generateBeatmap } from "./beatmap/BeatmapGenerator";
import { GameSession } from "./gameplay/GameSession";
import { GameRenderer } from "./rendering/GameRenderer";
import { Library } from "./storage/Library";
import { UI, type Screen } from "./ui/UI";
import type { Difficulty, SongRecord } from "./types";

const root = document.querySelector<HTMLElement>("#screen-root")!;
const viewLabel = document.querySelector<HTMLElement>("#view-label")!;
const input = document.querySelector<HTMLInputElement>("#song-input")!;
const gameShell = document.querySelector<HTMLElement>("#game-shell")!;
const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
const pauseOverlay = document.querySelector<HTMLElement>("#pause-overlay")!;
const judgement = document.querySelector<HTMLElement>("#judgement")!;
const pauseButton = document.querySelector<HTMLButtonElement>("#game-pause")!;
const resumeButton = document.querySelector<HTMLButtonElement>("#resume-button")!;
const restartButton = document.querySelector<HTMLButtonElement>("#restart-button")!;
const quitButton = document.querySelector<HTMLButtonElement>("#quit-button")!;
const hudScore = document.querySelector<HTMLElement>("#hud-score")!;
const hudAccuracy = document.querySelector<HTMLElement>("#hud-accuracy")!;
const hudCombo = document.querySelector<HTMLElement>("#hud-combo")!;

const ui = new UI(root, viewLabel, input);
const library = new Library();
const audio = new AudioEngine();
const renderer = new GameRenderer(canvas);

let songs: SongRecord[] = [];
let currentScreen: Screen = "home";
let difficulty: Difficulty = "Normal";
let currentSong: SongRecord | null = null;
let currentMap = null as ReturnType<typeof generateBeatmap> | null;
let session: GameSession | null = null;
let playing = false;
let pointer = { x: innerWidth / 2, y: innerHeight / 2 };
let mouseDown = false;
let lastHudUpdate = 0;
let raf = 0;

async function boot(): Promise<void> {
  songs = await library.all();
  showHome();

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    await importSong(file);
  });

  pauseButton.addEventListener("click", pauseGame);
  resumeButton.addEventListener("click", resumeGame);
  restartButton.addEventListener("click", () => {
    if (currentSong) startGame(currentSong, difficulty);
  });
  quitButton.addEventListener("click", quitGame);

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    mouseDown = true;
    tryHit();
  });
  window.addEventListener("pointerup", () => { mouseDown = false; });

  window.addEventListener("resize", () => renderer.resize());
  renderer.resize();
}

function renderScreen(screen: Screen): void {
  currentScreen = screen;
  ui.showScreen(screen, songs, difficulty, {
    navigate: (next) => renderScreen(next),
    importSong: () => ui.triggerImport(),
    selectSong: (song, selectedDifficulty) => startGame(song, selectedDifficulty),
    deleteSong: async (song) => {
      await library.remove(song.id);
      songs = songs.filter((candidate) => candidate.id !== song.id);
      ui.toast("Song removed from the local library.");
      renderScreen("songs");
    },
    difficulty: (next) => {
      difficulty = next;
      renderScreen("songs");
    }
  });
}

function showHome(): void {
  renderScreen("home");
}

async function importSong(file: File): Promise<void> {
  if (!/^audio\/(mpeg|wav|ogg|oga|webm|mp4)/i.test(file.type) && !/\.(mp3|wav|ogg)$/i.test(file.name)) {
    ui.toast("Please choose an MP3, WAV or OGG audio file.");
    return;
  }

  ui.toast("Decoding and analyzing locally…");
  try {
    const data = await file.arrayBuffer();
    const analysis = await analyzeAudio(data);
    const id = await sha256(data);
    const baseName = file.name.replace(/\.[^.]+$/, "");

    const song: SongRecord = {
      id,
      name: baseName || "Untitled",
      fileName: file.name,
      artist: "",
      duration: analysis.duration,
      bpm: analysis.bpm,
      data,
      analysis,
      addedAt: Date.now()
    };

    await library.put(song);
    songs = await library.all();
    ui.toast(`Imported locally — ${analysis.bpm} BPM detected.`);
    renderScreen("songs");
  } catch (error) {
    console.error(error);
    ui.toast("Could not decode this audio file in the browser.");
  }
}

async function startGame(song: SongRecord, selectedDifficulty: Difficulty): Promise<void> {
  const fullSong = song.data ? song : await library.get(song.id);
  if (!fullSong?.data) {
    ui.toast("The local audio data is missing. Re-import the song.");
    return;
  }

  if (!fullSong.analysis) {
    ui.toast("Re-analyzing song…");
    fullSong.analysis = await analyzeAudio(fullSong.data);
    await library.put(fullSong);
  }

  currentSong = fullSong;
  difficulty = selectedDifficulty;
  currentMap = generateBeatmap(fullSong.analysis, selectedDifficulty, fullSong.id);
  session = new GameSession(currentMap);
  session.reset();

  gameShell.classList.remove("hidden");
  pauseOverlay.classList.add("hidden");
  audio.load(fullSong.data, guessMime(fullSong.fileName));
  audio.volume = Number(localStorage.getItem("np-volume") ?? "90") / 100;
  await audio.play();

  playing = true;
  pointer = { x: innerWidth / 2, y: innerHeight / 2 };
  renderer.resize();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(gameLoop);
}

function gameLoop(): void {
  if (!playing || !currentMap || !session) return;

  const now = audio.time;
  const analysis = currentSong?.analysis;
  const intensity = analysis ? sampleIntensity(analysis.energy, now, analysis.duration) : 0.5;

  session.update(now, pointer, canvas.clientWidth, canvas.clientHeight, mouseDown);
  renderer.render(currentMap, now, pointer, session.judgedIds, (id) => session!.isHolding(id), intensity);

  if (performance.now() - lastHudUpdate > 100) {
    hudScore.textContent = Math.round(session.stats.score).toLocaleString();
    hudAccuracy.textContent = `${session.stats.accuracy.toFixed(2)}%`;
    hudCombo.textContent = String(session.stats.combo);
    lastHudUpdate = performance.now();
  }

  if (audio.ended || now >= currentMap.duration - 0.05) {
    finishGame();
    return;
  }

  raf = requestAnimationFrame(gameLoop);
}

function tryHit(): void {
  if (!playing || !session || !currentMap) return;
  const result = session.judgeClick(audio.time, pointer, canvas.clientWidth, canvas.clientHeight);
  if (!result) return;

  const note = currentMap.notes.find((candidate) => candidate.id === result.noteId);
  renderer.burst(note ? note.x * canvas.clientWidth : pointer.x, note ? note.y * canvas.clientHeight : pointer.y, result.result.label === "PERFECT" ? 185 : 315, result.result.label === "PERFECT" ? 24 : 14);
  showJudgement(result.result.label);
}

function showJudgement(label: string): void {
  judgement.textContent = label;
  judgement.classList.remove("show");
  void judgement.offsetWidth;
  judgement.classList.add("show");
  if (label === "MISS") judgement.style.color = "#ff557e";
  else if (label === "PERFECT") judgement.style.color = "#57f4ff";
  else judgement.style.color = "#ff6bd3";
}

function pauseGame(): void {
  if (!playing) return;
  playing = false;
  audio.pause();
  pauseOverlay.classList.remove("hidden");
}

async function resumeGame(): Promise<void> {
  if (!currentSong) return;
  await audio.play();
  pauseOverlay.classList.add("hidden");
  playing = true;
  raf = requestAnimationFrame(gameLoop);
}

function finishGame(): void {
  playing = false;
  audio.pause();
  const stats = session?.stats;
  if (currentSong && stats) {
    localStorage.setItem(
      `np-score:${currentSong.id}:${difficulty}`,
      JSON.stringify({ score: stats.score, accuracy: stats.accuracy })
    );
  }
  pauseOverlay.classList.remove("hidden");
  const title = document.querySelector<HTMLElement>("#pause-title");
  if (title && stats) {
    title.innerHTML = `RESULT<br><small style="font-size:15px;color:#8e91aa">${stats.score.toLocaleString()} SCORE · ${stats.accuracy.toFixed(2)}% ACC · ${stats.maxCombo} MAX COMBO</small>`;
  }
}

function quitGame(): void {
  playing = false;
  audio.pause();
  gameShell.classList.add("hidden");
  pauseOverlay.classList.add("hidden");
  currentMap = null;
  session = null;
  renderScreen("songs");
}

function sampleIntensity(values: number[], time: number, duration: number): number {
  if (!values.length || duration <= 0) return 0.4;
  const index = Math.max(0, Math.min(values.length - 1, Math.floor((time / duration) * values.length)));
  return values[index] ?? 0.4;
}

function guessMime(name: string): string {
  if (/\.wav$/i.test(name)) return "audio/wav";
  if (/\.ogg$/i.test(name)) return "audio/ogg";
  return "audio/mpeg";
}

async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

void boot();
