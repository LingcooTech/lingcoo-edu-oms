const baseUrl = process.env.PREVIEW_API_BASE_URL ?? 'http://127.0.0.1:18090';
const ownerEmail = process.env.BOOTSTRAP_OWNER_EMAIL;
const ownerPassword = process.env.BOOTSTRAP_OWNER_PASSWORD;
const teacherEmail = process.env.PREVIEW_TEACHER_EMAIL ?? 'teacher@lingcoo.local';
const teacherPassword = process.env.PREVIEW_TEACHER_PASSWORD ?? 'Lingcoo-Teacher-2026!';

if (!ownerEmail || !ownerPassword) throw new Error('Missing preview owner credentials');

async function json(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identifier: ownerEmail, password: ownerPassword }),
});
const login = await json(loginResponse);
const cookie = loginResponse.headers
  .getSetCookie()
  .map((value) => value.split(';', 1)[0])
  .join('; ');

async function ownerRequest(path, options = {}) {
  return json(
    await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        accept: 'application/json',
        cookie,
        'content-type': 'application/json',
        ...(options.method && options.method !== 'GET' ? { 'x-csrf-token': login.csrfToken } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
}

const roles = await ownerRequest('/api/access/roles');
const teacherRole = roles.items.find((item) => item.key === 'teacher');
if (!teacherRole) throw new Error('Teacher role is missing');

const existingUsers = await ownerRequest(
  `/api/access/users?page=1&pageSize=20&search=${encodeURIComponent(teacherEmail)}`,
);
let teacherUser = existingUsers.items.find((item) => item.email === teacherEmail);
if (!teacherUser) {
  teacherUser = await ownerRequest('/api/access/users', {
    method: 'POST',
    body: {
      email: teacherEmail,
      password: teacherPassword,
      displayName: '演示点名教师',
      mustChangePassword: false,
      roleIds: [teacherRole.id],
    },
  });
}

const institutionsPage = await ownerRequest(
  `/api/institutions?page=1&pageSize=100&search=${encodeURIComponent('教师工作台演示机构')}`,
);
let institution = institutionsPage.items.find((item) => item.name === '教师工作台演示机构');
if (!institution) {
  institution = await ownerRequest('/api/institutions', {
    method: 'POST',
    body: { name: '教师工作台演示机构', type: 'self_operated' },
  });
}

const teachers = await ownerRequest(`/api/institutions/${institution.id}/teachers`);
let teacher = teachers.items.find((item) => item.identityUserId === teacherUser.id);
if (!teacher) {
  teacher = await ownerRequest(`/api/institutions/${institution.id}/teachers`, {
    method: 'POST',
    body: { fullName: '演示点名教师', identityUserId: teacherUser.id },
  });
}

await ownerRequest(`/api/access/users/${teacherUser.id}/education-assignments`, {
  method: 'PUT',
  body: {
    assignments: [
      {
        role: 'teacher',
        institutionId: institution.id,
        teacherId: teacher.id,
        active: true,
      },
    ],
  },
});

const studentNames = ['演示学员小林', '演示学员小周', '演示学员小陈'];
const students = [];
for (const fullName of studentNames) {
  const page = await ownerRequest(
    `/api/institutions/${institution.id}/students?page=1&pageSize=20&search=${encodeURIComponent(fullName)}`,
  );
  const existing = page.items.find((item) => item.fullName === fullName);
  students.push(
    existing ??
      (await ownerRequest(`/api/institutions/${institution.id}/students`, {
        method: 'POST',
        body: { fullName },
      })),
  );
}

const start = new Date(Date.now() + 15 * 60_000);
const end = new Date(start.getTime() + 60 * 60_000);
const session = await ownerRequest(`/api/institutions/${institution.id}/lesson-sessions`, {
  method: 'POST',
  body: {
    institutionId: institution.id,
    name: `教师点名演示课 ${start.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    source: 'ad_hoc',
    defaultUnits: 1,
    notes: '用于微信小程序教师工作台验收',
  },
});
const roster = await ownerRequest(
  `/api/institutions/${institution.id}/lesson-sessions/${session.id}/roster`,
  {
    method: 'POST',
    body: { expectedRevision: session.revision, studentIds: students.map((item) => item.id) },
  },
);
const assigned = await ownerRequest(
  `/api/institutions/${institution.id}/lesson-sessions/${session.id}/teachers`,
  {
    method: 'PUT',
    body: {
      expectedRevision: roster.session.revision,
      assignments: [{ teacherId: teacher.id, role: 'instructor' }],
    },
  },
);
await ownerRequest(`/api/institutions/${institution.id}/lesson-sessions/${session.id}/open`, {
  method: 'POST',
  body: { expectedRevision: assigned.session.revision },
});

console.log(
  JSON.stringify(
    {
      teacherEmail,
      institutionId: institution.id,
      teacherId: teacher.id,
      sessionId: session.id,
      rosterCount: students.length,
    },
    null,
    2,
  ),
);
