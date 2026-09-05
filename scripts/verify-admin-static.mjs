#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = 18_091;
const origin = `http://127.0.0.1:${port}`;
let output = '';
const child = spawn(process.execPath, ['apps/server/dist/entrypoints/api.js'], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    API_HOST: '127.0.0.1',
    API_PORT: String(port),
    APP_PUBLIC_URL: origin,
    DATABASE_URL: 'postgres://app:app_password@127.0.0.1:5438/app',
    API_DOCS_ENABLED: 'false',
    AUTH_COOKIE_SECURE: 'true',
    AUTH_EXPOSE_TEST_TOKENS: 'false',
    SETTINGS_ENCRYPTION_CURRENT_KEY_ID: 'smoke-v1',
    SETTINGS_ENCRYPTION_KEYS: JSON.stringify({
      'smoke-v1': 'static-smoke-settings-key-at-least-32-characters',
    }),
    // Keep successful smoke runs quiet while preserving fatal startup diagnostics.
    LOG_LEVEL: 'error',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.on('data', (chunk) => {
  output += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  output += chunk.toString();
});

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `server exited early (code=${child.exitCode}, signal=${child.signalCode ?? 'none'})\n${output}`,
      );
    }
    try {
      const response = await fetch(`${origin}/health/live`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`server did not start in time\n${output}`);
}

try {
  await waitForServer();

  const redirect = await fetch(`${origin}/admin`, { redirect: 'manual' });
  if (redirect.status !== 302 || redirect.headers.get('location') !== '/admin/') {
    throw new Error(`expected /admin redirect, received ${redirect.status}`);
  }

  const deepRoute = await fetch(`${origin}/admin/showcase`);
  const html = await deepRoute.text();
  if (!deepRoute.ok || !html.includes('<div id="root"></div>')) {
    throw new Error(`Admin deep route did not return the SPA entry (${deepRoute.status})`);
  }

  const scriptPath = html.match(/src="([^"]+\.js)"/)?.[1];
  if (!scriptPath) throw new Error('Admin entry script was not found');
  const script = await fetch(`${origin}${scriptPath}`);
  if (!script.ok || !script.headers.get('content-type')?.includes('javascript')) {
    throw new Error(`Admin asset was not served correctly (${script.status})`);
  }
  await script.arrayBuffer();

  console.log('Admin production static hosting smoke test passed');
} finally {
  if (child.exitCode === null) child.kill('SIGTERM');
  await new Promise((resolvePromise) => {
    if (child.exitCode !== null) resolvePromise();
    else child.once('exit', resolvePromise);
  });
}
