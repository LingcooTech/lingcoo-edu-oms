import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const task = process.argv[2];
const commands = {
  migrate: ['apps/server', ['--import', 'tsx', 'src/entrypoints/migrate.ts']],
  bootstrap: ['apps/server', ['--import', 'tsx', 'src/entrypoints/bootstrap.ts']],
  api: ['apps/server', ['--import', 'tsx', 'src/entrypoints/api.ts']],
  admin: [
    'apps/admin',
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '15173', '--strictPort'],
  ],
  web: [
    'apps/web',
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '15174', '--strictPort'],
  ],
};
if (!Object.hasOwn(commands, task ?? '')) {
  console.error('Usage: node scripts/preview.mjs migrate|bootstrap|api|admin|web');
  process.exit(1);
}
process.loadEnvFile(new URL('../.env.preview', import.meta.url));
const [directory, args] = commands[task];
const child = spawn(process.execPath, args, {
  cwd: `${root}${directory}`,
  stdio: 'inherit',
  env: {
    ...process.env,
    API_PROXY_TARGET: 'http://127.0.0.1:18090',
    VITE_ADMIN_URL: 'http://localhost:15173/admin/',
    VITE_AUTH_CSRF_COOKIE_NAME: process.env.AUTH_CSRF_COOKIE_NAME,
  },
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
