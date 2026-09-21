import type { AudioAnalysis } from "../types";

export async function analyzeAudio(data: ArrayBuffer): Promise<AudioAnalysis> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(data.slice(0));
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const mono = new Float32Array(length);

    for (let channel = 0; channel < channels; channel++) {
      const samples = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) mono[i] += samples[i] / channels;
    }

    const worker = new Worker(new URL("../workers/audio.worker.ts", import.meta.url), { type: "module" });

    return await new Promise<AudioAnalysis>((resolve, reject) => {
      const cleanup = () => worker.terminate();
      worker.onmessage = (event: MessageEvent<AudioAnalysis>) => {
        cleanup();
        resolve(event.data);
      };
      worker.onerror = (event) => {
        cleanup();
        reject(new Error(event.message || "Audio analysis failed."));
      };
      worker.postMessage(
        { samples: mono, sampleRate: buffer.sampleRate },
        [mono.buffer]
      );
    });
  } finally {
    await context.close();
  }
}
