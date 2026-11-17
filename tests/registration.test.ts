// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest';
import { registerAirportTools, airportTools } from '../lib/webmcp';
import { unavailableTraffic, unavailableWeather } from '../lib/normalize';
afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext');
});
it('registers tools with an abortable lifetime in compatible hosts', () => {
  const registerTool = vi.fn();
  Object.defineProperty(document, 'modelContext', {
    value: { registerTool },
    configurable: true,
  });
  const definitions = airportTools({
    snapshot: () => ({
      traffic: unavailableTraffic('', 0),
      weather: unavailableWeather('', 0),
      selectedAircraftId: null,
    }),
    select: () => {
      throw new Error('No aircraft');
    },
  });
  const dispose = registerAirportTools(definitions);
  expect(registerTool).toHaveBeenCalledTimes(2);
  expect(registerTool.mock.calls[0][0].name).toBe('get_airport_snapshot');
  const signal = registerTool.mock.calls[0][1].signal as AbortSignal;
  expect(signal.aborted).toBe(false);
  dispose();
  expect(signal.aborted).toBe(true);
});
it('keeps ordinary controls available when WebMCP is absent', () => {
  expect(() => registerAirportTools([])()).not.toThrow();
});
