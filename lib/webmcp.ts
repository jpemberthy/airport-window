import { airport } from './airport';
import type { AircraftTrack, TrafficSnapshot, WeatherSnapshot } from './types';
export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
}
export function airportTools(actions: {
  snapshot: () => {
    traffic: TrafficSnapshot;
    weather: WeatherSnapshot;
    selectedAircraftId: string | null;
  };
  select: (id: string) => AircraftTrack;
}): ToolDefinition[] {
  return [
    {
      name: 'get_airport_snapshot',
      title: `Read ${airport.name} airport activity`,
      description:
        'Read the currently observed aircraft, weather, source timestamps and selected aircraft. Includes third-party flight reports.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          Object.keys(input).length
        )
          throw new Error('Expected an empty object');
        return actions.snapshot();
      },
    },
    {
      name: 'select_aircraft',
      title: 'Select a nearby aircraft',
      description:
        'Select an observed aircraft by its ID and open its details in the airport scene. Does not control the real aircraft.',
      inputSchema: {
        type: 'object',
        properties: { aircraftId: { type: 'string' } },
        required: ['aircraftId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          Object.keys(input).length !== 1 ||
          !('aircraftId' in input) ||
          typeof input.aircraftId !== 'string'
        )
          throw new Error('Expected aircraftId');
        return { selectedAircraft: actions.select(input.aircraftId) };
      },
    },
  ];
}
export function registerAirportTools(tools: ToolDefinition[]) {
  const context = (
    document as Document & {
      modelContext?: {
        registerTool: (
          tool: ToolDefinition,
          options: { signal: AbortSignal },
        ) => void | Promise<void>;
      };
    }
  ).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  for (const tool of tools) {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* Normal controls remain available. */
    }
  }
  return () => lifecycle.abort();
}
