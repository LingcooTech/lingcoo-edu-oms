#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { databaseFingerprint, databaseIdentity, databasesAreSame } from './identity-phase1-db.mjs';
import {
  planPeopleMigration,
  publicPeopleReport,
  PEOPLE_TOOL_VERSION,
} from './people-phase2-lib.mjs';
import {
  applyPeoplePlan,
  beginSourceSnapshot,
  createDatabaseClient,
  readPeopleSource,
  readTargetUserIds,
  targetPeopleCollisions,
  targetPeopleSchemaBlockers,
} from './people-phase2-db.mjs';

function parseArguments(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'plan';
  if (!['plan', 'apply'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const options = {
    command,
    apply: false,
    confirmTarget: null,
    reportPath: null,
    allowIncomplete: false,
  };
  while (args.length) {
    const value = args.shift();
    if (value === '--apply') options.apply = true;
    else if (value === '--confirm-target') options.confirmTarget = args.shift() ?? null;
    else if (value === '--report') options.reportPath = args.shift() ?? null;
    else if (value === '--allow-incomplete') options.allowIncomplete = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

async function emit(report, path) {
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (path) await writeFile(resolve(path), output, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(output);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === 'apply' && !options.apply)
    throw new Error('Refusing writes: apply also requires --apply');
  const sourceUrl = process.env.MIGRATION_SOURCE_DATABASE_URL;
  const targetUrl = process.env.MIGRATION_TARGET_DATABASE_URL;
  if (!sourceUrl || !targetUrl)
    throw new Error('MIGRATION_SOURCE_DATABASE_URL and MIGRATION_TARGET_DATABASE_URL are required');
  const source = createDatabaseClient(
    sourceUrl,
    `lingcoo-people-phase2-source-${PEOPLE_TOOL_VERSION}`,
  );
  const target = createDatabaseClient(
    targetUrl,
    `lingcoo-people-phase2-target-${PEOPLE_TOOL_VERSION}`,
  );

  try {
    await source.connect();
    await target.connect();
    const [sourceIdentity, targetIdentity] = await Promise.all([
      databaseIdentity(source),
      databaseIdentity(target),
    ]);
    if (databasesAreSame(sourceIdentity, targetIdentity, sourceUrl, targetUrl))
      throw new Error('Refusing migration because source and target are the same database');
    const targetFingerprint = databaseFingerprint(targetIdentity);
    await beginSourceSnapshot(source);
    const sourceData = await readPeopleSource(source);
    const schemaBlockers = await targetPeopleSchemaBlockers(target);
    const targetUserIds = schemaBlockers.length ? new Set() : await readTargetUserIds(target);
    const plan = planPeopleMigration(sourceData, { targetUserIds });
    plan.blockers.push(...schemaBlockers);
    if (!schemaBlockers.length)
      plan.blockers.push(...(await targetPeopleCollisions(target, plan.actions)));
    plan.readyToApply = plan.blockers.length === 0;
    const report = publicPeopleReport(plan, {
      command: options.command,
      targetFingerprint,
      applied: false,
    });

    if (options.command === 'plan') {
      await emit(report, options.reportPath);
    } else {
      if (!plan.readyToApply) throw new Error('Plan contains blockers; target was not changed');
      if (plan.incomplete.length && !options.allowIncomplete)
        throw new Error(
          'Plan contains quarantined or unresolved records; review and pass --allow-incomplete to acknowledge',
        );
      if (options.confirmTarget !== targetFingerprint)
        throw new Error(`Target confirmation mismatch; expected ${targetFingerprint}`);
      await applyPeoplePlan(target, plan.actions);
      await emit({ ...report, applied: true }, options.reportPath);
    }
  } finally {
    try {
      await source.query('ROLLBACK');
    } catch {
      // The source may not have connected or its read-only transaction may already be closed.
    }
    await Promise.allSettled([source.end(), target.end()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'People phase 2 migration failed');
  process.exitCode = 1;
});
