import { describe, it, expect, vi } from 'vitest';
import { airportTools } from '../lib/webmcp';
import { launchRadio, RADIO_URL } from '../lib/radio';
import { normalizeTraffic, unavailableWeather } from '../lib/normalize';
describe('WebMCP and official radio', () => {
  it('reads the same current snapshot and selects a real observed aircraft', () => {
    const traffic = normalizeTraffic({
      now: Date.now(),
      ac: [{ hex: 'abc123', lat: 42.36, lon: -71.01, seen_pos: 0 }],
    });
    let selectedAircraftId: string | null = null;
    const state = () => ({
      traffic,
      weather: unavailableWeather('', 0),
      selectedAircraftId,
    });
    const tools = airportTools({
      snapshot: state,
      select: (id) => {
        const a = traffic.aircraft.find((a) => a.id === id);
        if (!a) throw new Error('Unavailable');
        selectedAircraftId = id;
        return a;
      },
    });
    expect(tools[0].execute({})).toEqual(state());
    expect(tools[1].execute({ aircraftId: 'abc123' })).toEqual({
      selectedAircraft: traffic.aircraft[0],
    });
    expect(tools[0].execute({})).toMatchObject({
      selectedAircraftId: 'abc123',
    });
    expect(() => tools[1].execute({ aircraftId: 'bad' })).toThrow();
    expect(() =>
      tools[1].execute({ aircraftId: 'abc123', extra: true }),
    ).toThrow();
    expect(() => tools[0].execute({ extra: true })).toThrow();
  });
  it('opens the official player and detaches its opener', () => {
    const player = { opener: {}, focus: vi.fn() };
    const open = vi.fn().mockReturnValue(player);
    expect(launchRadio(open)).toBe(true);
    expect(open.mock.calls[0][0]).toBe(RADIO_URL);
    expect(player.opener).toBeNull();
    expect(player.focus).toHaveBeenCalledOnce();
  });
  it('reports popup blocking and browser failures for the visible fallback', () => {
    expect(launchRadio(vi.fn().mockReturnValue(null))).toBe(false);
    expect(
      launchRadio(
        vi.fn().mockImplementation(() => {
          throw new Error('Blocked');
        }),
      ),
    ).toBe(false);
  });
});
