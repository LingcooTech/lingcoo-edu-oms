import {
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type {
  Campus,
  ClassGroup,
  Classroom,
  Course,
  CreateCampusRequest,
  CreateClassGroupRequest,
  CreateClassroomRequest,
  CreateCourseRequest,
  PermissionKey,
  UpdateCampusRequest,
  UpdateClassGroupRequest,
  UpdateClassroomRequest,
  UpdateCourseRequest,
} from '@lingcoo-edu-oms/contracts';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useInstitutions } from '../organization/hooks';
import { useStudents } from '../people/hooks';
import {
  useCampuses,
  useClasses,
  useClassStudents,
  useClassrooms,
  useCourses,
  useCourseSeries,
  useCreateCampus,
  useCreateClass,
  useCreateClassroom,
  useCreateCourse,
  useReplaceClassStudents,
  useUpdateCampus,
  useUpdateClass,
  useUpdateClassroom,
  useUpdateCourse,
} from './hooks';

const p = (value: string): PermissionKey => value as PermissionKey;
type ResourceKind = 'course' | 'class' | 'campus' | 'classroom';
export type ResourceTab = 'courses' | 'classes' | 'campuses' | 'classrooms';
type ResourceFilterStatus =
  Course['status'] | ClassGroup['status'] | Campus['status'] | Classroom['status'];
type SelectOption = { value: string; label: string };
type ResourceFormValues = {
  name: string;
  code?: string | null;
  category?: string | null;
  ageRange?: string | null;
  summary?: string | null;
  courseSeriesId?: string | null;
  durationMinutes?: number;
  sortOrder?: number;
  capacity?: number;
  status?: ResourceFilterStatus;
  courseId?: string | null;
  campusId?: string | null;
  classroomId?: string | null;
  address?: string | null;
  notes?: string | null;
};
type ResourceQueryState = {
  isPending: boolean;
  error: Error | null;
  data?: { items: readonly unknown[] };
};
const resourceStatus = [
  { value: 'active', label: '启用' },
  { value: 'inactive', label: '停用' },
];
const courseStatus = [{ value: 'draft', label: '草稿' }, ...resourceStatus];
const classStatus = [
  { value: 'recruiting', label: '招生中' },
  { value: 'active', label: '进行中' },
  { value: 'completed', label: '已结业' },
  { value: 'archived', label: '已归档' },
];
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}
function nullable(value?: string | null) {
  const v = value?.trim();
  return v ? v : null;
}

