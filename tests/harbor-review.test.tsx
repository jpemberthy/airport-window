// @vitest-environment jsdom
import { useEffect } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereProfile } from '../lib/atmosphere';

const audio = vi.hoisted(() => ({
  construct: vi.fn(),
  play: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  close: vi.fn(),
  setWeather: vi.fn(),
  setActivity: vi.fn(),
  setVolume: vi.fn(),
  setPerspective: vi.fn(),
  setPageVisible: vi.fn(),
}));
vi.mock('../lib/ambience', () => ({
  WeatherAmbience: class {
    constructor() {
      audio.construct();
    }
    play = audio.play;
    stop = audio.stop;
    close = audio.close;
    setWeather = audio.setWeather;
    setActivity = audio.setActivity;
    setVolume = audio.setVolume;
    setPerspective = audio.setPerspective;
    setPageVisible = audio.setPageVisible;
  },
}));
vi.mock('../components/living-airspace', () => ({
  default: function MockHarbor({
    visible,
    active,
    atmosphere,
    onStatusChange,
  }: {
    visible: boolean;
    active: boolean;
    atmosphere: AtmosphereProfile;
    onStatusChange: (s: string) => void;
  }) {
    useEffect(() => onStatusChange('ready'), [onStatusChange]);
    return (
      <div
        data-testid="harbor"
        data-visible={String(visible)}
        data-active={String(active)}
        data-precipitation={atmosphere.precipitation ?? ''}
        data-daylight={atmosphere.daylight}
      />
    );
  },
}));
vi.mock('../components/moment-card', () => ({
  MomentCard: ({ atmosphere }: { atmosphere: AtmosphereProfile }) => (
    <div
      data-testid="story"
      data-precipitation={atmosphere.precipitation ?? ''}
      data-daylight={atmosphere.daylight}
    />
  ),
}));
vi.mock('../components/arcade-globe', () => ({
  default: () => <div>Globe</div>,
}));
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));
import { WindowLab } from '../components/window-lab';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: false,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const choose = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
const showing = () =>
  screen.getByTestId('harbor').getAttribute('data-visible') === 'true';

describe('full local harbor experience', () => {
  it('offers the real shortcut without changing audio ownership or making provider calls', async () => {
    render(<WindowLab />);
    choose('Preview view', 'cycle');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play ambience' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show harbor' }));
    expect(showing()).toBe(true);
    advance(180_000);
    expect(showing()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Back to stories' }));
    advance(59_000);
    expect(showing()).toBe(false);
    advance(1000);
    expect(showing()).toBe(true);
    choose('Traffic scenario', 'stale');
    expect(showing()).toBe(false);
    const disabled = screen.getByRole('button', {
      name: 'Show harbor',
    }) as HTMLButtonElement;
    expect(disabled.disabled).toBe(true);
    expect(
      document.getElementById(disabled.getAttribute('aria-describedby')!)!
        .textContent,
    ).toContain('fresh aircraft positions');
    expect(audio.construct).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.stop).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses identical weather/daylight in both views without provider requests', () => {
    render(<WindowLab />);
    expect(showing()).toBe(true);
    choose('Weather scenario', 'heavy-rain');
    choose('Daylight', 'day');
    for (const id of ['story', 'harbor']) {
      expect(screen.getByTestId(id).getAttribute('data-precipitation')).toBe(
        'rain',
      );
      expect(screen.getByTestId(id).getAttribute('data-daylight')).toBe('1');
    }
    choose('Weather scenario', 'stale-report');
    expect(
      screen.getByTestId('harbor').getAttribute('data-precipitation'),
    ).toBe('');
    expect(fetch).not.toHaveBeenCalled();
    expect(audio.construct).not.toHaveBeenCalled();
  });
  it('runs two 60/20 cycles with one opt-in audio owner and smooth perspective updates', async () => {
    render(<WindowLab />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play ambience' }));
    });
    choose('Preview view', 'cycle');
    for (let cycle = 0; cycle < 2; cycle++) {
      expect(showing()).toBe(false);
      advance(59_000);
      expect(showing()).toBe(false);
      advance(1000);
      expect(showing()).toBe(true);
      expect(audio.setPerspective).toHaveBeenLastCalledWith('harbor');
      advance(20_000);
      expect(showing()).toBe(false);
      expect(audio.setPerspective).toHaveBeenLastCalledWith('story');
    }
    expect(audio.construct).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.stop).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('freezes the scene under dialogs, pauses visibility, and resets on manual browsing', () => {
    render(<WindowLab />);
    choose('Preview view', 'cycle');
    advance(60_000);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    advance(90_000);
    expect(showing()).toBe(true);
    expect(screen.getByTestId('harbor').getAttribute('data-active')).toBe(
      'false',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Close flight details' }),
    );
    act(() => {
      Object.defineProperty(document, 'hidden', { value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(90_000);
    expect(showing()).toBe(true);
    act(() => {
      Object.defineProperty(document, 'hidden', { value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next flight' }));
    expect(showing()).toBe(false);
    advance(59_000);
    expect(showing()).toBe(false);
    advance(1000);
    expect(showing()).toBe(true);
  });
  it('skips stale traffic and supports sound A/B without restarting playback', async () => {
    render(<WindowLab />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play ambience' }));
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Harbor perspective on' }),
    );
    expect(audio.setPerspective).toHaveBeenLastCalledWith('story');
    choose('Preview view', 'cycle');
    choose('Traffic scenario', 'stale');
    advance(60_000);
    expect(showing()).toBe(false);
    choose('Traffic scenario', 'normal');
    expect(showing()).toBe(false);
    advance(20_000);
    advance(60_000);
    expect(showing()).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });
});
