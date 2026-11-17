import type { AtmosphereProfile } from './atmosphere';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const MASTER_VOLUME_SCALE = 0.52;
export const MAX_AIRCRAFT_PASS_GAIN = 0.09;
export type SoundPerspective = 'story' | 'harbor';
export const perspectiveMix = (perspective: SoundPerspective) =>
  perspective === 'harbor' ? { bed: 0.8, pass: 0.7 } : { bed: 1, pass: 1 };

export interface AmbienceActivity {
  nearbyAircraft: number;
  fresh: boolean;
}

export interface AmbienceRuntime {
  createContext: () => AudioContext;
  random: () => number;
  setTimer: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}

const defaultRuntime: AmbienceRuntime = {
  createContext: () => new AudioContext(),
  random: Math.random,
  setTimer: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimer: (timer) => globalThis.clearTimeout(timer),
};

const passDelayRange = ({ nearbyAircraft, fresh }: AmbienceActivity) => {
  const count = fresh ? Math.max(0, Math.floor(nearbyAircraft)) : 0;
  if (count <= 2) return [150_000, 300_000] as const;
  if (count <= 8) return [90_000, 210_000] as const;
  return [60_000, 150_000] as const;
};

export function aircraftPassDelayMs(
  activity: AmbienceActivity,
  profile: AtmosphereProfile,
  random: () => number = Math.random,
) {
  const [minimum, maximum] = passDelayRange(activity);
  const scale = profile.sound.aircraftPassIntervalScale;
  const fraction = clamp(random(), 0, 1);
  return Math.round((minimum + (maximum - minimum) * fraction) * scale);
}

interface ActivePass {
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
}

/** Browser-generated weather and airport atmosphere. */
export class WeatherAmbience {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedPerspective: GainNode | null = null;
  private passPerspective: GainNode | null = null;
  private perspective: SoundPerspective = 'story';
  private sources: AudioBufferSourceNode[] = [];
  private windLow: BiquadFilterNode | null = null;
  private windHigh: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private rainLow: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private snowGain: GainNode | null = null;
  private stormGain: GainNode | null = null;
  private gust: OscillatorNode | null = null;
  private gustGain: GainNode | null = null;
  private drift: OscillatorNode | null = null;
  private driftGain: GainNode | null = null;
  private airportLow: BiquadFilterNode | null = null;
  private airportGain: GainNode | null = null;
  private airportPulse: OscillatorNode | null = null;
  private airportPulseGain: GainNode | null = null;
  private airportDrift: OscillatorNode | null = null;
  private airportDriftGain: GainNode | null = null;
  private passBuffer: AudioBuffer | null = null;
  private passTimer: ReturnType<typeof setTimeout> | null = null;
  private activePasses = new Set<ActivePass>();
  private profile: AtmosphereProfile | null = null;
  private activity: AmbienceActivity = { nearbyAircraft: 0, fresh: false };
  private wantsPlayback = false;
  private pageVisible = true;
  private playbackTransition: Promise<void> = Promise.resolve();

  constructor(private runtime: AmbienceRuntime = defaultRuntime) {}

  async play(
    profile: AtmosphereProfile,
    volume: number,
    activity: AmbienceActivity,
  ) {
    this.profile = profile;
    this.setActivity(activity);
    this.wantsPlayback = true;
    if (!this.context) this.create();
    this.setVolume(volume);
    try {
      await this.syncPlayback();
    } catch (error) {
      this.wantsPlayback = false;
      this.clearPassTimer();
      throw error;
    }
  }

