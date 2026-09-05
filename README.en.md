# Lingcoo Edu Oms

A modular business application workspace built with native Fastify, TypeScript, PostgreSQL, Drizzle, React, Ant Design, and pnpm.

It provides API and Worker entry points, an independent Ant Design Admin, a separately built Web placeholder, framework-neutral Contracts and API Client packages, migrations, Docker, CI, quality gates, and a module generator. Common modules are implemented one at a time without shipping product or industry domains.

After publication, create an independent project with the version-matched npm generator:

```bash
npx @lingcoo-tech/create-ts-fastify-business-starter@latest my-business-app
```

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm dev
```

Run `pnpm check` for the local quality gate, `pnpm smoke:generated` for the packed CLI and generated project, and `pnpm e2e` for desktop/mobile Admin acceptance. See the Chinese [README](README.md) and the documents under `docs/` for the architecture and delivery conventions.

Licensed under Apache-2.0.
