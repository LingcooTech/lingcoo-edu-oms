import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  profileTeachingResources,
  runTeachingResourcesPhase6,
} from './teaching-resources-phase6.mjs';

const execFileAsync = promisify(execFile);
const fixturePath = new URL('./teaching-resources-phase6.fixture.json', import.meta.url);

test('profiles all required legacy tables and classifies quality problems deterministically', async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const first = profileTeachingResources(fixture);
  const second = profileTeachingResources({
    ...fixture,
    campuses: [...fixture.campuses].reverse(),
    courses: [...fixture.courses].reverse(),
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first.tableCounts, {
    campuses: 2,
    classrooms: 2,
    courses: 2,
    classes: 1,
    class_enrollments: 1,
    class_sessions: 2,
    class_session_students: 1,
    teachers: 1,
    institutions: 2,
  });
  assert.equal(first.quality.names.classrooms.duplicateGroupCount, 1);
  assert.equal(first.quality.slugs.courses.duplicateGroupCount, 1);
  assert.equal(
    first.quality.orphanReferences.find((item) => item.relation === 'classrooms.campus_id')
      .orphanCount,
    1,
  );
  assert.equal(first.quality.campusConsistency.classClassroomCampusMismatch, 1);
  assert.equal(first.quality.institutionBoundaries.defaultTeacherInstitutionMismatch, 1);
  assert.equal(first.quality.billingBindings.classEnrollments.billingCourseIdCount, 1);
  assert.equal(first.quality.billingBindings.classSessionStudents.billingCourseContractIdCount, 1);
  assert.equal(first.quality.sessionResources.fullyBoundRequiredResources, 2);
  assert.deepEqual(first.quality.sessionResources.statusDistribution, {
    completed: 1,
    scheduled: 1,
  });
  assert.equal(first.conclusions.historicalDeferred.completedOrCancelledSessionCount, 1);
  assert.equal(first.conclusions.needsManualReview.findingCount > 0, true);
});

test('plan is fixture-supported, read-only, and never creates migration actions', async () => {
  const report = await runTeachingResourcesPhase6({
    command: 'plan',
    fixturePath: fixturePath.pathname,
  });
  assert.equal(report.plan.applySupported, false);
  assert.deepEqual(report.plan.actions, []);
  assert.equal(report.plan.sequence.length, 3);
});

test('CLI fixture output is stable JSON and does not leak a database URL', async () => {
  const secretUrl = 'postgresql://profile-user:profile-password@example.test:5432/legacy';
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      './scripts/migration/teaching-resources-phase6.mjs',
      'plan',
      '--fixture',
      fixturePath.pathname,
    ],
    {
      cwd: new URL('../..', import.meta.url).pathname,
      env: { ...process.env, MIGRATION_SOURCE_DATABASE_URL: secretUrl },
    },
  );
  assert.equal(stderr, '');
  const report = JSON.parse(stdout);
  assert.equal(report.mode, 'plan');
  assert.deepEqual(report.source, { kind: 'fixture', readOnly: true });
  assert.equal(stdout.includes(secretUrl), false);
  assert.equal(stdout.includes('profile-password'), false);
  assert.equal(stdout.includes('postgresql://'), false);
});

test('empty fixture produces complete zero-count report', () => {
  const report = profileTeachingResources({});
  assert.deepEqual(report.tableCounts, {
    campuses: 0,
    classrooms: 0,
    courses: 0,
    classes: 0,
    class_enrollments: 0,
    class_sessions: 0,
    class_session_students: 0,
    teachers: 0,
    institutions: 0,
  });
  assert.equal(report.conclusions.needsManualReview.findingCount, 0);
  assert.equal(report.conclusions.historicalDeferred.completedOrCancelledSessionCount, 0);
});