  private create() {
    const context = this.runtime.createContext();
    this.context = context;
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    this.master = master;
    const mix = perspectiveMix(this.perspective);
    this.bedPerspective = context.createGain();
    this.bedPerspective.gain.value = mix.bed;
    this.bedPerspective.connect(master);
    this.passPerspective = context.createGain();
    this.passPerspective.gain.value = mix.pass;
    this.passPerspective.connect(master);

    const noiseBuffer = (
      seconds: number,
      seedStart: number,
      texture = false,
    ) => {
      const buffer = context.createBuffer(
        1,
        Math.round(context.sampleRate * seconds),
        context.sampleRate,
      );
      const samples = buffer.getChannelData(0);
      let seed = seedStart;
      let patter = 0;
      for (let index = 0; index < samples.length; index++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const random = seed / 4294967296;
        if (texture && random > 0.9996) patter = 0.45 + random * 0.3;
        patter *= 0.982;
        samples[index] = (random * 2 - 1) * (texture ? 0.29 + patter : 0.38);
      }
      const seamLength = Math.min(2048, Math.floor(samples.length / 4));
      for (let index = 0; index < seamLength; index++) {
        const blend = index / seamLength;
        const tail = samples.length - seamLength + index;
        samples[tail] = samples[tail] * (1 - blend) + samples[index] * blend;
      }
      return buffer;
    };

    const loopingNoise = (seconds: number, seed: number, texture = false) => {
      const source = context.createBufferSource();
      source.buffer = noiseBuffer(seconds, seed, texture);
      source.loop = true;
      source.start();
      this.sources.push(source);
      return source;
    };

    const windSource = loopingNoise(7, 5317);
    const windHigh = context.createBiquadFilter();
    windHigh.type = 'highpass';
    windHigh.frequency.value = 60;
    const windLow = context.createBiquadFilter();
    windLow.type = 'lowpass';
    windLow.frequency.value = 600;
    const windGain = context.createGain();
    windGain.gain.value = 0;
    windSource.connect(windHigh);
    windHigh.connect(windLow);
    windLow.connect(windGain);
    windGain.connect(master);
    this.windHigh = windHigh;
    this.windLow = windLow;
    this.windGain = windGain;

    const rainSource = loopingNoise(11, 8249, true);
    const rainHigh = context.createBiquadFilter();
    rainHigh.type = 'highpass';
    rainHigh.frequency.value = 1200;
    const rainLow = context.createBiquadFilter();
    rainLow.type = 'lowpass';
    rainLow.frequency.value = 6000;
    const rainGain = context.createGain();
    rainGain.gain.value = 0;
    rainSource.connect(rainHigh);
    rainHigh.connect(rainLow);
    rainLow.connect(rainGain);
    rainGain.connect(master);
    this.rainLow = rainLow;
    this.rainGain = rainGain;

    const snowSource = loopingNoise(17, 12371);
    const snowHigh = context.createBiquadFilter();
    snowHigh.type = 'highpass';
    snowHigh.frequency.value = 90;
    const snowLow = context.createBiquadFilter();
    snowLow.type = 'lowpass';
    snowLow.frequency.value = 1350;
    const snowGain = context.createGain();
    snowGain.gain.value = 0;
    snowSource.connect(snowHigh);
    snowHigh.connect(snowLow);
    snowLow.connect(snowGain);
    snowGain.connect(master);
    this.snowGain = snowGain;

    const stormSource = loopingNoise(13, 3923);
    const stormLow = context.createBiquadFilter();
    stormLow.type = 'lowpass';
    stormLow.frequency.value = 105;
    const stormGain = context.createGain();
    stormGain.gain.value = 0;
    stormSource.connect(stormLow);
    stormLow.connect(stormGain);
    stormGain.connect(master);
    this.stormGain = stormGain;

    const gust = context.createOscillator();
    gust.type = 'sine';
    gust.frequency.value = 0.08;
    const gustGain = context.createGain();
    gustGain.gain.value = 0;
    gust.connect(gustGain);
    gustGain.connect(windGain.gain);
    gust.start();
    this.gust = gust;
    this.gustGain = gustGain;

    const drift = context.createOscillator();
    drift.type = 'sine';
    drift.frequency.value = 0.173;
    const driftGain = context.createGain();
    driftGain.gain.value = 0;
    drift.connect(driftGain);
    driftGain.connect(windLow.frequency);
    drift.start();
    this.drift = drift;
    this.driftGain = driftGain;

    const airportSource = loopingNoise(37, 19793);
    const airportHigh = context.createBiquadFilter();
    airportHigh.type = 'highpass';
    airportHigh.frequency.value = 42;
    const airportLow = context.createBiquadFilter();
    airportLow.type = 'lowpass';
    airportLow.frequency.value = 520;
    const airportGain = context.createGain();
    airportGain.gain.value = 0;
    airportSource.connect(airportHigh);
    airportHigh.connect(airportLow);
    airportLow.connect(airportGain);
    airportGain.connect(this.bedPerspective);
    this.airportLow = airportLow;
    this.airportGain = airportGain;

    const airportPulse = context.createOscillator();
    airportPulse.type = 'sine';
    airportPulse.frequency.value = 0.029;
    const airportPulseGain = context.createGain();
    airportPulseGain.gain.value = 0;
    airportPulse.connect(airportPulseGain);
    airportPulseGain.connect(airportGain.gain);
    airportPulse.start();
    this.airportPulse = airportPulse;
    this.airportPulseGain = airportPulseGain;

    const airportDrift = context.createOscillator();
    airportDrift.type = 'sine';
    airportDrift.frequency.value = 0.043;
    const airportDriftGain = context.createGain();
    airportDriftGain.gain.value = 72;
    airportDrift.connect(airportDriftGain);
    airportDriftGain.connect(airportLow.frequency);
    airportDrift.start();
    this.airportDrift = airportDrift;
    this.airportDriftGain = airportDriftGain;

    this.passBuffer = noiseBuffer(24, 28657, true);
  }

