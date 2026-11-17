import { airport } from './airport';
export const RADIO_URL = airport.tower?.playerUrl ?? '';
export const TOWER_STREAM_URL = airport.tower?.streamUrl ?? '';
export const HAS_TOWER = Boolean(airport.tower);
export function launchRadio(open: typeof window.open) {
  if (!HAS_TOWER) return false;
  try {
    const player = open(
      RADIO_URL,
      'airport-tower-radio',
      'popup=yes,width=430,height=600',
    );
    if (!player) return false;
    player.opener = null;
    player.focus();
    return true;
  } catch {
    return false;
  }
}