export function TeachingResourcesPage({ initialTab = 'courses' }: { initialTab?: ResourceTab }) {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const canManageCourses = useCan(p('education.courses.manage'));
  const canManageClasses = useCan(p('education.classes.manage'));
  const canManageSharedResources = useCan(p('education.teaching-resources.manage'));
  const institutions = useInstitutions({ page: 1, pageSize: 100, status: 'active' });
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [tab, setTab] = useState<ResourceTab>(initialTab);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ResourceFilterStatus>();
  const [editing, setEditing] = useState<{
    kind: ResourceKind;
    value: Course | ClassGroup | Campus | Classroom | null;
  } | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassGroup | null>(null);
  const [campusId, setCampusId] = useState<string | null>(null);
  const courses = useCourses(institutionId, {
    page: 1,
    pageSize: 100,
    search: search || undefined,
    status: tab === 'courses' ? (status as Course['status'] | undefined) : undefined,
  });
  const courseSeries = useCourseSeries(institutionId, { page: 1, pageSize: 100 });
  const classes = useClasses(institutionId, {
    page: 1,
    pageSize: 100,
    search: search || undefined,
    status: tab === 'classes' ? (status as ClassGroup['status'] | undefined) : undefined,
  });
  const campuses = useCampuses({
    page: 1,
    pageSize: 100,
    search: search || undefined,
    status: tab === 'campuses' ? (status as Campus['status'] | undefined) : undefined,
  });
  const classrooms = useClassrooms(campusId, {
    page: 1,
    pageSize: 100,
    search: search || undefined,
    status: tab === 'classrooms' ? (status as Classroom['status'] | undefined) : undefined,
  });
  const classStudents = useClassStudents(institutionId, selectedClass?.id ?? null);
  const students = useStudents(institutionId, {
    page: 1,
    pageSize: 500,
    status: 'active',
    relationshipStatus: 'active',
  });
  const pendingStudentId = searchParams.get('studentId');
  const pendingStudent = students.data?.items.find((item) => item.id === pendingStudentId);
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const createClass = useCreateClass();
  const updateClass = useUpdateClass();
  const replaceStudents = useReplaceClassStudents();
  const createCampus = useCreateCampus();
  const updateCampus = useUpdateCampus();
  const createClassroom = useCreateClassroom();
  const updateClassroom = useUpdateClassroom();
  useEffect(() => {
    const requested = searchParams.get('institutionId');
    const requestedInstitution = institutions.data?.items.find((item) => item.id === requested);
    if (!institutionId && (requestedInstitution || institutions.data?.items[0]))
      setInstitutionId((requestedInstitution || institutions.data?.items[0])!.id);
  }, [institutionId, institutions.data, searchParams]);
  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => {
    if (!campusId && campuses.data?.items[0]) setCampusId(campuses.data.items[0].id);
  }, [campusId, campuses.data]);
  const institutionOptions = (institutions.data?.items ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const courseOptions = (courses.data?.items ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const courseSeriesOptions = (courseSeries.data?.items ?? []).map((item) => ({
    value: item.id,
    label: `${item.name}${item.status === 'inactive' ? '（已停用）' : ''}`,
  }));
  const campusOptions = (campuses.data?.items ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const classroomOptions = (classrooms.data?.items ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  async function submit(kind: ResourceKind, values: ResourceFormValues) {
    try {
      if (kind === 'course' && institutionId && canManageCourses) {
        const input = {
          ...values,
          name: values.name.trim(),
          code: nullable(values.code),
          category: nullable(values.category),
          ageRange: nullable(values.ageRange),
          summary: nullable(values.summary),
          courseSeriesId: values.courseSeriesId ?? null,
          durationMinutes: values.durationMinutes ?? 60,
          sortOrder: values.sortOrder ?? 0,
        };
        if (editing?.value)
          await updateCourse.mutateAsync({
            institutionId,
            id: editing.value.id,
            input: {
              expectedRevision: (editing.value as Course).revision,
              ...input,
            } as UpdateCourseRequest,
          });
        else await createCourse.mutateAsync({ institutionId, input: input as CreateCourseRequest });
      }
      if (kind === 'class' && institutionId && canManageClasses) {
        const input = {
          name: values.name.trim(),
          courseId: values.courseId ?? null,
          campusId: values.campusId ?? null,
          classroomId: values.classroomId ?? null,
          capacity: values.capacity ?? 30,
          status: values.status ?? 'recruiting',
          notes: nullable(values.notes),
        };
        if (editing?.value)
          await updateClass.mutateAsync({
            institutionId,
            id: editing.value.id,
            input: {
              expectedRevision: (editing.value as ClassGroup).revision,
              ...input,
            } as UpdateClassGroupRequest,
          });
        else
          await createClass.mutateAsync({ institutionId, input: input as CreateClassGroupRequest });
      }
      if (kind === 'campus' && canManageSharedResources) {
        const input = {
          name: values.name.trim(),
          code: nullable(values.code),
          address: nullable(values.address),
          status: values.status ?? 'active',
          notes: nullable(values.notes),
          environmentImageUrls: [],
        };
        if (editing?.value)
          await updateCampus.mutateAsync({
            id: editing.value.id,
            input: {
              expectedRevision: (editing.value as Campus).revision,
              ...input,
            } as UpdateCampusRequest,
          });
        else await createCampus.mutateAsync(input as CreateCampusRequest);
      }
      if (kind === 'classroom' && campusId && canManageSharedResources) {
        const input = {
          name: values.name.trim(),
          code: nullable(values.code),
          capacity: values.capacity ?? 1,
          status: values.status ?? 'active',
          notes: nullable(values.notes),
        };
        if (editing?.value)
          await updateClassroom.mutateAsync({
            campusId,
            id: editing.value.id,
            input: {
              expectedRevision: (editing.value as Classroom).revision,
              ...input,
            } as UpdateClassroomRequest,
          });
        else
          await createClassroom.mutateAsync({ campusId, input: input as CreateClassroomRequest });
      }
      setEditing(null);
      void message.success('已保存');
    } catch (error) {
      void message.error(errorMessage(error));
    }
  }
  const tableCard = (query: ResourceQueryState, children: ReactNode) => (
    <Card styles={{ body: { padding: 0 } }}>
      <AsyncState loading={query.isPending} error={query.error} empty={!query.data?.items.length}>
        {children}
      </AsyncState>
    </Card>
  );
  return (
    <PageContainer
      title={
        tab === 'courses'
          ? '课程管理'
          : tab === 'classes'
            ? '班级管理'
            : tab === 'campuses'
              ? '校区管理'
              : '教室管理'
      }
      description={
        tab === 'classes'
          ? '班级是围绕学员形成的教学组织安排；名单、课程和场地不会改变课时账户。'
          : '供给资源为教学安排提供上下文，不限定课时商品和学员机构账户。'
      }
      actions={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={
            (tab === 'courses' && !canManageCourses) ||
            (tab === 'classes' && !canManageClasses) ||
            ((tab === 'campuses' || tab === 'classrooms') && !canManageSharedResources) ||
            (tab === 'classrooms' && !campusId)
          }
          onClick={() =>
            setEditing({
              kind:
                tab === 'courses'
                  ? 'course'
                  : tab === 'classes'
                    ? 'class'
                    : tab === 'campuses'
                      ? 'campus'
                      : 'classroom',
              value: null,
            })
          }
        >
          新建
          {tab === 'courses'
            ? '课程'
            : tab === 'classes'
              ? '班级'
              : tab === 'campuses'
                ? '校区'
                : '教室'}
        </Button>
      }
    >
      <Alert
        type="info"
        showIcon
        message="所有资源关联均为可选"
        description="资源只描述教学场景；不选择课程、班级、校区或教室也可以创建和运行课次，课时权益始终由机构账户决定。"
        style={{ marginBottom: 16 }}
      />
      {tab === 'classes' && pendingStudentId && (
        <Alert
          type="warning"
          showIcon
          message={`待安排学员：${pendingStudent?.fullName ?? '正在读取学员信息'}`}
          description="请选择合适的班级并打开名单，将学员加入班级；也可以稍后通过排课计划或独立课次继续安排。"
          style={{ marginBottom: 16 }}
        />
      )}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap style={{ width: '100%' }}>
          <Typography.Text strong>当前机构</Typography.Text>
          <Select
            showSearch
            optionFilterProp="label"
            value={institutionId}
            options={institutionOptions}
            style={{ minWidth: 280 }}
            onChange={setInstitutionId}
          />
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索资源"
            style={{ width: 260 }}
            onSearch={(value) => setSearch(value.trim())}
          />
          <Select
            allowClear
            placeholder="状态"
            options={
              tab === 'courses' ? courseStatus : tab === 'classes' ? classStatus : resourceStatus
            }
            style={{ width: 130 }}
            onChange={setStatus}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              if (tab === 'courses') void courses.refetch();
              if (tab === 'classes') void classes.refetch();
              if (tab === 'campuses') void campuses.refetch();
              if (tab === 'classrooms') void classrooms.refetch();
            }}
          >
            刷新
          </Button>
        </Space>
      </Card>
      {
        [
          {
            key: 'courses',
            label: '课程',
            children: tableCard(
              courses,
              <Table<Course>
                rowKey="id"
                dataSource={courses.data?.items}
                scroll={{ x: 900 }}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: '名称', dataIndex: 'name' },
                  { title: '编码', dataIndex: 'code', render: (v) => v || '—' },
                  { title: '时长', dataIndex: 'durationMinutes', render: (v) => `${v} 分钟` },
                  { title: '状态', dataIndex: 'status', render: (v) => <Tag>{v}</Tag> },
                  {
                    title: '课程系列',
                    render: (_, item) =>
                      (courseSeries.data?.items ?? []).find(
                        (series) => series.id === item.courseSeriesId,
                      )?.name ?? '未分类',
                  },
                  {
                    title: '操作',
                    render: (_, item) => (
                      <Button
                        type="link"
                        icon={<EditOutlined />}
                        disabled={!canManageCourses}
                        onClick={() => setEditing({ kind: 'course', value: item })}
                      >
                        编辑
                      </Button>
                    ),
                  },
                ]}
              />,
            ),
          },
          {
            key: 'classes',
            label: '班级',
            children: tableCard(
              classes,
              <Table<ClassGroup>
                rowKey="id"
                dataSource={classes.data?.items}
                scroll={{ x: 1000 }}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: '名称', dataIndex: 'name' },
                  { title: '容量', dataIndex: 'capacity', render: (v) => `${v} 人` },
                  { title: '状态', dataIndex: 'status', render: (v) => <Tag>{v}</Tag> },
                  { title: '关系', render: () => '可选，不影响课时权益' },
                  {
                    title: '操作',
                    render: (_, item) => (
                      <Space>
                        <Button
                          type="link"
                          icon={<TeamOutlined />}
                          disabled={!canManageClasses}
                          onClick={() => setSelectedClass(item)}
                        >
                          名单
                        </Button>
                        <Button
                          type="link"
                          icon={<EditOutlined />}
                          disabled={!canManageClasses}
                          onClick={() => setEditing({ kind: 'class', value: item })}
                        >
                          编辑
                        </Button>
                      </Space>
                    ),
                  },
                ]}
              />,
            ),
          },
          {
            key: 'shared',
            label: '组织共享',
            children: [
              {
                key: 'campuses',
                label: '校区',
                children: tableCard(
                  campuses,
                  <Table<Campus>
                    rowKey="id"
                    dataSource={campuses.data?.items}
                    pagination={{ pageSize: 10 }}
                    columns={[
                      { title: '名称', dataIndex: 'name' },
                      { title: '地址', dataIndex: 'address', render: (v) => v || '—' },
                      { title: '状态', dataIndex: 'status', render: (v) => <Tag>{v}</Tag> },
                      { title: '关系', render: () => '可选，不影响课时权益' },
                      {
                        title: '操作',
                        render: (_, item) => (
                          <Button
                            type="link"
                            icon={<EditOutlined />}
                            disabled={!canManageSharedResources}
                            onClick={() => setEditing({ kind: 'campus', value: item })}
                          >
                            编辑
                          </Button>
                        ),
                      },
                    ]}
                  />,
                ),
              },
              {
                key: 'classrooms',
                label: '教室',
                children: (
                  <>
                    <Select
                      value={campusId}
                      options={campusOptions}
                      placeholder="先选择校区"
                      style={{ marginBottom: 12, minWidth: 260 }}
                      onChange={setCampusId}
                    />
                    {tableCard(
                      classrooms,
                      <Table<Classroom>
                        rowKey="id"
                        dataSource={classrooms.data?.items}
                        pagination={{ pageSize: 10 }}
                        columns={[
                          { title: '名称', dataIndex: 'name' },
                          { title: '容量', dataIndex: 'capacity', render: (v) => `${v} 人` },
                          { title: '状态', dataIndex: 'status', render: (v) => <Tag>{v}</Tag> },
                          { title: '关系', render: () => '可选，不影响课时权益' },
                          {
                            title: '操作',
                            render: (_, item) => (
                              <Button
                                type="link"
                                icon={<EditOutlined />}
                                disabled={!canManageSharedResources}
                                onClick={() => setEditing({ kind: 'classroom', value: item })}
                              >
                                编辑
                              </Button>
                            ),
                          },
                        ]}
                      />,
                    )}
                  </>
                ),
              },
            ].find((item) => item.key === tab)?.children,
          },
        ].find((item) => item.key === (tab === 'campuses' || tab === 'classrooms' ? 'shared' : tab))
          ?.children
      }
      {editing && (
        <ResourceModal
          kind={editing.kind}
          value={editing.value}
          open
          onClose={() => setEditing(null)}
          loading={
            createCourse.isPending ||
            updateCourse.isPending ||
            createClass.isPending ||
            updateClass.isPending ||
            createCampus.isPending ||
            updateCampus.isPending ||
            createClassroom.isPending ||
            updateClassroom.isPending
          }
          courseOptions={courseOptions}
          courseSeriesOptions={courseSeriesOptions}
          campusOptions={campusOptions}
          classroomOptions={classroomOptions}
          onSubmit={(values) => submit(editing.kind, values)}
        />
      )}
      {selectedClass && (
        <ClassStudentsModal
          open
          resource={selectedClass}
          currentIds={new Set((classStudents.data?.items ?? []).map((item) => item.studentId))}
          students={(students.data?.items ?? []).map((item) => ({
            value: item.id,
            label: item.fullName,
          }))}
          loading={replaceStudents.isPending}
          onClose={() => setSelectedClass(null)}
          onSubmit={async (studentIds) => {
            try {
              await replaceStudents.mutateAsync({
                institutionId: institutionId!,
                id: selectedClass.id,
                input: { expectedRevision: selectedClass.revision, studentIds },
              });
              setSelectedClass(null);
              void message.success('班级名单已更新');
            } catch (error) {
              void message.error(errorMessage(error));
            }
          }}
        />
      )}
    </PageContainer>
  );
}

