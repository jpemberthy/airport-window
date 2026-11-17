import { env } from 'cloudflare:workers';
import type { SqlDatabase } from './storage';
export function getRouteDatabase(): SqlDatabase | null {
  return (env as { DB?: SqlDatabase }).DB ?? null;
}
