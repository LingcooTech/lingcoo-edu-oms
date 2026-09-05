#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('Usage: pnpm generate:module <module-name>');
  process.exit(1);
}

const className = name
  .split('-')
  .map((part) => part[0].toUpperCase() + part.slice(1))
  .join('');
const root = process.env.TS_FASTIFY_MODULE_ROOT
  ? resolve(process.env.TS_FASTIFY_MODULE_ROOT)
  : resolve(import.meta.dirname, '..');
const directory = join(root, 'apps/server/src/modules', name);
const files = {
  'domain/status.ts': `export interface ${className}Status {\n  module: '${name}';\n  status: 'ok';\n}\n`,
  'application/service.ts': `import type { ${className}Status } from '../domain/status.js';\n\nexport class ${className}Service {\n  status(): ${className}Status {\n    return { module: '${name}', status: 'ok' };\n  }\n}\n`,
  'api/routes.ts': `import type { FastifyPluginAsync } from 'fastify';\n\nimport type { ${className}Service } from '../application/service.js';\n\nexport function create${className}Routes(service: ${className}Service): FastifyPluginAsync {\n  return async function ${name.replaceAll('-', '')}Routes(app) {\n    app.get('/api/${name}/status', async () => service.status());\n  };\n}\n`,
  'infrastructure/persistence/status.schema.ts': `// Add Drizzle tables owned by ${name} here.\nexport {};\n`,
  'infrastructure/persistence/index.ts': `export * from './status.schema.js';\n`,
  'plugin.ts': `import type { FastifyPluginAsync } from 'fastify';\n\nimport { create${className}Routes } from './api/routes.js';\nimport { ${className}Service } from './application/service.js';\n\nexport function create${className}Module(): FastifyPluginAsync {\n  const service = new ${className}Service();\n  return async function ${name.replaceAll('-', '')}Module(app) {\n    await app.register(create${className}Routes(service));\n  };\n}\n`,
  'public.ts': `export { create${className}Module } from './plugin.js';\nexport type { ${className}Status } from './domain/status.js';\n`,
};

await mkdir(directory, { recursive: false });
for (const [file, content] of Object.entries(files)) {
  const path = join(directory, file);
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, content);
}

console.log(`created apps/server/src/modules/${name}`);
console.log(`register create${className}Module() in apps/server/src/modules/index.ts`);
console.log(`export ${name} persistence schemas from apps/server/src/database/database.schema.ts`);