  setWeather(profile: AtmosphereProfile) {
    this.profile = profile;
    if (!this.wantsPlayback || !this.pageVisible) return;
    if (
      !this.context ||
      !this.windLow ||
      !this.windHigh ||
      !this.windGain ||
      !this.rainLow ||
      !this.rainGain ||
      !this.snowGain ||
      !this.stormGain ||
      !this.gust ||
      !this.gustGain ||
      !this.driftGain ||
      !this.airportLow ||
      !this.airportGain ||
      !this.airportPulseGain
    )
      return;
    const sound = profile.sound;
    const now = this.context.currentTime;
    const glide = (parameter: AudioParam, value: number) =>
      parameter.setTargetAtTime(value, now, 3.2);
    glide(this.windLow.frequency, sound.windLowpassHz);
    glide(this.windHigh.frequency, sound.windHighpassHz);
    glide(this.windGain.gain, sound.windLevel);
    glide(this.rainLow.frequency, sound.rainLowpassHz);
    glide(this.rainGain.gain, sound.rainLevel);
    glide(this.snowGain.gain, sound.snowLevel);
    glide(this.stormGain.gain, sound.stormLevel);
    glide(this.gust.frequency, sound.gustRateHz);
    glide(this.gustGain.gain, sound.gustDepth);
    glide(this.driftGain.gain, sound.gustDepth * 180);
    glide(this.airportLow.frequency, sound.airportBedLowpassHz);
    glide(this.airportGain.gain, sound.airportBedLevel);
    glide(this.airportPulseGain.gain, sound.airportBedLevel * 0.16);
  }

  setActivity(activity: AmbienceActivity) {
    this.activity = {
      nearbyAircraft: Math.max(0, Math.floor(activity.nearbyAircraft)),
      fresh: activity.fresh,
    };
  }

  /** Scene changes affect only the distant airport mix, never playback or timers. */
  setPerspective(perspective: SoundPerspective) {
    if (this.perspective === perspective) return;
    this.perspective = perspective;
    if (!this.context) return;
    const mix = perspectiveMix(perspective);
    const now = this.context.currentTime;
    for (const [node, value] of [
      [this.bedPerspective, mix.bed],
      [this.passPerspective, mix.pass],
    ] as const) {
      if (!node) continue;
      const parameter = node.gain;
      // Hold an in-progress ramp when browsing quickly between views.
      if (typeof parameter.cancelAndHoldAtTime === 'function')
        parameter.cancelAndHoldAtTime(now);
      else {
        const held = parameter.value;
        parameter.cancelScheduledValues(now);
        parameter.setValueAtTime(held, now);
      }
      parameter.linearRampToValueAtTime(value, now + 3);
    }
  }

  setVolume(volume: number) {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(
      clamp(volume, 0, 1) * MASTER_VOLUME_SCALE,
      this.context.currentTime,
      0.12,
    );
  }

  async stop() {
    this.wantsPlayback = false;
    await this.syncPlayback();
  }

  async setPageVisible(visible: boolean) {
    this.pageVisible = visible;
    if (!this.context) return;
    await this.syncPlayback();
  }

  private syncPlayback() {
    const transition = async () => {
      const context = this.context;
      if (!context) return;
      const shouldPlay = this.wantsPlayback && this.pageVisible;
      if (!shouldPlay) {
        this.clearPassTimer();
        if (context.state !== 'closed') await context.suspend();
        if (context === this.context) this.stopActivePasses();
        return;
      }
      if (this.profile) this.setWeather(this.profile);
      if (context.state !== 'running') await context.resume();
      if (context === this.context && this.wantsPlayback && this.pageVisible)
        this.scheduleNextPass();
    };
    this.playbackTransition = this.playbackTransition.then(
      transition,
      transition,
    );
    return this.playbackTransition;
  }

