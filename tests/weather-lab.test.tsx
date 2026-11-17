// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const audioMocks = vi.hoisted(() => ({
  construct: vi.fn(),
  play: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  setWeather: vi.fn(),
  setPageVisible: vi.fn(async () => {}),
}));

vi.mock('@/lib/ambience', () => ({
  WeatherAmbience: class {
    constructor() {
      audioMocks.construct();
    }
    play = audioMocks.play;
    stop = audioMocks.stop;
    close = audioMocks.close;
    setWeather = audioMocks.setWeather;
    setPageVisible = audioMocks.setPageVisible;
  },
}));

vi.mock('../components/flight-scene', () => ({
  FlightScene: ({
    moment,
    variant = 'layered',
  }: {
    moment: string;
    variant?: string;
  }) => <div data-testid={`scene-${variant}`}>{moment}</div>,
}));

import { WeatherLab } from '../components/weather-lab';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('weather calibration lab', () => {
  it('offers the complete catalog with provenance and expectations', () => {
    render(<WeatherLab />);
    expect(screen.getByLabelText('Calibration scenario').children).toHaveLength(
      10,
    );
    expect(
      screen
        .getByRole('button', { name: 'Heavy rain · mist' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByText('Archived KBOS observation')).toBeTruthy();
    expect(screen.getByText('Expected visual character')).toBeTruthy();
    expect(screen.getByText('Expected audio character')).toBeTruthy();
    expect(screen.getByText('Catalog baseline')).toBeTruthy();
    expect(screen.getAllByTestId(/^scene-/)).toHaveLength(2);
  });

  it('loads a scenario without losing flight-pose selection', () => {
    render(<WeatherLab />);
    fireEvent.change(screen.getByLabelText('Flight pose'), {
      target: { value: 'climb' },
    });
    fireEvent.change(screen.getByLabelText('Calibration scenario'), {
      target: { value: 'mist' },
    });

    expect(
      screen.getByRole('heading', { name: 'Harbor mist · 2 mi' }),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText('Flight pose') as unknown as HTMLSelectElement)
        .value,
    ).toBe('climb');
    expect(
      (screen.getByLabelText('Boston light') as HTMLInputElement).value,
    ).toBe('0.72');
    expect(screen.getByTestId('scene-classic').textContent).toBe('climb');
    expect(screen.getByTestId('scene-layered').textContent).toBe('climb');
    expect(screen.getByText(/SPECI KBOS 301147Z/)).toBeTruthy();
  });

  it('marks manual tuning as custom and resets to the catalog baseline', () => {
    render(<WeatherLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear daylight' }));
    fireEvent.change(screen.getByLabelText('Cloud cover'), {
      target: { value: '0.6' },
    });
    fireEvent.change(screen.getByLabelText('Boston light'), {
      target: { value: '0.4' },
    });

    expect(screen.getByText('Custom tuning')).toBeTruthy();
    expect(
      (screen.getByLabelText('Cloud cover') as HTMLInputElement).value,
    ).toBe('0.6');
    const reset = screen.getByRole('button', {
      name: 'Reset scenario',
    }) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    expect(screen.getByText('Catalog baseline')).toBeTruthy();
    expect(
      (screen.getByLabelText('Cloud cover') as HTMLInputElement).value,
    ).toBe('0');
    expect(
      (screen.getByLabelText('Boston light') as HTMLInputElement).value,
    ).toBe('1');
  });

  it('loads stale and unavailable freshness without carrying overrides', () => {
    render(<WeatherLab />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Stale weather report' }),
    );
    const stale = screen.getByLabelText(
      'Observation older than 90 minutes',
    ) as HTMLInputElement;
    expect(stale.checked).toBe(true);
    expect(stale.disabled).toBe(false);
    expect(screen.getByText('Neutral · report stale')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Weather unavailable' }),
    );
    expect(stale.checked).toBe(false);
    expect(stale.disabled).toBe(true);
    expect(screen.getByText('No source observation')).toBeTruthy();
    expect(screen.getByText('unavailable')).toBeTruthy();
    expect(screen.getByText('Neutral · report unavailable')).toBeTruthy();
  });

  it('keeps ambience user initiated and cleans it up on unmount', async () => {
    const view = render(<WeatherLab />);
    expect(audioMocks.construct).not.toHaveBeenCalled();
    expect(audioMocks.play).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Play ambience' }));
    expect(audioMocks.construct).toHaveBeenCalledTimes(1);
    expect(audioMocks.play).toHaveBeenCalledWith(
      expect.objectContaining({ known: true }),
      0.65,
      { nearbyAircraft: 0, fresh: false },
    );
    expect(
      await screen.findByRole('button', { name: 'Pause ambience' }),
    ).toBeTruthy();
    view.unmount();
    expect(audioMocks.close).toHaveBeenCalledTimes(1);
  });
});
