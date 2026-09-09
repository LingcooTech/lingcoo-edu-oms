const baseUrl = process.env.PREVIEW_API_BASE_URL ?? 'http://127.0.0.1:18090';
const ownerEmail = process.env.BOOTSTRAP_OWNER_EMAIL;
const ownerPassword = process.env.BOOTSTRAP_OWNER_PASSWORD;

if (!ownerEmail || !ownerPassword) throw new Error('Missing preview owner credentials');

async function json(response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(payload)}`);
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

async function request(path, options = {}) {
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

function localDate(offsetDays) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function isoWeekday(value) {
  const day = value.getDay();
  return day === 0 ? 7 : day;
}

async function firstOrCreate(listPath, name, createPath, body) {
  const page = await request(
    `${listPath}${listPath.includes('?') ? '&' : '?'}page=1&pageSize=100&search=${encodeURIComponent(name)}`,
  );
  return (
    page.items.find((item) => item.name === name) ?? request(createPath, { method: 'POST', body })
  );
}

const institution = await firstOrCreate(
  '/api/institutions',
  'P6 教学资源演示机构',
  '/api/institutions',
  { name: 'P6 教学资源演示机构', type: 'self_operated' },
);
const campus = await firstOrCreate('/api/campuses', '成长空间共享校区', '/api/campuses', {
  name: '成长空间共享校区',
  code: 'P6-CAMPUS',
  address: '文具店二层成长空间',
  environmentImageUrls: [],
});
const classroom = await firstOrCreate(
  `/api/campuses/${campus.id}/classrooms`,
  '多功能教室 A',
  `/api/campuses/${campus.id}/classrooms`,
  { name: '多功能教室 A', code: 'ROOM-A', capacity: 12 },
);
const course = await firstOrCreate(
  `/api/institutions/${institution.id}/courses`,
  '创意书法',
  `/api/institutions/${institution.id}/courses`,
  {
    code: 'P6-CALLIGRAPHY',
    name: '创意书法',
    category: '书法',
    ageRange: '6-12 岁',
    durationMinutes: 60,
    summary: '课程只提供教学上下文，不限定通用课时。',
    status: 'active',
  },
);
const classGroup = await firstOrCreate(
  `/api/institutions/${institution.id}/classes`,
  '周末成长班',
  `/api/institutions/${institution.id}/classes`,
  {
    name: '周末成长班',
    courseId: course.id,
    campusId: campus.id,
    classroomId: classroom.id,
    capacity: 12,
    status: 'active',
    notes: '班级是名单维护工具，不决定课时资格。',
  },
);

const students = [];
for (const fullName of ['P6 学员小林', 'P6 学员小周', 'P6 学员小陈']) {
  const page = await request(
    `/api/institutions/${institution.id}/students?page=1&pageSize=20&search=${encodeURIComponent(fullName)}`,
  );
  students.push(
    page.items.find((item) => item.fullName === fullName) ??
      (await request(`/api/institutions/${institution.id}/students`, {
        method: 'POST',
        body: { fullName },
      })),
  );
}
await request(`/api/institutions/${institution.id}/classes/${classGroup.id}/students`, {
  method: 'PUT',
  body: { expectedRevision: classGroup.revision, studentIds: students.map((item) => item.id) },
});

const teachers = await request(`/api/institutions/${institution.id}/teachers`);
const teacher =
  teachers.items.find((item) => item.fullName === 'P6 演示教师') ??
  (await request(`/api/institutions/${institution.id}/teachers`, {
    method: 'POST',
    body: { fullName: 'P6 演示教师', title: '书法教师', specialties: ['少儿书法'] },
  }));

const occurrence = new Date();
occurrence.setDate(occurrence.getDate() + 1);
const schedule = await firstOrCreate(
  `/api/institutions/${institution.id}/schedules`,
  'P6 周末排课演示',
  `/api/institutions/${institution.id}/schedules`,
  {
    name: 'P6 周末排课演示',
    sessionName: '创意书法演示课',
    courseId: course.id,
    classGroupId: classGroup.id,
    campusId: campus.id,
    classroomId: classroom.id,
    timeZone: 'Asia/Shanghai',
    startDate: localDate(1),
    endDate: localDate(1),
    weekdays: [isoWeekday(occurrence)],
    startTime: '18:30',
    durationMinutes: 60,
    defaultUnits: 1,
    status: 'active',
  },
);
const scheduleTeachers = await request(
  `/api/institutions/${institution.id}/schedules/${schedule.id}/teachers`,
  {
    method: 'PUT',
    body: {
      expectedRevision: schedule.revision,
      assignments: [{ teacherId: teacher.id, role: 'instructor' }],
    },
  },
);
const generated = await request(
  `/api/institutions/${institution.id}/schedules/${schedule.id}/generate`,
  {
    method: 'POST',
    body: {
      expectedRevision: scheduleTeachers.schedule.revision,
      includeClassStudents: true,
      allowConflicts: false,
    },
  },
);

console.log(
  JSON.stringify(
    {
      institutionId: institution.id,
      campusId: campus.id,
      classroomId: classroom.id,
      courseId: course.id,
      classGroupId: classGroup.id,
      scheduleId: schedule.id,
      createdSessionIds: generated.createdSessions.map((item) => item.id),
      skippedDates: generated.skippedDates,
      copiedStudentCount: students.length,
    },
    null,
    2,
  ),
);
