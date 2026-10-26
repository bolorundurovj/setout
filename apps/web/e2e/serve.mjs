// Starts the API on the production web build with an empty database, for the Playwright suite.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');
const api = resolve(web, '..', 'api');
// Recreated on every start: Windows ends the server with a forced kill, so no exit handler runs.
const data = join(here, '.data');

rmSync(data, { recursive: true, force: true });
mkdirSync(data, { recursive: true });

const port = process.env.E2E_PORT ?? '8475';
const server = spawn(
  'uv',
  ['run', 'uvicorn', 'setout.main:app', '--host', '127.0.0.1', '--port', port],
  {
    cwd: api,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      SETOUT_STATIC_DIR: join(web, 'dist', 'web', 'browser'),
      SETOUT_DATA_DIR: data,
      SETOUT_DATABASE_URL: '',
      SETOUT_STORAGE_BACKEND: 'local',
      SETOUT_SECRET_KEY: 'e2e-only-secret-not-for-deployment',
      SETOUT_COOKIE_SECURE: 'false',
    },
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('exit', (code) => process.exit(code ?? 0));
