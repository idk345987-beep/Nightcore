export class AudioEngine {
  readonly element = new Audio();
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private objectUrl: string | null = null;

  constructor() {
    this.element.preload = "auto";
    this.element.crossOrigin = "anonymous";
  }

  load(data: ArrayBuffer, mime = "audio/mpeg"): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    const blob = new Blob([data], { type: mime });
    this.objectUrl = URL.createObjectURL(blob);
    this.element.src = this.objectUrl;
    this.element.load();
  }

  async ensureGraph(): Promise<void> {
    if (this.context) {
      if (this.context.state === "suspended") await this.context.resume();
      return;
    }

    this.context = new AudioContext();
    this.source = this.context.createMediaElementSource(this.element);
    this.gain = this.context.createGain();
    this.analyser = this.context.createAnalyser();

    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.55;
    this.gain.gain.value = 0.95;

    this.source.connect(this.gain);
    this.gain.connect(this.analyser);
    this.analyser.connect(this.context.destination);

    await this.context.resume();
  }

  async play(): Promise<void> {
    await this.ensureGraph();
    await this.element.play();
  }

  pause(): void {
    this.element.pause();
  }

  seek(seconds: number): void {
    this.element.currentTime = Math.max(0, Math.min(seconds, this.element.duration || seconds));
  }

  get time(): number {
    return this.element.currentTime || 0;
  }

  get duration(): number {
    return Number.isFinite(this.element.duration) ? this.element.duration : 0;
  }

  get ended(): boolean {
    return this.element.ended;
  }

  set volume(value: number) {
    if (this.gain) this.gain.gain.value = value;
    else this.element.volume = value;
  }

  getSpectrum(): Uint8Array | null {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  dispose(): void {
    this.element.pause();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.context?.close();
    this.context = null;
  }
}
