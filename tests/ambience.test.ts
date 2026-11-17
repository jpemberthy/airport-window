import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aircraftPassDelayMs,
  MAX_AIRCRAFT_PASS_GAIN,
  WeatherAmbience,
  type AmbienceRuntime,
} from '../lib/ambience';
import { atmosphereProfile } from '../lib/atmosphere';
import { unavailableWeather } from '../lib/normalize';
import type { WeatherSnapshot } from '../lib/types';

const now = Date.parse('2026-09-27T18:00:00Z');
const weather: WeatherSnapshot = {
  ...unavailableWeather('', 0),
  observedAt: now - 60_000,
  receivedAt: now,
  freshness: 'fresh',
  condition: 'clear',
  cloudCover: 0,
  visibilityMiles: 10,
  temperatureC: 15,
  windSpeedKt: 4,
};
const profile = (update: Partial<WeatherSnapshot> = {}) =>
  atmosphereProfile({ ...weather, ...update }, 1, now);
const sound = (update: Partial<WeatherSnapshot>) => profile(update).sound;
const activeWeather = profile({
  condition: 'rain',
  precipitation: 'rain',
  cloudCover: 0.8,
  windSpeedKt: 18,
});

class FakeAudioParam {
  value = 0;
  targets: number[] = [];
  ramps: number[] = [];
  cancelScheduledValues = vi.fn();

  setTargetAtTime(value: number) {
    this.value = value;
    this.targets.push(value);
    return this;
  }

  setValueAtTime(value: number) {
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number) {
    this.value = value;
    this.ramps.push(value);
    return this;
  }
}

class FakeAudioNode {
  connect = vi.fn((destination: unknown) => destination);
  disconnect = vi.fn();
}

class FakeBufferSource extends FakeAudioNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  playbackRate = new FakeAudioParam();
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeOscillator extends FakeAudioNode {
  type: OscillatorType = 'sine';
  frequency = new FakeAudioParam();
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeFilter extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
}

class FakePanner extends FakeAudioNode {
  pan = new FakeAudioParam();
}

class FakeAudioContext {
  sampleRate = 512;
  currentTime = 0;
  state: AudioContextState = 'suspended';
  destination = new FakeAudioNode() as unknown as AudioDestinationNode;
  gains: FakeGain[] = [];
  filters: FakeFilter[] = [];
  bufferSources: FakeBufferSource[] = [];
  oscillators: FakeOscillator[] = [];
  panners: FakePanner[] = [];

  resume = vi.fn(async () => {
    this.state = 'running';
  });
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createGain = vi.fn(() => {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  });
  createBiquadFilter = vi.fn(() => {
    const filter = new FakeFilter();
    this.filters.push(filter);
    return filter as unknown as BiquadFilterNode;
  });
  createBufferSource = vi.fn(() => {
    const source = new FakeBufferSource();
    this.bufferSources.push(source);
    return source as unknown as AudioBufferSourceNode;
  });
  createOscillator = vi.fn(() => {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  });
  createStereoPanner = vi.fn(() => {
    const panner = new FakePanner();
    this.panners.push(panner);
    return panner as unknown as StereoPannerNode;
  });
  createBuffer = vi.fn(
    (_channels: number, length: number, sampleRate: number) => {
      const samples = new Float32Array(length);
      return {
        duration: length / sampleRate,
        getChannelData: () => samples,
      } as unknown as AudioBuffer;
    },
  );
}

