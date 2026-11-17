import { getRouteDatabase } from '../db';
import { unavailableTraffic } from './normalize';
import { configuredTrafficProviders } from './traffic/providers';
import { createTrafficService } from './traffic/service';
import { D1TrafficStore } from './traffic/store';

let service: ReturnType<typeof createTrafficService> | undefined;

// Both /api/traffic and paid route validation consume this same snapshot.
export async function getTraffic() {
  if (!service) {
    const db = getRouteDatabase();
    if (!db)
      return unavailableTraffic('Position cache temporarily unavailable', 15);
    try {
      service = createTrafficService({
        providers: configuredTrafficProviders(
          process.env.TRAFFIC_PROVIDER_ORDER,
        ),
        store: new D1TrafficStore(db),
      });
    } catch {
      return unavailableTraffic(
        'Position provider configuration unavailable',
        60,
      );
    }
  }
  return service();
}
