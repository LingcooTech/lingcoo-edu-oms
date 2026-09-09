import { createHash } from 'node:crypto';

export const TOOL_VERSION = '1.1.0';
export const RUNTIME_ROLE_KEYS = Object.freeze(['admin', 'institution_admin', 'teacher', 'parent']);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_PASSWORD_PATTERN = /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized.length > 320 || !EMAIL_PATTERN.test(normalized)) return null;
  return normalized;
}

/**
 * Normalize mainland China mobile numbers to E.164. Separators commonly used
 * for display are accepted; extensions, landlines, and ambiguous local numbers
 * are rejected rather than guessed.
 */
export function normalizeChinaPhone(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  let compact = String(value)
    .trim()
    .replace(/[\s()-]/g, '');
  if (compact.startsWith('0086')) compact = compact.slice(4);
  else if (compact.startsWith('+86')) compact = compact.slice(3);
  else if (compact.startsWith('86') && compact.length === 13) compact = compact.slice(2);
  if (!/^1[3-9]\d{9}$/.test(compact)) return null;
  return `+86${compact}`;
}

export function isLegacyPasswordHash(value) {
  return typeof value === 'string' && LEGACY_PASSWORD_PATTERN.test(value);
}

export function stableDigest(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(',')}}`;
}

function iso(value) {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function sameDate(left, right) {
  return iso(left) === iso(right);
}

function addIssue(collection, code, subjectType, subjectId, extra = {}) {
  collection.push({ code, subjectType, subjectId: subjectId ?? null, ...extra });
}

function duplicateGroups(records, field) {
  const groups = new Map();
  for (const record of records) {
    const value = record[field];
    if (!value) continue;
    const ids = groups.get(value) ?? [];
    ids.push(record.id);
    groups.set(value, ids);
  }
  return [...groups.values()].filter((ids) => ids.length > 1);
}

function expectedUser(account) {
  return {
    id: account.id,
    email: normalizeEmail(account.email),
    phone: normalizeChinaPhone(account.phone),
    displayName: account.displayName,
    status: account.status === 'suspended' ? 'disabled' : account.status,
    mustChangePassword: Boolean(account.mustChangePassword),
    emailVerifiedAt: iso(account.emailVerifiedAt),
    createdAt: iso(account.createdAt),
    updatedAt: iso(account.updatedAt),
  };
}

function sameUser(actual, expected) {
  return (
    actual.id === expected.id &&
    actual.email === expected.email &&
    actual.phone === expected.phone &&
    actual.displayName === expected.displayName &&
    actual.status === expected.status &&
    Boolean(actual.mustChangePassword) === expected.mustChangePassword &&
    sameDate(actual.emailVerifiedAt, expected.emailVerifiedAt) &&
    sameDate(actual.createdAt, expected.createdAt) &&
    sameDate(actual.updatedAt, expected.updatedAt)
  );
}

function sameLegacyLink(actual, account) {
  return (
    actual.userId === account.id &&
    actual.source === 'legacy-edu' &&
    actual.legacyAccountId === account.id &&
    actual.legacyRole === account.role &&
    actual.legacyTeacherId === account.teacherId &&
    actual.legacyGuardianId === account.guardianId
  );
}

function validUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function educationMapping(assignment) {
  const common = {
    id: assignment.id,
    userId: assignment.accountId,
    role: assignment.role,
    institutionId: assignment.institutionId,
    teacherId: assignment.teacherId,
    guardianId: assignment.guardianId,
    teacherCapabilities: assignment.teacherPermissions ?? {},
    active: assignment.status === 'active',
    createdAt: iso(assignment.createdAt),
    updatedAt: iso(assignment.updatedAt),
  };
  if (
    assignment.role === 'institution_admin' &&
    validUuid(assignment.institutionId) &&
    !assignment.teacherId &&
    !assignment.guardianId
  ) {
    return common;
  }
  if (
    assignment.role === 'teacher' &&
    validUuid(assignment.institutionId) &&
    validUuid(assignment.teacherId) &&
    !assignment.guardianId
  ) {
    return common;
  }
  if (
    assignment.role === 'parent' &&
    validUuid(assignment.institutionId) &&
    validUuid(assignment.guardianId) &&
    !assignment.teacherId
  ) {
    return common;
  }
  return null;
}

function sameEducationAssignment(actual, expected) {
  return (
    actual.id === expected.id &&
    actual.userId === expected.userId &&
    actual.role === expected.role &&
    actual.institutionId === expected.institutionId &&
    actual.teacherId === expected.teacherId &&
    actual.guardianId === expected.guardianId &&
    stableDigest(actual.teacherCapabilities ?? {}) === stableDigest(expected.teacherCapabilities) &&
    Boolean(actual.active) === expected.active &&
    sameDate(actual.createdAt, expected.createdAt) &&
    sameDate(actual.updatedAt, expected.updatedAt)
  );
}

function educationTargetIssue(mapping, directory) {
  if (!directory) return null;
  const institution = directory.institutions.find((row) => row.id === mapping.institutionId);
  if (!institution || institution.status !== 'active') return 'TARGET_INSTITUTION_PROFILE_MISSING';
  if (mapping.role === 'institution_admin') return null;
  if (mapping.role === 'teacher') {
    const teacher = directory.teachers.find(
      (row) =>
        row.id === mapping.teacherId &&
        row.institutionId === mapping.institutionId &&
        row.status === 'active' &&
        row.relationshipStatus === 'active' &&
        row.identityUserId === mapping.userId,
    );
    return teacher ? null : 'TARGET_TEACHER_PROFILE_RELATIONSHIP_MISSING';
  }
  const guardian = directory.guardians.find(
    (row) =>
      row.id === mapping.guardianId &&
      row.institutionId === mapping.institutionId &&
      row.status === 'active' &&
      row.bindingStatus === 'active' &&
      row.verificationStatus === 'verified' &&
      row.studentStatus === 'active' &&
      row.studentInstitutionStatus === 'active' &&
      row.identityUserId === mapping.userId,
  );
  return guardian ? null : 'TARGET_GUARDIAN_VERIFIED_RELATIONSHIP_MISSING';
}

export function accountSnapshotDigest(account) {
  return stableDigest({
    id: account.id,
    role: account.role,
    email: account.email,
    phone: account.phone,
    passwordHash: account.passwordHash,
    displayName: account.displayName,
    status: account.status,
    mustChangePassword: account.mustChangePassword,
    emailVerifiedAt: iso(account.emailVerifiedAt),
    guardianId: account.guardianId,
    teacherId: account.teacherId,
    createdAt: iso(account.createdAt),
    updatedAt: iso(account.updatedAt),
  });
}

export function roleAssignmentDigest(assignment) {
  return stableDigest({
    ...assignment,
    createdAt: iso(assignment.createdAt),
    updatedAt: iso(assignment.updatedAt),
  });
}

export function wechatIdentityDigest(identity) {
  return stableDigest({
    ...identity,
    createdAt: iso(identity.createdAt),
    updatedAt: iso(identity.updatedAt),
  });
}

export function sourceSnapshotDigest(source) {
  return stableDigest({
    accounts: [...source.accounts]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(accountSnapshotDigest),
    roleAssignments: [...source.roleAssignments]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(roleAssignmentDigest),
    wechatIdentities: [...source.wechatIdentities]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(wechatIdentityDigest),
  });
}

export function planMigration(source, target = {}, options = {}) {
  const blockers = [...(options.schemaBlockers ?? [])];
  const roleIncompletes = [];
  const exceptions = [];
  const accounts = source.accounts.map((account) => ({
    ...account,
    normalizedEmail: normalizeEmail(account.email),
    normalizedPhone: normalizeChinaPhone(account.phone),
  }));
  const sourceAccountIds = new Set(accounts.map((account) => account.id));
  const targetUsers = target.users ?? [];
  const targetCredentials = target.credentials ?? [];
  const targetLegacyLinks = target.legacyLinks ?? [];
  const targetRoles = target.accessRoles ?? [];
  const targetUserRoles = target.userRoles ?? [];
  const targetEducationAssignments = target.educationAssignments ?? [];
  const usersById = new Map(targetUsers.map((user) => [user.id, user]));
  const credentialsById = new Map(targetCredentials.map((row) => [row.userId, row]));
  const usersByEmail = new Map(
    targetUsers.filter((row) => row.email).map((row) => [row.email, row]),
  );
  const usersByPhone = new Map(
    targetUsers.filter((row) => row.phone).map((row) => [row.phone, row]),
  );
  const legacyLinksBySourceAccount = new Map(
    targetLegacyLinks.map((row) => [`${row.source}:${row.legacyAccountId}`, row]),
  );
  const legacyLinksById = new Map(targetLegacyLinks.map((row) => [row.id, row]));
  const accessRolesByKey = new Map(targetRoles.map((row) => [row.key, row]));
  const targetUserRoleKeys = new Set(targetUserRoles.map((row) => `${row.userId}:${row.roleId}`));
  const educationById = new Map(targetEducationAssignments.map((row) => [row.id, row]));
  const educationByScope = new Map(
    targetEducationAssignments.map((row) => [
      `${row.userId}:${row.role}:${row.institutionId}`,
      row,
    ]),
  );
  const actions = [];
  const roleActions = [];
  const requestedUserRoles = new Map();
  const educationActions = [];
  const assignmentsByAccount = new Map();

  const requestUserRole = (userId, roleKey, evidence) => {
    const role = accessRolesByKey.get(roleKey);
    if (!role) {
      addIssue(blockers, 'TARGET_RUNTIME_ROLE_MISSING', 'account', userId, { roleKey });
      return null;
    }
    if (roleKey === 'system.owner') {
      throw new Error('Internal safety violation: migration attempted to request system.owner');
    }
    const key = `${userId}:${roleKey}`;
    const existing = requestedUserRoles.get(key);
    if (existing) {
      existing.evidence.push(evidence);
      return existing;
    }
    const action = {
      userId,
      roleKey,
      roleId: role.id,
      state: targetUserRoleKeys.has(`${userId}:${role.id}`) ? 'present' : 'insert',
      evidence: [evidence],
    };
    requestedUserRoles.set(key, action);
    return action;
  };

  for (const account of accounts) {
    if (!UUID_PATTERN.test(account.id)) {
      addIssue(blockers, 'INVALID_ACCOUNT_UUID', 'account', account.id);
    }
    if (!RUNTIME_ROLE_KEYS.includes(account.role)) {
      addIssue(blockers, 'UNSUPPORTED_ACCOUNT_ROLE', 'account', account.id, {
        sourceRole: account.role,
      });
    }
    if (account.email && !account.normalizedEmail) {
      addIssue(blockers, 'INVALID_EMAIL', 'account', account.id, { field: 'email' });
    }
    if (account.phone && !account.normalizedPhone) {
      addIssue(blockers, 'INVALID_CHINA_PHONE', 'account', account.id, { field: 'phone' });
    }
    if (!account.normalizedEmail && !account.normalizedPhone) {
      addIssue(blockers, 'ABSENT_LOGIN_IDENTIFIER', 'account', account.id);
    }
    if (!isLegacyPasswordHash(account.passwordHash)) {
      addIssue(blockers, 'UNSUPPORTED_LEGACY_PASSWORD_HASH', 'account', account.id, {
        field: 'passwordHash',
      });
    }
    if (!['active', 'suspended'].includes(account.status)) {
      addIssue(blockers, 'UNSUPPORTED_ACCOUNT_STATUS', 'account', account.id, { field: 'status' });
    }
    if (!iso(account.createdAt) || !iso(account.updatedAt)) {
      addIssue(blockers, 'INVALID_ACCOUNT_TIMESTAMP', 'account', account.id);
    }
    for (const [field, value] of [
      ['guardianId', account.guardianId],
      ['teacherId', account.teacherId],
    ]) {
      if (value && !validUuid(value)) {
        addIssue(blockers, 'INVALID_ACCOUNT_PROFILE_UUID', 'account', account.id, { field });
      }
    }
    if (account.displayName !== null && String(account.displayName).length > 120) {
      addIssue(blockers, 'DISPLAY_NAME_TOO_LONG', 'account', account.id, { field: 'displayName' });
    }

    if (account.guardianId || account.teacherId) {
      addIssue(exceptions, 'ACCOUNT_PROFILE_REFERENCE_STAGED', 'account', account.id, {
        fields: [
          account.guardianId ? 'guardianId' : null,
          account.teacherId ? 'teacherId' : null,
        ].filter(Boolean),
      });
    }
    addIssue(exceptions, 'PASSWORD_CHANGED_AT_INFERRED_FROM_UPDATED_AT', 'account', account.id);

    const expected = expectedUser(account);
    const byId = usersById.get(account.id);
    const emailOwner = expected.email ? usersByEmail.get(expected.email) : null;
    const phoneOwner = expected.phone ? usersByPhone.get(expected.phone) : null;
    if (emailOwner && emailOwner.id !== account.id) {
      addIssue(blockers, 'TARGET_EMAIL_OWNED_BY_OTHER_UUID', 'account', account.id, {
        conflictingId: emailOwner.id,
      });
    }
    if (phoneOwner && phoneOwner.id !== account.id) {
      addIssue(blockers, 'TARGET_PHONE_OWNED_BY_OTHER_UUID', 'account', account.id, {
        conflictingId: phoneOwner.id,
      });
    }
    if (byId && !sameUser(byId, expected)) {
      addIssue(blockers, 'TARGET_USER_UUID_CONTENT_MISMATCH', 'account', account.id);
    }
    const credential = credentialsById.get(account.id);
    if (credential && credential.passwordHash !== account.passwordHash) {
      addIssue(blockers, 'TARGET_CREDENTIAL_HASH_MISMATCH', 'account', account.id);
    }
    const legacyLink = legacyLinksBySourceAccount.get(`legacy-edu:${account.id}`);
    const legacyLinkById = legacyLinksById.get(account.id);
    if (
      legacyLinkById &&
      (legacyLinkById.source !== 'legacy-edu' || legacyLinkById.legacyAccountId !== account.id)
    ) {
      addIssue(blockers, 'TARGET_LEGACY_LINK_UUID_OWNED_BY_OTHER_SOURCE', 'account', account.id);
    }
    if (legacyLink && !sameLegacyLink(legacyLink, account)) {
      addIssue(blockers, 'TARGET_LEGACY_LINK_MISMATCH', 'account', account.id);
    }
    actions.push({
      accountId: account.id,
      user: byId ? (sameUser(byId, expected) ? 'present' : 'blocked') : 'insert',
      credential: credential
        ? credential.passwordHash === account.passwordHash
          ? 'present'
          : 'blocked'
        : 'insert',
      expected,
      legacyLink: legacyLink
        ? sameLegacyLink(legacyLink, account)
          ? 'present'
          : 'blocked'
        : 'insert',
      primaryRoleDisposition: 'pending',
    });
  }

  for (const ids of duplicateGroups(accounts, 'id')) {
    addIssue(blockers, 'DUPLICATE_ACCOUNT_UUID', 'source', null, { accountIds: ids.sort() });
  }

  for (const ids of duplicateGroups(accounts, 'normalizedEmail')) {
    addIssue(blockers, 'DUPLICATE_NORMALIZED_EMAIL', 'source', null, { accountIds: ids.sort() });
  }
  for (const ids of duplicateGroups(accounts, 'normalizedPhone')) {
    addIssue(blockers, 'DUPLICATE_NORMALIZED_PHONE', 'source', null, { accountIds: ids.sort() });
  }

  for (const assignment of source.roleAssignments) {
    const accountAssignments = assignmentsByAccount.get(assignment.accountId) ?? [];
    accountAssignments.push(assignment);
    assignmentsByAccount.set(assignment.accountId, accountAssignments);
    if (!UUID_PATTERN.test(assignment.id)) {
      addIssue(blockers, 'INVALID_ROLE_ASSIGNMENT_UUID', 'roleAssignment', assignment.id);
    }
    if (!sourceAccountIds.has(assignment.accountId)) {
      addIssue(blockers, 'ORPHAN_ROLE_ASSIGNMENT', 'roleAssignment', assignment.id, {
        accountId: assignment.accountId,
      });
    }
    if (!RUNTIME_ROLE_KEYS.includes(assignment.role)) {
      addIssue(blockers, 'UNSUPPORTED_ROLE_ASSIGNMENT_ROLE', 'roleAssignment', assignment.id, {
        sourceRole: assignment.role,
      });
    }
    if (!['active', 'suspended'].includes(assignment.status)) {
      addIssue(blockers, 'UNSUPPORTED_ROLE_ASSIGNMENT_STATUS', 'roleAssignment', assignment.id);
    }
    if (!iso(assignment.createdAt) || !iso(assignment.updatedAt)) {
      addIssue(blockers, 'INVALID_ROLE_ASSIGNMENT_TIMESTAMP', 'roleAssignment', assignment.id);
    }
    for (const [field, value] of [
      ['institutionId', assignment.institutionId],
      ['guardianId', assignment.guardianId],
      ['teacherId', assignment.teacherId],
    ]) {
      if (value && !validUuid(value)) {
        addIssue(blockers, 'INVALID_ROLE_REFERENCE_UUID', 'roleAssignment', assignment.id, {
          field,
        });
      }
    }
    if (
      !assignment.teacherPermissions ||
      typeof assignment.teacherPermissions !== 'object' ||
      Array.isArray(assignment.teacherPermissions)
    ) {
      addIssue(blockers, 'INVALID_TEACHER_PERMISSIONS', 'roleAssignment', assignment.id);
    }

    const stagedAction = {
      assignmentId: assignment.id,
      accountId: assignment.accountId,
      roleKey: assignment.role,
      disposition: 'pending',
    };
    roleActions.push(stagedAction);
    const mappedEducation = educationMapping(assignment);
    if (assignment.role === 'admin') {
      if (assignment.institutionId || assignment.teacherId || assignment.guardianId) {
        addIssue(
          exceptions,
          'ADMIN_ASSIGNMENT_EXTRA_SCOPE_STAGED',
          'roleAssignment',
          assignment.id,
        );
      }
      if (assignment.status === 'active') {
        requestUserRole(assignment.accountId, 'admin', `assignment:${assignment.id}`);
        stagedAction.disposition = 'mapped_runtime_role';
      } else {
        stagedAction.disposition = 'inactive_not_granted';
        addIssue(exceptions, 'SUSPENDED_ROLE_NOT_GRANTED', 'roleAssignment', assignment.id);
      }
    } else if (mappedEducation) {
      stagedAction.disposition =
        assignment.status === 'active' ? 'mapped_education_active' : 'mapped_education_inactive';
      const targetIssue = educationTargetIssue(mappedEducation, target.educationDirectory);
      if (targetIssue) {
        addIssue(roleIncompletes, targetIssue, 'roleAssignment', assignment.id);
        if (assignment.role === 'institution_admin') {
          addIssue(
            exceptions,
            'INSTITUTION_ADMIN_NOT_GLOBAL_OWNER',
            'roleAssignment',
            assignment.id,
          );
        }
        continue;
      }
      const byId = educationById.get(assignment.id);
      const byScope = educationByScope.get(
        `${mappedEducation.userId}:${mappedEducation.role}:${mappedEducation.institutionId}`,
      );
      if (byId && !sameEducationAssignment(byId, mappedEducation)) {
        addIssue(
          blockers,
          'TARGET_EDUCATION_ASSIGNMENT_UUID_MISMATCH',
          'roleAssignment',
          assignment.id,
        );
      }
      if (byScope && byScope.id !== assignment.id) {
        addIssue(
          blockers,
          'TARGET_EDUCATION_ASSIGNMENT_SCOPE_COLLISION',
          'roleAssignment',
          assignment.id,
          { conflictingId: byScope.id },
        );
      }
      const educationAction = {
        assignmentId: assignment.id,
        state:
          (byId && !sameEducationAssignment(byId, mappedEducation)) ||
          (byScope && byScope.id !== assignment.id)
            ? 'blocked'
            : byId
              ? 'present'
              : 'insert',
        expected: mappedEducation,
      };
      educationActions.push(educationAction);
      if (assignment.status === 'active') {
        requestUserRole(assignment.accountId, assignment.role, `assignment:${assignment.id}`);
      } else {
        addIssue(exceptions, 'SUSPENDED_ROLE_NOT_GRANTED', 'roleAssignment', assignment.id);
      }
      if (assignment.role === 'institution_admin') {
        addIssue(
          exceptions,
          'INSTITUTION_ADMIN_SCOPED_NOT_GLOBAL_OWNER',
          'roleAssignment',
          assignment.id,
          {
            institutionId: assignment.institutionId,
          },
        );
      }
    } else {
      stagedAction.disposition = 'incomplete_missing_scope_or_profile';
      addIssue(
        roleIncompletes,
        'ROLE_ASSIGNMENT_SCOPE_OR_PROFILE_INCOMPLETE',
        'roleAssignment',
        assignment.id,
      );
      if (assignment.role === 'institution_admin') {
        addIssue(
          exceptions,
          'INSTITUTION_ADMIN_NOT_GLOBAL_OWNER',
          'roleAssignment',
          assignment.id,
          {
            institutionId: assignment.institutionId ?? null,
          },
        );
      }
    }
    if (assignment.guardianId || assignment.teacherId) {
      addIssue(exceptions, 'ROLE_PROFILE_REFERENCE_STAGED', 'roleAssignment', assignment.id);
    }
  }

  for (const ids of duplicateGroups(source.roleAssignments, 'id')) {
    addIssue(blockers, 'DUPLICATE_ROLE_ASSIGNMENT_UUID', 'source', null, {
      assignmentIds: ids.sort(),
    });
  }
  const roleEvidence = source.roleAssignments.map((assignment) => ({
    id: assignment.id,
    composite: `${assignment.accountId}:${assignment.role}`,
  }));
  for (const ids of duplicateGroups(roleEvidence, 'composite')) {
    addIssue(blockers, 'DUPLICATE_ACCOUNT_ROLE_ASSIGNMENT', 'source', null, {
      assignmentIds: ids.sort(),
    });
  }

  // Legacy runtime semantics treat explicit assignment rows as authoritative.
  // accounts.role is only a fallback when the account has no assignment rows.
  for (const account of accounts) {
    const accountAction = actions.find((action) => action.accountId === account.id);
    const assignments = assignmentsByAccount.get(account.id) ?? [];
    if (assignments.length > 0) {
      const primary = assignments.find((assignment) => assignment.role === account.role);
      accountAction.primaryRoleDisposition = primary
        ? 'assignment_authoritative'
        : 'ignored_not_in_assignment_set';
      addIssue(exceptions, 'ACCOUNT_ROLE_MERGED_FROM_ASSIGNMENTS', 'account', account.id, {
        sourceRole: account.role,
        representedByAssignment: Boolean(primary),
        assignmentCount: assignments.length,
      });
      continue;
    }
    if (account.role === 'admin') {
      requestUserRole(account.id, 'admin', `account:${account.id}`);
      accountAction.primaryRoleDisposition = 'mapped_global_admin_fallback';
      addIssue(exceptions, 'ACCOUNT_ROLE_FALLBACK_USED', 'account', account.id, {
        sourceRole: account.role,
      });
    } else {
      accountAction.primaryRoleDisposition = 'incomplete_missing_scope_or_profile';
      addIssue(
        roleIncompletes,
        'ACCOUNT_ROLE_FALLBACK_SCOPE_OR_PROFILE_INCOMPLETE',
        'account',
        account.id,
        { sourceRole: account.role },
      );
    }
  }

  for (const identity of source.wechatIdentities) {
    if (!UUID_PATTERN.test(identity.id)) {
      addIssue(blockers, 'INVALID_WECHAT_IDENTITY_UUID', 'wechatIdentity', identity.id);
    }
    if (!sourceAccountIds.has(identity.accountId)) {
      addIssue(blockers, 'ORPHAN_WECHAT_IDENTITY', 'wechatIdentity', identity.id, {
        accountId: identity.accountId,
      });
    }
    if (!identity.appId || !identity.openid) {
      addIssue(blockers, 'WECHAT_IDENTITY_REQUIRED_VALUE_MISSING', 'wechatIdentity', identity.id);
    }
    if (
      String(identity.appId ?? '').length > 80 ||
      String(identity.openid ?? '').length > 128 ||
      String(identity.unionid ?? '').length > 128
    ) {
      addIssue(blockers, 'WECHAT_IDENTITY_VALUE_TOO_LONG', 'wechatIdentity', identity.id);
    }
    if (!iso(identity.createdAt) || !iso(identity.updatedAt)) {
      addIssue(blockers, 'INVALID_WECHAT_IDENTITY_TIMESTAMP', 'wechatIdentity', identity.id);
    }
    addIssue(exceptions, 'WECHAT_IDENTITY_STAGED_NOT_INTEGRATED', 'wechatIdentity', identity.id);
  }
  for (const ids of duplicateGroups(source.wechatIdentities, 'id')) {
    addIssue(blockers, 'DUPLICATE_WECHAT_IDENTITY_UUID', 'source', null, {
      identityIds: ids.sort(),
    });
  }

  for (const field of ['appOpenid', 'accountApp']) {
    const evidence = source.wechatIdentities.map((identity) => ({
      id: identity.id,
      [field]:
        field === 'appOpenid'
          ? `${identity.appId}:${identity.openid}`
          : `${identity.accountId}:${identity.appId}`,
    }));
    for (const ids of duplicateGroups(evidence, field)) {
      addIssue(
        blockers,
        field === 'appOpenid' ? 'DUPLICATE_WECHAT_APP_OPENID' : 'DUPLICATE_WECHAT_ACCOUNT_APP',
        'source',
        null,
        { identityIds: ids.sort() },
      );
    }
  }

  const result = {
    blockers,
    roleIncompletes,
    exceptions,
    actions,
    roleActions,
    userRoleActions: [...requestedUserRoles.values()],
    educationActions,
    sourceDigest: sourceSnapshotDigest(source),
    readyToApply: false,
  };
  if (target.staging?.exists) {
    blockers.push(...verifyStaging(source, target.staging, result));
  }
  result.readyToApply = blockers.length === 0;
  return result;
}

export function verifyStaging(source, staging, plan = null) {
  const failures = [];
  const accounts = new Map((staging.accounts ?? []).map((row) => [row.sourceAccountId, row]));
  const assignments = new Map(
    (staging.roleAssignments ?? []).map((row) => [row.sourceAssignmentId, row]),
  );
  const identities = new Map(
    (staging.wechatIdentities ?? []).map((row) => [row.sourceIdentityId, row]),
  );

  for (const account of source.accounts) {
    const staged = accounts.get(account.id);
    if (!staged) addIssue(failures, 'MISSING_STAGED_ACCOUNT', 'account', account.id);
    else if (staged.sourceDigest !== accountSnapshotDigest(account)) {
      addIssue(failures, 'STAGED_ACCOUNT_DIGEST_MISMATCH', 'account', account.id);
    } else {
      const expected = plan?.actions.find((action) => action.accountId === account.id);
      if (expected && staged.primaryRoleDisposition !== expected.primaryRoleDisposition) {
        addIssue(failures, 'STAGED_ACCOUNT_ROLE_DISPOSITION_MISMATCH', 'account', account.id);
      }
    }
  }
  for (const assignment of source.roleAssignments) {
    const staged = assignments.get(assignment.id);
    if (!staged)
      addIssue(failures, 'MISSING_STAGED_ROLE_ASSIGNMENT', 'roleAssignment', assignment.id);
    else if (staged.sourceDigest !== roleAssignmentDigest(assignment)) {
      addIssue(failures, 'STAGED_ROLE_ASSIGNMENT_DIGEST_MISMATCH', 'roleAssignment', assignment.id);
    } else {
      const expected = plan?.roleActions.find((action) => action.assignmentId === assignment.id);
      if (expected && staged.disposition !== expected.disposition) {
        addIssue(
          failures,
          'STAGED_ROLE_ASSIGNMENT_DISPOSITION_MISMATCH',
          'roleAssignment',
          assignment.id,
        );
      }
    }
  }
  for (const identity of source.wechatIdentities) {
    const staged = identities.get(identity.id);
    if (!staged)
      addIssue(failures, 'MISSING_STAGED_WECHAT_IDENTITY', 'wechatIdentity', identity.id);
    else if (staged.sourceDigest !== wechatIdentityDigest(identity)) {
      addIssue(failures, 'STAGED_WECHAT_IDENTITY_DIGEST_MISMATCH', 'wechatIdentity', identity.id);
    }
  }
  return failures;
}

export function summarizeIssues(issues) {
  const counts = {};
  for (const issue of issues) counts[issue.code] = (counts[issue.code] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function publicReport({ command, plan, source, targetFingerprint, stagingFailures = [] }) {
  const userActions = plan.actions.map((action) => action.user);
  const credentialActions = plan.actions.map((action) => action.credential);
  const legacyLinkActions = plan.actions.map((action) => action.legacyLink);
  const report = {
    formatVersion: 2,
    toolVersion: TOOL_VERSION,
    command,
    generatedAt: new Date().toISOString(),
    targetFingerprint,
    sourceDigest: plan.sourceDigest,
    sourceCounts: {
      accounts: source.accounts.length,
      roleAssignments: source.roleAssignments.length,
      wechatIdentities: source.wechatIdentities.length,
    },
    plan: {
      readyToApply: plan.readyToApply,
      blockerCount: plan.blockers.length,
      blockers: plan.blockers,
      roleIncompleteCount: plan.roleIncompletes.length,
      roleIncompletes: plan.roleIncompletes,
      exceptionCount: plan.exceptions.length,
      exceptionCounts: summarizeIssues(plan.exceptions),
      identityUsers: {
        insert: userActions.filter((value) => value === 'insert').length,
        present: userActions.filter((value) => value === 'present').length,
        blocked: userActions.filter((value) => value === 'blocked').length,
      },
      passwordCredentials: {
        insert: credentialActions.filter((value) => value === 'insert').length,
        present: credentialActions.filter((value) => value === 'present').length,
        blocked: credentialActions.filter((value) => value === 'blocked').length,
      },
      legacyLinks: {
        insert: legacyLinkActions.filter((value) => value === 'insert').length,
        present: legacyLinkActions.filter((value) => value === 'present').length,
        blocked: legacyLinkActions.filter((value) => value === 'blocked').length,
      },
      roleMappings: {
        accessUserRoles: {
          insert: plan.userRoleActions.filter((action) => action.state === 'insert').length,
          present: plan.userRoleActions.filter((action) => action.state === 'present').length,
        },
        educationAssignments: {
          insert: plan.educationActions.filter((action) => action.state === 'insert').length,
          present: plan.educationActions.filter((action) => action.state === 'present').length,
          blocked: plan.educationActions.filter((action) => action.state === 'blocked').length,
        },
        byRuntimeRole: Object.fromEntries(
          RUNTIME_ROLE_KEYS.map((roleKey) => [
            roleKey,
            plan.userRoleActions.filter((action) => action.roleKey === roleKey).length,
          ]),
        ),
        stagedIncomplete: plan.roleIncompletes.length,
        stagedInactive: plan.roleActions.filter(
          (action) =>
            action.disposition === 'inactive_not_granted' ||
            action.disposition === 'mapped_education_inactive',
        ).length,
      },
    },
    verification: {
      stagingFailureCount: stagingFailures.length,
      stagingFailures,
      identitiesVerified:
        plan.blockers.length === 0 &&
        plan.actions.every(
          (action) =>
            action.user === 'present' &&
            action.credential === 'present' &&
            action.legacyLink === 'present',
        ),
      safeRoleMappingsVerified:
        plan.blockers.length === 0 &&
        plan.userRoleActions.every((action) => action.state === 'present') &&
        plan.educationActions.every((action) => action.state === 'present'),
      roles: 'safe-mappings-applied; incomplete-mappings-staged',
      profiles: 'references-staged',
      wechat: 'staged-not-integrated',
      complete: false,
    },
  };
  assertReportContainsNoSecrets(report);
  return report;
}

export function assertReportContainsNoSecrets(value) {
  const serialized = JSON.stringify(value);
  const forbidden = [
    /postgres(?:ql)?:\/\//i,
    /password_hash/i,
    /passwordHash/,
    /scrypt:/i,
    /"(?:email|phone|openid|unionid|appId)"\s*:/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(serialized))
      throw new Error(`Report contains forbidden secret material: ${pattern}`);
  }
}
