import {
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
  TeamOutlined,
  UserAddOutlined,
  ContactsOutlined,
} from '@ant-design/icons';
import type {
  CreateGuardianAndBindRequest,
  CreateStudentRequest,
  GuardianBinding,
  InstitutionStudent,
  PersonStatus,
  StudentGender,
  UpdateStudentRequest,
} from '@lingcoo-edu-oms/contracts';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import {
  StudentOnboardingFlow,
  type StudentOnboardingTarget,
} from '../onboarding/StudentOnboardingFlow';
import { useInstitutions, useOrganizationProfile } from '../organization/hooks';
import {
  useCreateGuardianAndBind,
  useCreateStudent,
  useGuardianBindings,
  useStudents,
  useUpdateStudent,
  useUpdateGuardianBinding,
  useUpdateStudentService,
  useVerifyGuardianBinding,
} from './hooks';

type StudentFormValues = {
  fullName: string;
  preferredName?: string;
  grade?: string;
  school?: string;
  gender: StudentGender;
  birthDate?: string;
  notes?: string;
  status?: PersonStatus;
};

type GuardianFormValues = {
  fullName: string;
  phone?: string;
  email?: string;
  relationship: string;
  isPrimary: boolean;
  notes?: string;
};

const genderLabels: Record<StudentGender, string> = {
  unknown: '未填写',
  female: '女',
  male: '男',
  other: '其他',
};

function nullable(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试';
}