  private scheduleNextPass() {
    if (
      this.passTimer !== null ||
      !this.context ||
      this.context.state !== 'running' ||
      !this.profile ||
      !this.wantsPlayback ||
      !this.pageVisible
    )
      return;
    const delay = aircraftPassDelayMs(
      this.activity,
      this.profile,
      this.runtime.random,
    );
    this.passTimer = this.runtime.setTimer(() => {
      this.passTimer = null;
      if (
        !this.context ||
        this.context.state !== 'running' ||
        !this.wantsPlayback ||
        !this.pageVisible
      )
        return;
      this.playAircraftPass();
      this.scheduleNextPass();
    }, delay);
  }

  private playAircraftPass() {
    const context = this.context;
    const profile = this.profile;
    const buffer = this.passBuffer;
    if (!context || !profile || !buffer) return;

    const random = this.runtime.random;
    const duration = 14 + random() * 8;
    const startsLeft = random() < 0.5;
    const panEdge = 0.48 + random() * 0.18;
    const startPan = startsLeft ? -panEdge : panEdge;
    const endPan = -startPan;
    const start = context.currentTime + 0.04;
    const end = start + duration;
    const peak = Math.min(
      MAX_AIRCRAFT_PASS_GAIN,
      profile.sound.aircraftPassLevel * (0.88 + random() * 0.12),
    );

    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.playbackRate.value = 0.82 + random() * 0.3;
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.Q.value = 0.7;
    const baseFrequency = 260 + random() * 110;
    noiseFilter.frequency.setValueAtTime(baseFrequency, start);
    noiseFilter.frequency.linearRampToValueAtTime(
      760 + random() * 260,
      start + duration * 0.48,
    );
    noiseFilter.frequency.linearRampToValueAtTime(baseFrequency * 0.82, end);

    const rumble = context.createOscillator();
    rumble.type = 'triangle';
    rumble.frequency.value = 48 + random() * 24;
    const rumbleGain = context.createGain();
    rumbleGain.gain.value = 0.055 + random() * 0.025;

    const passGain = context.createGain();
    passGain.gain.setValueAtTime(0, start);
    passGain.gain.linearRampToValueAtTime(peak * 0.18, start + duration * 0.2);
    passGain.gain.linearRampToValueAtTime(peak, start + duration * 0.48);
    passGain.gain.linearRampToValueAtTime(peak * 0.52, start + duration * 0.7);
    passGain.gain.linearRampToValueAtTime(0, end);

    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(startPan, start);
    panner.pan.linearRampToValueAtTime(endPan, end);

    noise.connect(noiseFilter);
    noiseFilter.connect(passGain);
    rumble.connect(rumbleGain);
    rumbleGain.connect(passGain);
    passGain.connect(panner);
    panner.connect(this.passPerspective!);

    const pass: ActivePass = {
      sources: [noise, rumble],
      nodes: [noise, noiseFilter, rumble, rumbleGain, passGain, panner],
    };
    this.activePasses.add(pass);
    noise.onended = () => this.finishPass(pass);
    noise.start(start);
    rumble.start(start);
    noise.stop(end + 0.05);
    rumble.stop(end + 0.05);
  }

  private finishPass(pass: ActivePass) {
    if (!this.activePasses.delete(pass)) return;
    pass.sources.forEach((source) => {
      source.onended = null;
    });
    pass.nodes.forEach((node) => node.disconnect());
  }

  private stopActivePasses() {
    [...this.activePasses].forEach((pass) => {
      pass.sources.forEach((source) => {
        source.onended = null;
        try {
          source.stop();
        } catch {}
      });
      this.finishPass(pass);
    });
  }

  private clearPassTimer() {
    if (this.passTimer === null) return;
    this.runtime.clearTimer(this.passTimer);
    this.passTimer = null;
  }

  close() {
    const context = this.context;
    if (!context) return;
    this.wantsPlayback = false;
    this.clearPassTimer();
    this.stopActivePasses();
    this.sources.forEach((source) => source.stop());
    this.sources = [];
    this.gust?.stop();
    this.drift?.stop();
    this.airportPulse?.stop();
    this.airportDrift?.stop();
    this.context = null;
    this.master = null;
    this.bedPerspective?.disconnect();
    this.passPerspective?.disconnect();
    this.bedPerspective = null;
    this.passPerspective = null;
    this.passBuffer = null;
    void context.close();
  }
}