const ambienceRuntime = (
  context: FakeAudioContext,
  random: () => number = () => 0,
): AmbienceRuntime => ({
  createContext: () => context as unknown as AudioContext,
  random,
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('weather ambience', () => {
  it('makes stronger wind louder and brighter', () => {
    const calm = sound({ windSpeedKt: 0 });
    const windy = sound({ windSpeedKt: 28 });
    expect(windy.windLevel).toBeGreaterThan(calm.windLevel);
    expect(windy.windLowpassHz).toBeGreaterThan(calm.windLowpassHz);
  });

  it('uses gusts and temperature for different wind textures', () => {
    const steady = sound({});
    const gusty = sound({ windGustKt: 29 });
    expect(gusty.gustDepth).toBeGreaterThan(steady.gustDepth);
    expect(gusty.gustRateHz).toBeGreaterThan(steady.gustRateHz);
    const cold = sound({ temperatureC: -10 });
    const warm = sound({ temperatureC: 32 });
    expect(cold.windHighpassHz).toBeGreaterThan(warm.windHighpassHz);
    expect(cold.windLowpassHz).toBeGreaterThan(warm.windLowpassHz);
  });

  it('follows precipitation intensity and stops storm sound when stale', () => {
    const light = sound({
      precipitation: 'rain',
      precipitationIntensity: 'light',
    });
    const heavy = sound({
      precipitation: 'rain',
      precipitationIntensity: 'heavy',
    });
    expect(heavy.rainLevel).toBeGreaterThan(light.rainLevel);
    expect(sound({ precipitation: 'snow' }).rainLevel).toBe(0);
    expect(sound({ precipitation: 'snow' }).snowLevel).toBeGreaterThan(0);
    expect(sound({ thunder: true }).stormLevel).toBeGreaterThan(0);
    const stale = sound({
      observedAt: now - 91 * 60_000,
      precipitation: 'rain',
      thunder: true,
    });
    expect(stale.rainLevel).toBe(0);
    expect(stale.snowLevel).toBe(0);
    expect(stale.stormLevel).toBe(0);
  });

  it('bounds extreme measurements and keeps every mix value finite', () => {
    const missing = sound({
      windSpeedKt: null,
      windGustKt: null,
      temperatureC: null,
    });
    const extreme = sound({
      windSpeedKt: 100,
      windGustKt: 160,
      temperatureC: -80,
      precipitation: 'rain',
      cloudCover: 1,
    });
    expect(Object.values(missing).every(Number.isFinite)).toBe(true);
    expect(extreme.windLevel).toBeLessThanOrEqual(0.4);
    expect(extreme.gustDepth).toBeLessThanOrEqual(0.077);
    expect(extreme.airportBedLevel).toBeLessThanOrEqual(0.032);
    expect(extreme.aircraftPassLevel).toBeLessThanOrEqual(0.085);
  });
});

describe('aircraft pass scheduling', () => {
  it('uses bounded traffic buckets and treats stale traffic as quiet', () => {
    expect(
      aircraftPassDelayMs(
        { nearbyAircraft: 2, fresh: true },
        activeWeather,
        () => 0,
      ),
    ).toBe(150_000);
    expect(
      aircraftPassDelayMs(
        { nearbyAircraft: 2, fresh: true },
        activeWeather,
        () => 1,
      ),
    ).toBe(300_000);
    expect(
      aircraftPassDelayMs(
        { nearbyAircraft: 7, fresh: true },
        activeWeather,
        () => 0,
      ),
    ).toBe(90_000);
    expect(
      aircraftPassDelayMs(
        { nearbyAircraft: 12, fresh: true },
        activeWeather,
        () => 1,
      ),
    ).toBe(150_000);
    expect(
      aircraftPassDelayMs(
        { nearbyAircraft: 99, fresh: false },
        activeWeather,
        () => 0,
      ),
    ).toBe(150_000);
  });

  it('lengthens calm clear quiet periods by twenty percent', () => {
    const calmClear = profile();
    expect(calmClear.sound.aircraftPassIntervalScale).toBe(1.2);
    expect(
      aircraftPassDelayMs(
        { nearbyAircraft: 1, fresh: true },
        calmClear,
        () => 0,
      ),
    ).toBe(180_000);
    expect(
      aircraftPassDelayMs(
        { nearbyAircraft: 1, fresh: true },
        calmClear,
        () => 1,
      ),
    ).toBe(360_000);
  });

  it('does not reset the current quiet period when traffic changes', async () => {
    const context = new FakeAudioContext();
    const ambience = new WeatherAmbience(ambienceRuntime(context));
    await ambience.play(activeWeather, 0.42, {
      nearbyAircraft: 1,
      fresh: true,
    });
    expect(context.bufferSources).toHaveLength(5);

    await vi.advanceTimersByTimeAsync(100_000);
    ambience.setActivity({ nearbyAircraft: 12, fresh: true });
    await vi.advanceTimersByTimeAsync(49_999);
    expect(context.bufferSources).toHaveLength(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(context.bufferSources).toHaveLength(6);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(context.bufferSources).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(1);
    expect(context.bufferSources).toHaveLength(7);
  });
});

describe('ambience lifecycle', () => {
  const busy = { nearbyAircraft: 12, fresh: true };

  it('ramps only perspective buses without restarting sources, context, or pass timers', async () => {
    const context = new FakeAudioContext();
    const runtime = ambienceRuntime(context);
    const create = vi.spyOn(runtime, 'createContext');
    const ambience = new WeatherAmbience(runtime);
    ambience.setPerspective('harbor');
    expect(create).not.toHaveBeenCalled();
    await ambience.play(activeWeather, 0.4, busy);
    expect(context.gains[1].gain.value).toBe(0.8);
    expect(context.gains[2].gain.value).toBe(0.7);
    const sources = context.bufferSources.length;
    const timers = vi.getTimerCount();
    const weatherTargets = context.gains
      .slice(3)
      .map((g) => [...g.gain.targets]);
    ambience.setPerspective('story');
    ambience.setPerspective('harbor');
    expect(context.gains[1].gain.ramps).toEqual([1, 0.8]);
    expect(context.gains[2].gain.ramps).toEqual([1, 0.7]);
    expect(context.gains.slice(3).map((g) => g.gain.targets)).toEqual(
      weatherTargets,
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(context.bufferSources).toHaveLength(sources);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(timers);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(context.bufferSources).toHaveLength(sources + 1);
    ambience.close();
    expect(context.gains[1].disconnect).toHaveBeenCalled();
  });

  it('caps master and aircraft-pass gains', async () => {
    const context = new FakeAudioContext();
    const ambience = new WeatherAmbience(ambienceRuntime(context));
    await ambience.play(activeWeather, 4, busy);
    expect(context.gains[0].gain.targets.at(-1)).toBe(0.52);

    await vi.advanceTimersByTimeAsync(60_000);
    const passRamps = context.gains.flatMap((gain) => gain.gain.ramps);
    expect(Math.max(...passRamps)).toBeLessThanOrEqual(MAX_AIRCRAFT_PASS_GAIN);
  });

  it('pauses all work and gives resumed playback a new quiet period', async () => {
    const context = new FakeAudioContext();
    const ambience = new WeatherAmbience(ambienceRuntime(context));
    await ambience.play(activeWeather, 0.42, busy);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(context.bufferSources).toHaveLength(6);

    await ambience.stop();
    const pausedSourceCount = context.bufferSources.length;
    expect(context.suspend).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(context.bufferSources).toHaveLength(pausedSourceCount);

    await ambience.play(activeWeather, 0.42, busy);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(context.bufferSources).toHaveLength(pausedSourceCount);
    await vi.advanceTimersByTimeAsync(1);
    expect(context.bufferSources).toHaveLength(pausedSourceCount + 1);
  });

  it('suspends while hidden and resumes only after prior user playback', async () => {
    const context = new FakeAudioContext();
    const ambience = new WeatherAmbience(ambienceRuntime(context));
    await ambience.play(activeWeather, 0.42, busy);
    await ambience.setPageVisible(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(context.bufferSources).toHaveLength(5);

    await ambience.setPageVisible(true);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(context.bufferSources).toHaveLength(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(context.bufferSources).toHaveLength(6);

    await ambience.stop();
    const resumeCalls = context.resume.mock.calls.length;
    await ambience.setPageVisible(false);
    await ambience.setPageVisible(true);
    expect(context.resume).toHaveBeenCalledTimes(resumeCalls);
  });

  it('cleans up timers, loops, active passes, and the context once', async () => {
    const context = new FakeAudioContext();
    const ambience = new WeatherAmbience(ambienceRuntime(context));
    await ambience.play(activeWeather, 0.42, busy);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(context.bufferSources).toHaveLength(6);

    ambience.close();
    ambience.close();
    expect(vi.getTimerCount()).toBe(0);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(
      context.bufferSources.every((source) => source.stop.mock.calls.length),
    ).toBe(true);
    expect(
      context.oscillators.every((source) => source.stop.mock.calls.length),
    ).toBe(true);

    const sourceCount = context.bufferSources.length;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(context.bufferSources).toHaveLength(sourceCount);
  });
});
