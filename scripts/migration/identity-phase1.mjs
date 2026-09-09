#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  readEncryptedSourceArtifact,
  writeEncryptedSourceArtifact,
} from './identity-phase1-artifact.mjs';
import {
  assertReportContainsNoSecrets,
  planMigration,
  publicReport,
  TOOL_VERSION,
  verifyStaging,
} from './identity-phase1-lib.mjs';
import {
  applyPlan,
  beginSourceSnapshot,
  beginTargetApply,
  createDatabaseClient,
  databaseFingerprint,
  databaseIdentity,
  databasesAreSame,
  readSource,
  readTarget,
  targetSchemaBlockers,
} from './identity-phase1-db.mjs';

function usage() {
  return `Usage:
  node scripts/migration/identity-phase1.mjs export --output PATH
  node scripts/migration/identity-phase1.mjs [plan] [--report PATH]
  node scripts/migration/identity-phase1.mjs apply --apply --confirm-target FINGERPRINT [--allow-incomplete-roles] [--report PATH]
  node scripts/migration/identity-phase1.mjs verify [--report PATH]

Environment:
  MIGRATION_SOURCE_DATABASE_URL  Legacy database; every source transaction is READ ONLY.
  MIGRATION_TARGET_DATABASE_URL  Phase 1 target database.
  MIGRATION_SOURCE_EXPORT        Encrypted export to use instead of a live source URL.
  MIGRATION_EXPORT_KEY           Passphrase for encrypted source exports (16+ characters).

export requires a source URL and --output. plan/apply/verify accept either a source URL or export.
plan is the default. apply requires both --apply and the target fingerprint printed by plan.
If role evidence is incomplete, apply additionally requires --allow-incomplete-roles.
Reports never contain URLs, login identifiers, password hashes, or WeChat identifiers.`;
}