export function StudentsPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManageStudents = useCan('education.students.manage');
  const canReadGuardians = useCan('education.guardians.read');
  const canManageGuardians = useCan('education.guardians.manage');
  const organization = useOrganizationProfile();
  const [institutionSearch, setInstitutionSearch] = useState('');
  const institutions = useInstitutions({
    page: 1,
    pageSize: 100,
    status: 'active',
    search: institutionSearch || undefined,
  });
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | undefined>();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<InstitutionStudent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [profile, setProfile] = useState<InstitutionStudent | null>(null);
  const [onboarding, setOnboarding] = useState<StudentOnboardingTarget | null>(null);

  useEffect(() => {
    if (!institutionId && institutions.data?.items[0]) {
      setInstitutionId(institutions.data.items[0].id);
    }
  }, [institutionId, institutions.data]);

  useEffect(() => {
    if (searchParams.get('create') !== '1' || !institutionId || formOpen) return;
    setEditing(null);
    setFormOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
  }, [formOpen, institutionId, searchParams, setSearchParams]);

  const students = useStudents(institutionId, {
    page,
    pageSize: 20,
    search: search || undefined,
    status,
  });
  const createStudent = useCreateStudent();
  const updateStudent = useUpdateStudent();

  const institutionOptions = useMemo(
    () =>
      (institutions.data?.items ?? []).map((institution) => ({
        label:
          organization.data?.operationMode === 'self_operated_only'
            ? institution.name
            : `${institution.name} · ${institution.type === 'self_operated' ? '自营' : '合作'}`,
        value: institution.id,
      })),
    [institutions.data, organization.data?.operationMode],
  );

  return (
    <PageContainer
      title="学员档案"
      description="学员属于组织，可同时接受多个机构服务；家长绑定在学员详情中维护，建档后可连续完成发课和教学安排。"
      actions={
        canManageStudents ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!institutionId}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            新建学员
          </Button>
        ) : undefined
      }
    >
      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message="当前阶段只建立人员与服务关系，不把学员绑定到课程、班级、校区或教师。"
      />
      <Card style={{ marginBottom: 16 }}>
        <Space wrap size={12}>
          <Select
            showSearch
            filterOption={false}
            onSearch={(value) => setInstitutionSearch(value.trim())}
            placeholder="选择机构"
            loading={institutions.isPending}
            value={institutionId}
            options={institutionOptions}
            style={{ minWidth: 280 }}
            onChange={(value) => {
              setInstitutionId(value);
              setPage(1);
              setProfile(null);
            }}
          />
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索姓名或常用名"
            style={{ width: 250 }}
            onSearch={(value) => {
              setSearch(value.trim());
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder="档案状态"
            style={{ width: 130 }}
            options={[
              { label: '正常', value: 'active' },
              { label: '已停用', value: 'inactive' },
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
        </Space>
      </Card>

      {!institutionId && !institutions.isPending ? (
        <Card>
          <Empty description="请先创建并选择一个运营中的机构" />
        </Card>
      ) : (
        <Card styles={{ body: { padding: 0 } }}>
          <AsyncState
            loading={students.isPending}
            error={students.error}
            empty={students.data?.items.length === 0}
          >
            <Table<InstitutionStudent>
              rowKey="id"
              dataSource={students.data?.items ?? []}
              scroll={{ x: 920 }}
              pagination={{
                current: students.data?.page ?? page,
                pageSize: students.data?.pageSize ?? 20,
                total: students.data?.total ?? 0,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 名学员`,
                onChange: setPage,
              }}
              onRow={(record) => ({ onClick: () => setProfile(record) })}
              columns={[
                {
                  title: '学员',
                  dataIndex: 'fullName',
                  width: 260,
                  render: (name: string, record) => (
                    <Space direction="vertical" size={0}>
                      <Typography.Text strong>{name}</Typography.Text>
                      <Typography.Text type="secondary">
                        {record.preferredName ? `常用名：${record.preferredName}` : '未设置常用名'}
                      </Typography.Text>
                    </Space>
                  ),
                },
                { title: '年级', dataIndex: 'grade', width: 110, render: (value) => value || '—' },
                { title: '学校', dataIndex: 'school', width: 180, render: (value) => value || '—' },
                {
                  title: '服务关系',
                  dataIndex: 'relationshipStatus',
                  width: 110,
                  render: (value) => (
                    <Tag color={value === 'active' ? 'success' : 'default'}>
                      {value === 'active' ? '服务中' : '已结束'}
                    </Tag>
                  ),
                },
                {
                  title: '档案状态',
                  dataIndex: 'status',
                  width: 100,
                  render: (value) => (
                    <Tag color={value === 'active' ? 'blue' : 'default'}>
                      {value === 'active' ? '正常' : '停用'}
                    </Tag>
                  ),
                },
                {
                  title: '操作',
                  fixed: 'right',
                  width: 190,
                  render: (_, record) => (
                    <Space onClick={(event) => event.stopPropagation()}>
                      <Button
                        type="link"
                        icon={<ContactsOutlined />}
                        onClick={() =>
                          navigate(`/students/${record.id}/360?institutionId=${institutionId}`)
                        }
                      >
                        360°
                      </Button>
                      <Button
                        type="link"
                        icon={<TeamOutlined />}
                        onClick={() => setProfile(record)}
                      >
                        家长
                      </Button>
                      {canManageStudents && (
                        <Button
                          type="link"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setEditing(record);
                            setFormOpen(true);
                          }}
                        >
                          编辑
                        </Button>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          </AsyncState>
        </Card>
      )}

      <StudentModal
        open={formOpen}
        student={editing}
        loading={createStudent.isPending || updateStudent.isPending}
        onClose={() => setFormOpen(false)}
        onSubmit={async (values) => {
          if (!institutionId) return;
          try {
            const common = {
              fullName: values.fullName.trim(),
              preferredName: nullable(values.preferredName),
              grade: nullable(values.grade),
              school: nullable(values.school),
              gender: values.gender,
              birthDate: nullable(values.birthDate),
              notes: nullable(values.notes),
            };
            if (editing) {
              const input: UpdateStudentRequest = {
                ...common,
                status: values.status ?? editing.status,
                expectedRevision: editing.revision,
              };
              await updateStudent.mutateAsync({ institutionId, studentId: editing.id, input });
              void message.success('学员档案已更新');
            } else {
              const created = await createStudent.mutateAsync({
                institutionId,
                input: common as CreateStudentRequest,
              });
              void message.success('学员已创建');
              setOnboarding({
                institutionId,
                institutionName:
                  institutions.data?.items.find((item) => item.id === institutionId)?.name ??
                  '当前机构',
                studentId: created.id,
                studentName: created.fullName,
              });
            }
            setFormOpen(false);
          } catch (error) {
            void message.error(errorMessage(error));
          }
        }}
      />

      <StudentOnboardingFlow target={onboarding} onClose={() => setOnboarding(null)} />

      <StudentProfileModal
        institutionId={institutionId}
        student={profile}
        canReadGuardians={canReadGuardians}
        canManageGuardians={canManageGuardians}
        onClose={() => setProfile(null)}
      />
    </PageContainer>
  );
}

function StudentModal({
  open,
  student,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  student: InstitutionStudent | null;
  loading: boolean;
  onClose(): void;
  onSubmit(values: StudentFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<StudentFormValues>();
  return (
    <Modal
      open={open}
      width={620}
      destroyOnHidden
      title={student ? '编辑学员档案' : '新建学员'}
      onCancel={onClose}
      afterOpenChange={(visible) => {
        if (!visible) return;
        form.setFieldsValue(
          student
            ? {
                fullName: student.fullName,
                preferredName: student.preferredName ?? undefined,
                grade: student.grade ?? undefined,
                school: student.school ?? undefined,
                gender: student.gender,
                birthDate: student.birthDate ?? undefined,
                notes: student.notes ?? undefined,
                status: student.status,
              }
            : { gender: 'unknown', status: 'active' },
        );
      }}
      footer={
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={() => form.submit()}>
            {student ? '保存修改' : '创建学员'}
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="fullName" label="姓名" rules={[{ required: true, max: 120 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="preferredName" label="常用名" rules={[{ max: 120 }]}>
          <Input />
        </Form.Item>
        <Space align="start" style={{ width: '100%' }}>
          <Form.Item name="grade" label="年级 / 年龄" rules={[{ max: 80 }]}>
            <Input style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="school" label="学校" rules={[{ max: 160 }]}>
            <Input style={{ width: 280 }} />
          </Form.Item>
        </Space>
        <Space align="start" style={{ width: '100%' }}>
          <Form.Item name="gender" label="性别">
            <Select
              style={{ width: 180 }}
              options={Object.entries(genderLabels).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="birthDate" label="出生日期">
            <Input type="date" style={{ width: 220 }} />
          </Form.Item>
        </Space>
        {student && (
          <Form.Item name="status" label="档案状态">
            <Select
              options={[
                { label: '正常', value: 'active' },
                { label: '停用', value: 'inactive' },
              ]}
            />
          </Form.Item>
        )}
        <Form.Item name="notes" label="备注" rules={[{ max: 1000 }]}>
          <Input.TextArea rows={4} showCount maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function StudentProfileModal({
  institutionId,
  student,
  canReadGuardians,
  canManageGuardians,
  onClose,
}: {
  institutionId: string | null;
  student: InstitutionStudent | null;
  canReadGuardians: boolean;
  canManageGuardians: boolean;
  onClose(): void;
}) {
  const { message } = App.useApp();
  const [guardianOpen, setGuardianOpen] = useState(false);
  const guardians = useGuardianBindings(institutionId, student?.id ?? null, canReadGuardians);
  const createGuardian = useCreateGuardianAndBind();
  const updateGuardian = useUpdateGuardianBinding();
  const verifyGuardian = useVerifyGuardianBinding();
  const updateService = useUpdateStudentService();
  const [guardianForm] = Form.useForm<GuardianFormValues>();

  return (
    <Modal
      open={Boolean(student)}
      width={900}
      title="学员详情"
      onCancel={onClose}
      destroyOnHidden
      footer={null}
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
    >
      {student && (
        <>
          {canManageGuardians ? (
            <Space style={{ width: '100%', justifyContent: 'flex-end', marginBottom: 16 }}>
              <Button icon={<UserAddOutlined />} onClick={() => setGuardianOpen(true)}>
                绑定家长
              </Button>
            </Space>
          ) : null}
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="姓名">{student.fullName}</Descriptions.Item>
            <Descriptions.Item label="常用名">{student.preferredName || '—'}</Descriptions.Item>
            <Descriptions.Item label="性别">{genderLabels[student.gender]}</Descriptions.Item>
            <Descriptions.Item label="出生日期">{student.birthDate || '—'}</Descriptions.Item>
            <Descriptions.Item label="年级">{student.grade || '—'}</Descriptions.Item>
            <Descriptions.Item label="学校">{student.school || '—'}</Descriptions.Item>
            <Descriptions.Item label="服务状态">
              <Tag color={student.relationshipStatus === 'active' ? 'success' : 'default'}>
                {student.relationshipStatus === 'active' ? '服务中' : '已结束'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="加入时间">
              {new Date(student.joinedAt).toLocaleDateString('zh-CN')}
            </Descriptions.Item>
            <Descriptions.Item label="关系来源" span={2}>
              {student.relationshipSource === 'manual' ? '人工建立' : '旧系统迁移'}
            </Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>
              {student.notes || '—'}
            </Descriptions.Item>
          </Descriptions>
          <Space style={{ marginTop: 16, marginBottom: 12 }}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              家长绑定
            </Typography.Title>
            <Typography.Text type="secondary">仅已验证绑定可获得家长数据权限</Typography.Text>
          </Space>
          {canReadGuardians ? (
            <AsyncState
              loading={guardians.isPending}
              error={guardians.error}
              empty={guardians.data?.items.length === 0}
            >
              <Table<GuardianBinding>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={guardians.data?.items ?? []}
                columns={[
                  {
                    title: '家长',
                    render: (_, record) => (
                      <Space direction="vertical" size={0}>
                        <Typography.Text strong>{record.guardian.fullName}</Typography.Text>
                        <Typography.Text type="secondary">
                          {record.guardian.phone || record.guardian.email || '已关联账号'}
                        </Typography.Text>
                      </Space>
                    ),
                  },
                  { title: '关系', dataIndex: 'relationship' },
                  {
                    title: '验证',
                    render: (_, record) => (
                      <Tag color={record.verificationStatus === 'verified' ? 'success' : 'warning'}>
                        {record.verificationStatus === 'verified' ? '已验证' : '待核验'}
                      </Tag>
                    ),
                  },
                  {
                    title: '主要联系人',
                    dataIndex: 'isPrimary',
                    render: (value) => (value ? <Tag color="blue">主要</Tag> : '—'),
                  },
                  {
                    title: '操作',
                    render: (_, record) => {
                      if (!canManageGuardians || record.status !== 'active') return '—';
                      return (
                        <Space size={0}>
                          {record.verificationStatus === 'unverified' && (
                            <Popconfirm
                              title="确认该家长身份与关系？"
                              description="核验后，该账号才可能获得对应学员的数据范围。"
                              okText="核验通过"
                              cancelText="取消"
                              onConfirm={async () => {
                                if (!institutionId || !student) return;
                                try {
                                  await verifyGuardian.mutateAsync({
                                    institutionId,
                                    studentId: student.id,
                                    bindingId: record.id,
                                    expectedRevision: record.revision,
                                  });
                                  void message.success('家长关系已核验');
                                } catch (error) {
                                  void message.error(errorMessage(error));
                                }
                              }}
                            >
                              <Button type="link" loading={verifyGuardian.isPending}>
                                核验
                              </Button>
                            </Popconfirm>
                          )}
                          <Popconfirm
                            title="解除该家长绑定？"
                            description="只撤销关系，不删除家长或学员档案。"
                            okText="确认解绑"
                            cancelText="取消"
                            onConfirm={async () => {
                              if (!institutionId || !student) return;
                              try {
                                await updateGuardian.mutateAsync({
                                  institutionId,
                                  studentId: student.id,
                                  bindingId: record.id,
                                  input: { expectedRevision: record.revision, status: 'revoked' },
                                });
                                void message.success('家长绑定已撤销');
                              } catch (error) {
                                void message.error(errorMessage(error));
                              }
                            }}
                          >
                            <Button type="link" danger loading={updateGuardian.isPending}>
                              解绑
                            </Button>
                          </Popconfirm>
                        </Space>
                      );
                    },
                  },
                ]}
              />
            </AsyncState>
          ) : (
            <Alert type="warning" showIcon message="当前账号无权查看家长信息" />
          )}
          {canManageGuardians && (
            <Button
              danger={student.relationshipStatus === 'active'}
              style={{ marginTop: 20 }}
              loading={updateService.isPending}
              onClick={async () => {
                if (!institutionId) return;
                try {
                  await updateService.mutateAsync({
                    institutionId,
                    studentId: student.id,
                    input: {
                      expectedRevision: student.relationshipRevision,
                      status: student.relationshipStatus === 'active' ? 'inactive' : 'active',
                    },
                  });
                  void message.success(
                    student.relationshipStatus === 'active' ? '服务关系已结束' : '服务关系已恢复',
                  );
                  onClose();
                } catch (error) {
                  void message.error(errorMessage(error));
                }
              }}
            >
              {student.relationshipStatus === 'active' ? '结束该机构服务' : '恢复该机构服务'}
            </Button>
          )}
        </>
      )}
      <Modal
        title="新增并绑定家长"
        open={guardianOpen}
        confirmLoading={createGuardian.isPending}
        onCancel={() => setGuardianOpen(false)}
        onOk={() => guardianForm.submit()}
        destroyOnHidden
      >
        <Form
          form={guardianForm}
          layout="vertical"
          initialValues={{ relationship: '家长', isPrimary: true }}
          onFinish={async (values) => {
            if (!institutionId || !student) return;
            try {
              const input: CreateGuardianAndBindRequest = {
                fullName: values.fullName.trim(),
                phone: nullable(values.phone),
                email: nullable(values.email),
                relationship: values.relationship.trim(),
                isPrimary: values.isPrimary,
                notes: nullable(values.notes),
                identityUserId: null,
              };
              await createGuardian.mutateAsync({ institutionId, studentId: student.id, input });
              void message.success('家长已绑定并标记为管理员验证');
              setGuardianOpen(false);
              guardianForm.resetFields();
            } catch (error) {
              void message.error(errorMessage(error));
            }
          }}
        >
          <Form.Item name="fullName" label="家长姓名" rules={[{ required: true, max: 120 }]}>
            <Input />
          </Form.Item>
          <Space align="start">
            <Form.Item name="phone" label="手机号">
              <Input style={{ width: 210 }} />
            </Form.Item>
            <Form.Item name="email" label="邮箱" rules={[{ type: 'email' }]}>
              <Input style={{ width: 260 }} />
            </Form.Item>
          </Space>
          <Form.Item name="relationship" label="与学员关系" rules={[{ required: true, max: 60 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="isPrimary" label="联系人类型">
            <Select
              options={[
                { label: '主要联系人', value: true },
                { label: '普通联系人', value: false },
              ]}
            />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Modal>
  );
}
