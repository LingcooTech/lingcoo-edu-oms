#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const project = `lingcoo-edu-oms-smoke-${process.pid}`;
const workdir = await mkdtemp(join(tmpdir(), 'lingcoo-edu-oms-docker-'));
const envFile = join(workdir, '.env');
const image = `lingcoo-edu-oms:smoke-${process.pid}`;
const hostPort = 18093 + (process.pid % 1000);
const nodeImage = process.env.NODE_IMAGE ?? 'node:24-alpine';
const postgresImage = process.env.POSTGRES_IMAGE ?? 'postgres:17-alpine';
const caddyImage = process.env.CADDY_IMAGE ?? 'caddy:2-alpine';
const env = [
  `APP_IMAGE=${image}`,
  `POSTGRES_IMAGE=${postgresImage}`,
  `CADDY_IMAGE=${caddyImage}`,
  'APP_NAME=lingcoo-edu-oms-smoke',
  'APP_VERSION=smoke',
  `APP_PUBLIC_URL=http://127.0.0.1:${hostPort}`,
  'CORS_ORIGIN=http://localhost:5173',
  'DATABASE_URL=postgres://app:app_password@postgres:5432/app',
  'API_DOCS_ENABLED=false',
  'TRUST_PROXY=true',
  'LOG_LEVEL=info',
  'STORAGE_PROVIDER=local',
  'STORAGE_LOCAL_ROOT=/app/data/storage',
  'SETTINGS_ENCRYPTION_CURRENT_KEY_ID=smoke-v1',
  'SETTINGS_ENCRYPTION_KEYS={"smoke-v1":"docker-smoke-settings-key-at-least-32-characters"}',
  'POSTGRES_DB=app',
  'POSTGRES_USER=app',
  'POSTGRES_PASSWORD=app_password',
  `HTTP_PORT=${hostPort}`,
  'CADDY_SITE_ADDRESS=:80',
].join('\n');

try {
  execFileSync('docker', ['info'], { stdio: 'ignore' });
} catch {
  console.error(
    'Docker smoke test requires a running Docker daemon. Start Docker Desktop or the Docker service and retry.',
  );
  process.exitCode = 1;
  process.exit();
}

function compose(args) {
  return execFileSync(
    'docker',
    ['compose', '-p', project, '-f', 'docker-compose.prod.yml', '--env-file', envFile, ...args],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );
}

function composeOutput(args) {
  return execFileSync(
    'docker',
    ['compose', '-p', project, '-f', 'docker-compose.prod.yml', '--env-file', envFile, ...args],
    { cwd: root, encoding: 'utf8' },
  );
}

async function waitForReady(url, attempts = 30) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      execFileSync('curl', ['-fsS', url], { stdio: 'ignore' });
      return;
    } catch {
      if (attempt === attempts)
        throw new Error(`Docker smoke endpoint did not become ready: ${url}`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
    }
  }
}

async function waitForWorker(attempts = 20) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const running = composeOutput(['ps', '--status', 'running', '--services']);
    const logs = composeOutput(['logs', '--no-color', 'worker']);
    if (
      running.split('\n').includes('worker') &&
      logs.includes('job worker ready') &&
      logs.includes('outbox publisher ready')
    )
      return;
    if (attempt === attempts)
      throw new Error('Docker Worker did not enter the Jobs and Outbox polling loops');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }
}

try {
  await writeFile(envFile, `${env}\n`);
  execFileSync(
    'docker',
    [
      'build',
      '--tag',
      image,
      '--build-arg',
      'APP_VERSION=smoke',
      '--build-arg',
      `NODE_IMAGE=${nodeImage}`,
      '.',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  compose(['up', '-d', '--wait', 'postgres']);
  const migrationCommand = [
    'run',
    '--rm',
    '--no-deps',
    'api',
    'node',
    'apps/server/dist/entrypoints/migrate.js',
  ];
  compose(migrationCommand);
  compose(migrationCommand);
  const bootstrapCommand = [
    'run',
    '--rm',
    '--no-deps',
    'api',
    'node',
    'apps/server/dist/entrypoints/bootstrap.js',
  ];
  compose(bootstrapCommand);
  compose(bootstrapCommand);
  compose(['up', '-d', 'api', 'worker', 'caddy']);
  await waitForReady(`http://127.0.0.1:${hostPort}/health/ready`);
  await waitForWorker();
  compose([
    'exec',
    '-T',
    'api',
    'node',
    '-e',
    "require('node:fs').writeFileSync('/app/data/storage/.api-smoke','ok')",
  ]);
  compose([
    'exec',
    '-T',
    'worker',
    'node',
    '-e',
    "if(require('node:fs').readFileSync('/app/data/storage/.api-smoke','utf8')!=='ok')process.exit(1)",
  ]);
  execFileSync('curl', ['-fsS', `http://127.0.0.1:${hostPort}/health/live`], { stdio: 'inherit' });
  execFileSync('curl', ['-fsS', `http://127.0.0.1:${hostPort}/`], { stdio: 'ignore' });
  execFileSync('curl', ['-fsS', `http://127.0.0.1:${hostPort}/admin/`], { stdio: 'ignore' });
  console.log('Docker production smoke test passed');
} finally {
  try {
    compose(['down', '--volumes', '--remove-orphans']);
  } catch {
    console.error(`Docker cleanup failed for compose project ${project}`);
  }
  try {
    execFileSync('docker', ['image', 'rm', '--force', image], { stdio: 'ignore' });
  } catch {
    // The image may not exist when build fails.
  }
  await rm(workdir, { recursive: true, force: true });
}
