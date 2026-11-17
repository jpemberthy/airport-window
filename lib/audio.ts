// An original 16-bar composition, rendered once so the loop remains steady
// when the browser throttles timers in a background tab.
const BPM = 78,
  BEAT = 60 / BPM,
  BARS = 16,
  DURATION = BARS * 4 * BEAT;
let bufferPromise: Promise<AudioBuffer> | null = null;
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
function renderComposition(): Promise<AudioBuffer> {
  const rate = 32_000,
    context = new OfflineAudioContext(
      2,
      Math.ceil((DURATION + 4) * rate),
      rate,
    );
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.ratio.value = 3;
  compressor.connect(context.destination);
  const master = context.createGain();
  master.gain.value = 0.55;
  master.connect(compressor);
  const delay = context.createDelay(2);
  delay.delayTime.value = BEAT * 0.75;
  const feedback = context.createGain();
  feedback.gain.value = 0.2;
  const damp = context.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2400;
  delay.connect(damp);
  damp.connect(feedback);
  feedback.connect(delay);
  const wet = context.createGain();
  wet.gain.value = 0.2;
  damp.connect(wet);
  wet.connect(master);
  let seed = 8341;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const noise = context.createBuffer(1, rate, rate),
    samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;
  function tone(
    midi: number,
    time: number,
    length: number,
    volume: number,
    type: OscillatorType = 'sine',
    pan = 0,
  ) {
    const osc = context.createOscillator(),
      gain = context.createGain(),
      panner = context.createStereoPanner();
    osc.type = type;
    osc.frequency.value = frequency(midi);
    panner.pan.value = pan;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.025);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.001, volume * 0.42),
      time + Math.min(0.5, length * 0.6),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(master);
    if (type === 'sine') panner.connect(delay);
    osc.start(time);
    osc.stop(time + length + 0.02);
  }
  function percussion(time: number, kind: 'kick' | 'snare' | 'hat', v: number) {
    const gain = context.createGain();
    gain.connect(master);
    if (kind === 'kick') {
      const osc = context.createOscillator();
      osc.frequency.setValueAtTime(115, time);
      osc.frequency.exponentialRampToValueAtTime(44, time + 0.16);
      gain.gain.setValueAtTime(v, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + 0.25);
      return;
    }
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = kind === 'hat' ? 'highpass' : 'bandpass';
    filter.frequency.value = kind === 'hat' ? 5500 : 1900;
    filter.Q.value = 0.65;
    source.connect(filter);
    filter.connect(gain);
    gain.gain.setValueAtTime(v, time);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      time + (kind === 'hat' ? 0.055 : 0.14),
    );
    source.start(time);
    source.stop(time + 0.16);
  }
  const chords = [
    [50, 57, 61, 64, 69],
    [47, 54, 57, 61, 66],
    [43, 50, 54, 57, 62],
    [45, 52, 55, 59, 64],
  ];
  for (let bar = 0; bar < BARS; bar++) {
    const time = bar * 4 * BEAT,
      chord = chords[Math.floor(bar / 2) % 4];
    chord.slice(1).forEach((note, i) => {
      tone(note, time + 0.012 * i, BEAT * 3.9, 0.038, 'sine', (i - 1.5) * 0.25);
      tone(
        note + 12,
        time + 0.015 * i,
        BEAT * 2.4,
        0.006,
        'sine',
        (1.5 - i) * 0.2,
      );
    });
    for (const beat of [0, 1.75, 2.5])
      tone(chord[0] - 12, time + beat * BEAT, BEAT * 0.85, 0.1, 'triangle');
    percussion(time, 'kick', 0.29);
    percussion(time + 2.5 * BEAT, 'kick', 0.19);
    percussion(time + BEAT, 'snare', 0.095);
    percussion(time + 3 * BEAT, 'snare', 0.08);
    for (let h = 0; h < 8; h++)
      percussion(
        time + (h * 0.5 + (h % 2 ? 0.055 : 0)) * BEAT,
        'hat',
        h % 2 ? 0.016 : 0.023,
      );
    if (bar % 2 === 1) {
      for (let i = 0; i < 3; i++)
        tone(
          chord[4 - i] + 12,
          time + (1.5 + i * 0.75) * BEAT,
          BEAT * 1.4,
          0.025,
          'sine',
          i % 2 ? 0.25 : -0.2,
        );
    }
  }
  return context.startRendering().then((rendered) => {
    const length = Math.round(DURATION * rate),
      loop = context.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = rendered.getChannelData(channel),
        target = loop.getChannelData(channel);
      target.set(data.subarray(0, length));
      for (let i = length; i < data.length; i++) target[i - length] += data[i];
    }
    return loop;
  });
}
export class HarborAudio {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private request = 0;
  private disposed = false;
  async play(volume: number, muted: boolean) {
    const token = ++this.request;
    if (this.disposed) throw new Error('Audio has closed');
    this.context ??= new AudioContext();
    await this.context.resume();
    if (!this.output) {
      this.output = this.context.createGain();
      this.output.connect(this.context.destination);
    }
    this.volume(volume, muted);
    bufferPromise ??= renderComposition().catch((error) => {
      bufferPromise = null;
      throw error;
    });
    const buffer = await bufferPromise;
    if (this.disposed || token !== this.request) return false;
    this.source?.stop();
    this.source?.disconnect();
    this.source = this.context.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.source.connect(this.output);
    this.source.start();
    return this.context.state === 'running';
  }
  pause() {
    this.request++;
    this.source?.stop();
    this.source?.disconnect();
    this.source = null;
  }
  volume(value: number, muted: boolean) {
    if (this.context && this.output)
      this.output.gain.setTargetAtTime(
        muted ? 0 : Math.max(0, Math.min(1, value)),
        this.context.currentTime,
        0.04,
      );
  }
  close() {
    this.disposed = true;
    this.pause();
    void this.context?.close();
  }
}
