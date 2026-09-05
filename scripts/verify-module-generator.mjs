#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = await mkdtemp(join(tmpdir(), 'ts-fastify-module-generator-'));
const environment = { ...process.env, TS_FASTIFY_MODULE_ROOT: target };
const expectedFiles = [
  'plugin.ts',
  'public.ts',
  'api/routes.ts',
  'application/service.ts',
  'domain/status.ts',
  'infrastructure/persistence/index.ts',
  'infrastructure/persistence/status.schema.ts',
];

try {
  await mkdir(join(target, 'apps/server/src/modules'), { recursive: true });
  execFileSync(process.execPath, [join(root, 'scripts/generate-module.mjs'), 'sample'], {
    cwd: root,
    env: environment,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, [join(root, 'scripts/check-module-boundaries.mjs')], {
    cwd: root,
    env: environment,
    stdio: 'inherit',
  });
  for (const file of expectedFiles) {
    await access(join(target, 'apps/server/src/modules/sample', file));
  }
  console.log('module generator smoke test passed');
} finally {
  await rm(target, { recursive: true, force: true });
}
