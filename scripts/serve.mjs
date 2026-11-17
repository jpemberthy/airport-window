import { spawn, spawnSync } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
if (existsSync('.env')) loadEnvFile('.env');
const initialize = spawnSync(
  process.execPath,
  ['scripts/database.mjs', 'init'],
  { stdio: 'inherit' },
);
if (initialize.status !== 0) process.exit(initialize.status ?? 1);
let pruning;
const timer = setInterval(() => {
  if (pruning) return;
  pruning = spawn(process.execPath, ['scripts/database.mjs', 'prune'], {
    stdio: 'inherit',
  });
  pruning.on('exit', (code) => {
    if (code) console.error('Database cleanup failed:', code);
    pruning = undefined;
  });
}, 60000);
const server = spawn(process.execPath, ['dist/standalone/server.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    HOST: process.env.HOST ?? '127.0.0.1',
    PORT: process.env.PORT ?? '3000',
  },
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    clearInterval(timer);
    pruning?.kill(signal);
    server.kill(signal);
  });
server.on('exit', (code) => {
  clearInterval(timer);
  pruning?.kill();
  process.exit(code ?? 0);
});
