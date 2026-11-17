export type Freshness = 'fresh' | 'stale' | 'unavailable';
export interface Airline {
  code: string;
  name: string;
  color: string;
  sprite: number;
}
export interface AircraftTrack {
  positionSource?: TrafficSourceId;
  id: string;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  speedKt: number | null;
  heading: number | null;
  verticalRateFpm: number | null;
  onGround: boolean | null;
  observedAt: number;
  airline: Airline;
}
export interface FeedStatus {
  source: string;
  observedAt: number | null;
  receivedAt: number | null;
  freshness: Freshness;
  error: string | null;
  retryAfterSeconds: number | null;
}
export interface TrafficSnapshot extends FeedStatus {
  provider?: TrafficSourceId;
  aircraft: AircraftTrack[];
}
export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'snow'
  | 'fog'
  | 'unknown';
export type Precipitation = 'rain' | 'drizzle' | 'snow' | 'mixed' | null;
export type PrecipitationIntensity = 'light' | 'moderate' | 'heavy' | null;
export interface WeatherSnapshot extends FeedStatus {
  station: string;
  temperatureC: number | null;
  dewPointC: number | null;
  windDirection: number | null;
  windSpeedKt: number | null;
  windGustKt: number | null;
  visibilityMiles: number | null;
  cloudCover: number | null;
  ceilingFt: number | null;
  condition: WeatherCondition;
  precipitation: Precipitation;
  precipitationIntensity: PrecipitationIntensity;
  fog: boolean;
  mist: boolean;
  thunder: boolean;
  description: string;
  raw: string | null;
}
export interface TrackHistory {
  previous: AircraftTrack | null;
  current: AircraftTrack;
  groundTransition?: {
    fromGround: boolean;
    observedAt: number;
  } | null;
}
import type { TrafficSourceId } from './traffic-sources';