function ResourceModal({
  kind,
  value,
  open,
  loading,
  courseOptions,
  courseSeriesOptions,
  campusOptions,
  classroomOptions,
  onClose,
  onSubmit,
}: {
  kind: ResourceKind;
  value: Course | ClassGroup | Campus | Classroom | null;
  open: boolean;
  loading: boolean;
  courseOptions: SelectOption[];
  courseSeriesOptions: SelectOption[];
  campusOptions: SelectOption[];
  classroomOptions: SelectOption[];
  onClose(): void;
  onSubmit(values: ResourceFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<ResourceFormValues>();
  useEffect(() => {
    if (!open) return;
    const v = (value ?? {}) as Partial<ResourceFormValues>;
    form.setFieldsValue({
      ...v,
      summary: v.summary,
      notes: v.notes,
      status:
        v.status ?? (kind === 'course' ? 'draft' : kind === 'class' ? 'recruiting' : 'active'),
    });
  }, [form, kind, open, value]);
  return (
    <Modal
      open
      destroyOnHidden
      width={700}
      title={`${value ? '编辑' : '新建'}${kind === 'course' ? '课程' : kind === 'class' ? '班级' : kind === 'campus' ? '校区' : '教室'}`}
      okText="保存"
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="name" label="名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        {kind === 'course' && (
          <>
            <Form.Item name="code" label="编码">
              <Input />
            </Form.Item>
            <Form.Item name="courseSeriesId" label="课程系列（可选）">
              <Select allowClear options={courseSeriesOptions} />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="durationMinutes" label="时长" rules={[{ required: true }]}>
                  <InputNumber min={1} style={{ width: '100%' }} addonAfter="分钟" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="status" label="状态">
                  <Select options={courseStatus} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="summary" label="简介">
              <Input.TextArea rows={3} />
            </Form.Item>
          </>
        )}
        {kind === 'class' && (
          <>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="capacity" label="容量" rules={[{ required: true }]}>
                  <InputNumber min={1} style={{ width: '100%' }} addonAfter="人" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="status" label="状态">
                  <Select options={classStatus} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="courseId" label="课程（可选）">
              <Select allowClear options={courseOptions} />
            </Form.Item>
            <Form.Item name="campusId" label="校区（可选）">
              <Select allowClear options={campusOptions} />
            </Form.Item>
            <Form.Item name="classroomId" label="教室（可选）">
              <Select allowClear options={classroomOptions} />
            </Form.Item>
            <Form.Item name="notes" label="备注">
              <Input.TextArea rows={2} />
            </Form.Item>
          </>
        )}
        {kind === 'campus' && (
          <>
            <Form.Item name="code" label="编码">
              <Input />
            </Form.Item>
            <Form.Item name="address" label="地址">
              <Input />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select options={resourceStatus} />
            </Form.Item>
            <Form.Item name="notes" label="备注">
              <Input.TextArea rows={2} />
            </Form.Item>
          </>
        )}
        {kind === 'classroom' && (
          <>
            <Form.Item name="code" label="编码">
              <Input />
            </Form.Item>
            <Form.Item name="capacity" label="容量" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: '100%' }} addonAfter="人" />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select options={resourceStatus} />
            </Form.Item>
            <Form.Item name="notes" label="备注">
              <Input.TextArea rows={2} />
            </Form.Item>
          </>
        )}
        <Alert
          type="info"
          showIcon
          message="关联是可选的"
          description="不选择资源也可以创建课次，不影响课时权益。"
        />
      </Form>
    </Modal>
  );
}

function ClassStudentsModal({
  open,
  resource,
  currentIds,
  students,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  resource: ClassGroup;
  currentIds: Set<string>;
  students: SelectOption[];
  loading: boolean;
  onClose(): void;
  onSubmit(ids: string[]): Promise<void>;
}) {
  const [form] = Form.useForm<{ studentIds: string[] }>();
  useEffect(() => {
    if (open) form.setFieldsValue({ studentIds: [...currentIds] });
  }, [currentIds, form, open]);
  return (
    <Modal
      open
      destroyOnHidden
      width={620}
      title={`替换学员名单 · ${resource.name}`}
      okText="保存名单"
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form form={form} layout="vertical" onFinish={(v) => onSubmit(v.studentIds ?? [])}>
        <Form.Item name="studentIds" label="班级学员">
          <Select mode="multiple" showSearch optionFilterProp="label" options={students} />
        </Form.Item>
        <Alert
          type="warning"
          showIcon
          message="名单独立"
          description="班级名单变更不修改历史课次名单；生成课次时复制的是当时的名单快照。"
        />
      </Form>
    </Modal>
  );
}
