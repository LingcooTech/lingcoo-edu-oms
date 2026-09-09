import { EditOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import type {
  CreateTeacherRequest,
  InstitutionTeacher,
  PersonStatus,
  UpdateTeacherRequest,
} from '@lingcoo-edu-oms/contracts';
import {
  App,
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Image,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useInstitutions } from '../organization/hooks';
import { useCreateTeacher, useTeachers, useUpdateTeacher } from './hooks';

type TeacherFormValues = {
  fullName: string;
  phone?: string;
  title?: string;
  avatarUrl?: string;
  tagline?: string;
  wechatQrUrl?: string;
  education?: string;
  teachingExperience?: string;
  teachingStyle?: string;
  achievements?: string;
  teachingYears?: string;
  studentCount?: string;
  retentionRate?: string;
  teachingPhilosophy?: string;
  classPhotoUrlsText?: string;
  studentWorkUrlsText?: string;
  parentTestimonialsText?: string;
  bio?: string;
  specialtiesText?: string;
  isPinned: boolean;
  isTrialConsultant: boolean;
  status?: PersonStatus;
};

function nullable(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function lines(value?: string, separator: RegExp = /\r?\n/): string[] {
  return (value ?? '')
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formValues(teacher?: InstitutionTeacher | null): TeacherFormValues {
  if (!teacher)
    return { fullName: '', isPinned: false, isTrialConsultant: false, status: 'active' };
  return {
    fullName: teacher.fullName,
    phone: teacher.phone ?? undefined,
    title: teacher.title ?? undefined,
    avatarUrl: teacher.avatarUrl ?? undefined,
    tagline: teacher.tagline ?? undefined,
    wechatQrUrl: teacher.wechatQrUrl ?? undefined,
    education: teacher.education,
    teachingExperience: teacher.teachingExperience,
    teachingStyle: teacher.teachingStyle,
    achievements: teacher.achievements,
    teachingYears: teacher.teachingYears ?? undefined,
    studentCount: teacher.studentCount ?? undefined,
    retentionRate: teacher.retentionRate ?? undefined,
    teachingPhilosophy: teacher.teachingPhilosophy,
    classPhotoUrlsText: teacher.classPhotoUrls.join('\n'),
    studentWorkUrlsText: teacher.studentWorkUrls.join('\n'),
    parentTestimonialsText: teacher.parentTestimonials.join('\n'),
    bio: teacher.bio,
    specialtiesText: teacher.specialties.join('、'),
    isPinned: teacher.isPinned,
    isTrialConsultant: teacher.isTrialConsultant,
    status: teacher.status,
  };
}

export function TeachersPage() {
  const { message } = App.useApp();
  const canManage = useCan('education.teachers.manage');
  const [institutionSearch, setInstitutionSearch] = useState('');
  const institutions = useInstitutions({
    page: 1,
    pageSize: 100,
    status: 'active',
    search: institutionSearch || undefined,
  });
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [editing, setEditing] = useState<InstitutionTeacher | null>(null);
  const [open, setOpen] = useState(false);
  const teachers = useTeachers(institutionId, true);
  const createTeacher = useCreateTeacher();
  const updateTeacher = useUpdateTeacher();

  useEffect(() => {
    if (!institutionId && institutions.data?.items[0])
      setInstitutionId(institutions.data.items[0].id);
  }, [institutionId, institutions.data]);

  const options = useMemo(
    () => (institutions.data?.items ?? []).map((item) => ({ label: item.name, value: item.id })),
    [institutions.data],
  );

  return (
    <PageContainer
      title="教师档案"
      description="教师与机构是任职关系；旧系统已使用的师资介绍、图片与展示指标继续完整保留。"
      actions={
        canManage ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!institutionId}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            新增教师
          </Button>
        ) : undefined
      }
    >
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Typography.Text strong>当前机构</Typography.Text>
          <Select
            showSearch
            filterOption={false}
            onSearch={(value) => setInstitutionSearch(value.trim())}
            placeholder="选择机构"
            loading={institutions.isPending}
            value={institutionId}
            options={options}
            style={{ minWidth: 300 }}
            onChange={setInstitutionId}
          />
        </Space>
      </Card>
      {!institutionId && !institutions.isPending ? (
        <Card>
          <Empty description="请先创建并选择机构" />
        </Card>
      ) : (
        <Card styles={{ body: { padding: 0 } }}>
          <AsyncState
            loading={teachers.isPending}
            error={teachers.error}
            empty={teachers.data?.items.length === 0}
          >
            <Table<InstitutionTeacher>
              rowKey="id"
              dataSource={teachers.data?.items ?? []}
              pagination={false}
              scroll={{ x: 920 }}
              columns={[
                {
                  title: '教师',
                  dataIndex: 'fullName',
                  width: 220,
                  render: (value, record) => (
                    <Space>
                      <Avatar src={record.avatarUrl ?? undefined} icon={<UserOutlined />} />
                      <Space direction="vertical" size={0}>
                        <Typography.Text strong>{value}</Typography.Text>
                        <Typography.Text type="secondary">
                          {record.title || record.tagline || '—'}
                        </Typography.Text>
                      </Space>
                    </Space>
                  ),
                },
                {
                  title: '手机号',
                  dataIndex: 'phone',
                  width: 140,
                  render: (value) => value || '—',
                },
                {
                  title: '擅长',
                  dataIndex: 'specialties',
                  width: 220,
                  render: (value: string[]) =>
                    value.slice(0, 3).map((item) => <Tag key={item}>{item}</Tag>),
                },
                {
                  title: '展示',
                  width: 170,
                  render: (_, record) => (
                    <Space wrap size={4}>
                      {record.isPinned ? <Tag color="gold">置顶</Tag> : null}
                      {record.isTrialConsultant ? <Tag color="cyan">试听咨询</Tag> : null}
                      <Tag color={record.relationshipStatus === 'active' ? 'success' : 'default'}>
                        {record.relationshipStatus === 'active' ? '在职' : '任职停用'}
                      </Tag>
                    </Space>
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
                  width: 100,
                  render: (_, record) =>
                    canManage ? (
                      <Button
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => {
                          setEditing(record);
                          setOpen(true);
                        }}
                      >
                        编辑
                      </Button>
                    ) : null,
                },
              ]}
            />
          </AsyncState>
        </Card>
      )}

      <TeacherModal
        open={open}
        teacher={editing}
        loading={createTeacher.isPending || updateTeacher.isPending}
        onClose={() => setOpen(false)}
        onSubmit={async (values) => {
          if (!institutionId) return;
          const common = {
            fullName: values.fullName.trim(),
            phone: nullable(values.phone),
            title: nullable(values.title),
            avatarUrl: nullable(values.avatarUrl),
            tagline: nullable(values.tagline),
            wechatQrUrl: nullable(values.wechatQrUrl),
            education: values.education?.trim() ?? '',
            teachingExperience: values.teachingExperience?.trim() ?? '',
            teachingStyle: values.teachingStyle?.trim() ?? '',
            achievements: values.achievements?.trim() ?? '',
            teachingYears: nullable(values.teachingYears),
            studentCount: nullable(values.studentCount),
            retentionRate: nullable(values.retentionRate),
            teachingPhilosophy: values.teachingPhilosophy?.trim() ?? '',
            classPhotoUrls: lines(values.classPhotoUrlsText),
            studentWorkUrls: lines(values.studentWorkUrlsText),
            parentTestimonials: lines(values.parentTestimonialsText),
            bio: values.bio?.trim() ?? '',
            specialties: lines(values.specialtiesText, /[、,，\r\n]+/),
            isPinned: values.isPinned,
            isTrialConsultant: values.isTrialConsultant,
          };
          try {
            if (editing) {
              const input: UpdateTeacherRequest = {
                ...common,
                status: values.status ?? editing.status,
                expectedRevision: editing.revision,
              };
              await updateTeacher.mutateAsync({ institutionId, teacherId: editing.id, input });
              void message.success('教师档案已更新');
            } else {
              await createTeacher.mutateAsync({
                institutionId,
                input: { ...common, identityUserId: null } as CreateTeacherRequest,
              });
              void message.success('教师档案已创建');
            }
            setOpen(false);
          } catch (error) {
            void message.error(error instanceof Error ? error.message : '教师档案保存失败');
          }
        }}
      />
    </PageContainer>
  );
}

function TeacherModal({
  open,
  teacher,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  teacher: InstitutionTeacher | null;
  loading: boolean;
  onClose(): void;
  onSubmit(values: TeacherFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<TeacherFormValues>();
  const avatarUrl = Form.useWatch('avatarUrl', form);
  return (
    <Modal
      title={teacher ? '编辑教师档案' : '新增教师'}
      open={open}
      width={920}
      okText={teacher ? '保存修改' : '创建教师'}
      cancelText="取消"
      confirmLoading={loading}
      destroyOnHidden
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
      onCancel={onClose}
      onOk={() => form.submit()}
      afterOpenChange={(visible) => {
        if (visible) form.setFieldsValue(formValues(teacher));
      }}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Tabs
          items={[
            {
              key: 'basic',
              label: '基础资料',
              children: (
                <>
                  <Row gutter={16}>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="fullName"
                        label="姓名"
                        rules={[{ required: true, max: 120 }]}
                      >
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="phone" label="电话">
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col xs={24} md={12}>
                      <Form.Item name="title" label="职称 / 头衔" rules={[{ max: 120 }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="tagline" label="一句话简介" rules={[{ max: 200 }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16} align="middle">
                    <Col xs={24} md={20}>
                      <Form.Item name="avatarUrl" label="头像图片 URL" rules={[{ max: 500 }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={4}>
                      {avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          width={56}
                          height={56}
                          style={{ objectFit: 'cover' }}
                        />
                      ) : null}
                    </Col>
                  </Row>
                  <Form.Item name="wechatQrUrl" label="个人微信二维码 URL" rules={[{ max: 500 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="specialtiesText" label="擅长" tooltip="用顿号或逗号分隔">
                    <Input />
                  </Form.Item>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="teachingYears" label="教学年限" rules={[{ max: 40 }]}>
                        <Input placeholder="如 8年" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="studentCount" label="累计学员" rules={[{ max: 40 }]}>
                        <Input placeholder="如 500+" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="retentionRate" label="专业积累" rules={[{ max: 40 }]}>
                        <Input placeholder="如 3000小时" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col xs={24} md={8}>
                      <Form.Item name="status" label="档案状态">
                        <Select
                          options={[
                            { label: '正常', value: 'active' },
                            { label: '停用', value: 'inactive' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={8}>
                      <Form.Item name="isPinned" label="首页置顶" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={8}>
                      <Form.Item
                        name="isTrialConsultant"
                        label="试听咨询教师"
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              ),
            },
            {
              key: 'profile',
              label: '专业介绍',
              children: (
                <>
                  <Form.Item name="bio" label="个人简介" rules={[{ max: 4_000 }]}>
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} />
                  </Form.Item>
                  <Form.Item name="teachingPhilosophy" label="教学理念" rules={[{ max: 4_000 }]}>
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} />
                  </Form.Item>
                  <Form.Item name="education" label="毕业院校 / 专业背景" rules={[{ max: 4_000 }]}>
                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
                  </Form.Item>
                  <Form.Item name="teachingExperience" label="教学经验" rules={[{ max: 4_000 }]}>
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} />
                  </Form.Item>
                  <Form.Item name="teachingStyle" label="教学风格" rules={[{ max: 4_000 }]}>
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} />
                  </Form.Item>
                  <Form.Item
                    name="achievements"
                    label="荣誉奖项 / 代表经历"
                    rules={[{ max: 4_000 }]}
                  >
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'media',
              label: '图片与评价',
              children: (
                <>
                  <Form.Item
                    name="classPhotoUrlsText"
                    label="课堂照片 URL"
                    tooltip="每行一张，最多 24 张"
                  >
                    <Input.TextArea rows={5} />
                  </Form.Item>
                  <Form.Item
                    name="studentWorkUrlsText"
                    label="学员作品 URL"
                    tooltip="每行一张，最多 24 张"
                  >
                    <Input.TextArea rows={5} />
                  </Form.Item>
                  <Form.Item
                    name="parentTestimonialsText"
                    label="家长评价"
                    tooltip="每行一条，最多 12 条"
                  >
                    <Input.TextArea rows={5} />
                  </Form.Item>
                </>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
}
