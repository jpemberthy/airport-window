declare module 'cloudflare:workers' {
  export const env: { DB?: import('./storage').SqlDatabase };
}