function parseArguments(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'plan';
  if (!['export', 'plan', 'apply', 'verify'].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  const options = {
    command,
    apply: false,
    confirmTarget: null,
    reportPath: null,
    outputPath: null,
    allowIncompleteRoles: false,
  };
  while (args.length > 0) {
    const argument = args.shift();
    if (argument === '--apply') options.apply = true;
    else if (argument === '--allow-incomplete-roles') options.allowIncompleteRoles = true;
    else if (argument === '--confirm-target') options.confirmTarget = args.shift() ?? null;
    else if (argument === '--report') options.reportPath = args.shift() ?? null;
    else if (argument === '--output') options.outputPath = args.shift() ?? null;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function emitReport(report, reportPath) {
  assertReportContainsNoSecrets(report);
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPath) {
    await writeFile(resolve(reportPath), output, { encoding: 'utf8', mode: 0o600 });
  }
  process.stdout.write(output);
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  console.error(usage());
  process.exit(64);
}
if (options.help) {
  console.log(usage());
  process.exit(0);
}
if (options.command === 'apply' && !options.apply) {
  console.error('Refusing target writes: the apply command also requires --apply.');
  process.exit(64);
}
if (options.command !== 'apply' && options.apply) {
  console.error('--apply is valid only with the apply command.');
  process.exit(64);
}
if (options.command !== 'apply' && options.allowIncompleteRoles) {
  console.error('--allow-incomplete-roles is valid only with the apply command.');
  process.exit(64);
}

const sourceUrl = process.env.MIGRATION_SOURCE_DATABASE_URL;
const targetUrl = process.env.MIGRATION_TARGET_DATABASE_URL;
const sourceExport = process.env.MIGRATION_SOURCE_EXPORT;
const exportKey = process.env.MIGRATION_EXPORT_KEY;
if (options.command === 'export' && (!sourceUrl || !options.outputPath || !exportKey)) {
  console.error(
    'export requires MIGRATION_SOURCE_DATABASE_URL, MIGRATION_EXPORT_KEY, and --output.',
  );
  process.exit(64);
}
if (options.command !== 'export' && ((!sourceUrl && !sourceExport) || !targetUrl)) {
  console.error(
    'A source URL or MIGRATION_SOURCE_EXPORT, plus MIGRATION_TARGET_DATABASE_URL, is required.',
  );
  process.exit(64);
}
if (sourceExport && !exportKey) {
  console.error('MIGRATION_EXPORT_KEY is required with MIGRATION_SOURCE_EXPORT.');
  process.exit(64);
}

const sourceClient = sourceUrl
  ? createDatabaseClient(sourceUrl, `lingcoo-identity-phase1-source-${TOOL_VERSION}`)
  : null;
const targetClient = targetUrl
  ? createDatabaseClient(targetUrl, `lingcoo-identity-phase1-target-${TOOL_VERSION}`)
  : null;
let sourceTransaction = false;
let targetTransaction = false;

try {
  if (options.command === 'export') {
    await sourceClient.connect();
    const sourceIdentity = await databaseIdentity(sourceClient);
    await beginSourceSnapshot(sourceClient);
    sourceTransaction = true;
    const source = await readSource(sourceClient);
    await writeEncryptedSourceArtifact(
      resolve(options.outputPath),
      {
        ...source,
        metadata: { sourceDatabaseFingerprint: databaseFingerprint(sourceIdentity) },
      },
      exportKey,
    );
    process.stdout.write(
      `${JSON.stringify({
        formatVersion: 1,
        command: 'export',
        encrypted: true,
        sourceCounts: {
          accounts: source.accounts.length,
          roleAssignments: source.roleAssignments.length,
          wechatIdentities: source.wechatIdentities.length,
        },
      })}\n`,
    );
    process.exitCode = 0;
  } else {
    await targetClient.connect();
    if (sourceClient) await sourceClient.connect();
    const targetIdentity = await databaseIdentity(targetClient);
    if (sourceClient) {
      const sourceIdentity = await databaseIdentity(sourceClient);
      if (databasesAreSame(sourceIdentity, targetIdentity, sourceUrl, targetUrl)) {
        throw new Error(
          'Refusing migration because source and target resolve to the same database.',
        );
      }
    }
    const targetFingerprint = databaseFingerprint(targetIdentity);

    let source;
    if (sourceExport) {
      source = await readEncryptedSourceArtifact(resolve(sourceExport), exportKey);
      if (!source.metadata?.sourceDatabaseFingerprint) {
        throw new Error('Encrypted source artifact lacks a database fingerprint; export it again.');
      }
      if (source.metadata.sourceDatabaseFingerprint === targetFingerprint) {
        throw new Error(
          'Refusing migration because the encrypted source and target are the same database.',
        );
      }
    } else {
      await beginSourceSnapshot(sourceClient);
      sourceTransaction = true;
      source = await readSource(sourceClient);
    }

    const schemaBlockers = await targetSchemaBlockers(targetClient);
    const target = schemaBlockers.length === 0 ? await readTarget(targetClient) : {};
    let plan = planMigration(source, target, { schemaBlockers });

    if (options.command === 'plan') {
      await emitReport(
        publicReport({ command: 'plan', plan, source, targetFingerprint }),
        options.reportPath,
      );
      if (!plan.readyToApply || plan.roleIncompletes.length > 0) process.exitCode = 2;
    } else if (options.command === 'apply') {
      if (options.confirmTarget !== targetFingerprint) {
        throw new Error(
          `Target confirmation mismatch. Run plan and pass --confirm-target ${targetFingerprint}`,
        );
      }
      if (
        !plan.readyToApply ||
        (plan.roleIncompletes.length > 0 && !options.allowIncompleteRoles)
      ) {
        await emitReport(
          publicReport({
            command: !plan.readyToApply ? 'apply-refused' : 'apply-refused-incomplete-roles',
            plan,
            source,
            targetFingerprint,
          }),
          options.reportPath,
        );
        process.exitCode = 2;
      } else {
        await beginTargetApply(targetClient);
        targetTransaction = true;
        const lockedSchemaBlockers = await targetSchemaBlockers(targetClient);
        const lockedTarget =
          lockedSchemaBlockers.length === 0 ? await readTarget(targetClient) : {};
        plan = planMigration(source, lockedTarget, { schemaBlockers: lockedSchemaBlockers });
        if (!plan.readyToApply)
          throw new Error('Target changed after planning; apply was aborted.');
        if (plan.roleIncompletes.length > 0 && !options.allowIncompleteRoles) {
          throw new Error('Role evidence became incomplete after planning; apply was aborted.');
        }
        await applyPlan(targetClient, source, plan);
        const appliedTarget = await readTarget(targetClient);
        const verificationPlan = planMigration(source, appliedTarget);
        const stagingFailures = verifyStaging(source, appliedTarget.staging, verificationPlan);
        if (
          verificationPlan.blockers.length > 0 ||
          verificationPlan.actions.some(
            (action) =>
              action.user !== 'present' ||
              action.credential !== 'present' ||
              action.legacyLink !== 'present',
          ) ||
          verificationPlan.userRoleActions.some((action) => action.state !== 'present') ||
          verificationPlan.educationActions.some((action) => action.state !== 'present') ||
          stagingFailures.length > 0
        ) {
          throw new Error('Post-apply verification failed; target transaction was rolled back.');
        }
        await targetClient.query('COMMIT');
        targetTransaction = false;
        await emitReport(
          publicReport({
            command: 'apply',
            plan: verificationPlan,
            source,
            targetFingerprint,
            stagingFailures,
          }),
          options.reportPath,
        );
        if (verificationPlan.roleIncompletes.length > 0) process.exitCode = 2;
      }
    } else {
      const stagingFailures = verifyStaging(source, target.staging ?? {}, plan);
      const report = publicReport({
        command: 'verify',
        plan,
        source,
        targetFingerprint,
        stagingFailures,
      });
      await emitReport(report, options.reportPath);
      if (
        !report.verification.identitiesVerified ||
        !report.verification.safeRoleMappingsVerified ||
        plan.roleIncompletes.length > 0 ||
        stagingFailures.length > 0
      ) {
        process.exitCode = 2;
      }
    }
  }
} catch (error) {
  if (targetTransaction) {
    try {
      await targetClient?.query('ROLLBACK');
    } catch {
      // Preserve the original failure.
    }
  }
  const safeMessage = String(error?.message ?? 'operation failed')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url-redacted]')
    .replace(/scrypt:[^\s"']+/gi, '[password-hash-redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[identifier-redacted]')
    .replace(/\+?86[1-9][0-9]{10}/g, '[identifier-redacted]');
  console.error(`identity phase 1 failed: ${safeMessage}`);
  process.exitCode = 1;
} finally {
  if (sourceTransaction) {
    try {
      await sourceClient?.query('ROLLBACK');
    } catch {
      // Connection shutdown is best-effort after a primary failure.
    }
  }
  await Promise.allSettled([sourceClient?.end(), targetClient?.end()].filter(Boolean));
}
