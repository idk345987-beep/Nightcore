# NightPulse

A local-first, open-source one-handed rhythm game built with TypeScript, Vite and the browser Canvas/Web Audio APIs.

NightPulse takes the broad idea of timing inputs to music and builds its own presentation and gameplay rules. It does **not** ship osu! assets, songs, maps, artwork or copied interface code.

## Features

- Local MP3 / WAV / OGG import.
- Audio stays in the browser; no upload server is used.
- Automatic BPM/onset/energy analysis.
- Deterministic beatmap generation from the analyzed song.
- Easy / Normal / Hard / Expert generation profiles.
- Mouse-only gameplay: move the cursor, click targets on time.
- Hold notes, normal notes, score, combo, accuracy and judgement feedback.
- Local high scores via `localStorage`.
- IndexedDB song library.
- Canvas rendering with lightweight particle effects.
- Audio-synced gameplay using `HTMLAudioElement.currentTime` and `requestAnimationFrame`, not `setInterval`.
- Static-hosting friendly Vite build.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite.

To make a production build:

```bash
npm run build
npm run preview
```

The `dist/` folder can be deployed to GitHub Pages or another static host.

## Architecture

```text
src/
├── audio/
│   ├── AudioEngine.ts
│   └── analyzer.ts
├── beatmap/
│   └── BeatmapGenerator.ts
├── gameplay/
│   └── GameSession.ts
├── rendering/
│   └── GameRenderer.ts
├── storage/
│   └── Library.ts
├── ui/
│   └── UI.ts
├── workers/
│   └── audio.worker.ts
├── main.ts
├── style.css
└── types.ts
```

### Why Canvas + Web APIs instead of a game framework?

The game has a small rendering surface and a single main gameplay scene. A custom Canvas renderer avoids a large runtime dependency while giving direct control over draw order, glow, particles and frame timing. TypeScript/Vite still provide a conventional modern web-game toolchain.

If the project grows into multiple complex scenes, sprite atlases, animations or multiplayer, Phaser/PixiJS can be introduced behind the same gameplay interfaces.

## Audio analysis

The MVP analyzer:

1. Decodes the selected file with Web Audio.
2. Converts it to mono.
3. Runs the CPU-heavy analysis in a Web Worker.
4. Estimates BPM using onset-energy autocorrelation.
5. Samples RMS intensity plus low/mid/high spectral energy.
6. Detects local peaks and musical accents.

It intentionally avoids pretending to be a full music-information-retrieval system. BPM detection can be imperfect for unusual time signatures, rubato, live recordings or songs with weak drums.

### Future analyzer upgrades

The `AudioAnalysis` interface is deliberately separate from the beatmap generator. A future implementation can add:

- better onset detection,
- beat tracking with tempo changes,
- downbeat/bar detection,
- chroma/key features,
- stem separation,
- ML/AI map generation.

No game code needs to know how those features are produced.

## Privacy

Imported audio is processed locally in the browser. NightPulse contains no analytics, upload endpoint or external audio-processing API.

## Credits

NightPulse is an original open-source project concept. The included visual style is an original neon/cyber aesthetic and does not include the uploaded reference image or third-party anime artwork.

MIT licensed.
