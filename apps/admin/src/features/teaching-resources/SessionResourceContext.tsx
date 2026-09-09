import { LinkOutlined } from '@ant-design/icons';
import type {
  LessonSession,
  SessionResourceContext as SessionResourceContextType,
  UpdateSessionResourceContextRequest,
} from '@lingcoo-edu-oms/contracts';
import { Alert, Button, Form, Modal, Select, Space, Spin, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';

import {
  useCampuses,
  useClasses,
  useClassrooms,
  useCourses,
  useSessionResourceContext,
  useUpdateSessionResourceContext,
} from './hooks';

export function SessionResourceContext({
  session,
  canManage,
}: {
  session: LessonSession;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const query = useSessionResourceContext(session.institutionId, session.id);
  const courses = useCourses(session.institutionId, { page: 1, pageSize: 100 });
  const classes = useClasses(session.institutionId, { page: 1, pageSize: 100 });
  const campuses = useCampuses({ page: 1, pageSize: 100, status: 'active' });
  const context = query.data;
  const labels = [
    ['课程', context?.courseName],
    ['班级', context?.classGroupName],
    ['校区', context?.campusName],
    ['教室', context?.classroomName],
  ].filter((v): v is [string, string] => Boolean(v[1]));
  return (
    <div
      style={{
        margin: '0 20px 16px',
        padding: '12px 14px',
        border: '1px solid #f0f0f0',
        borderRadius: 8,
        background: '#fafafa',
      }}
    >
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <div>
          <Typography.Text strong>资源上下文</Typography.Text>
          <div style={{ marginTop: 8 }}>
            {query.isPending ? (
              <Spin size="small" />
            ) : labels.length ? (
              <Space wrap>
                {labels.map(([k, v]) => (
                  <Tag key={k}>
                    {k}：{v}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Typography.Text type="secondary">未关联资源；不影响课次和课时权益</Typography.Text>
            )}
          </div>
        </div>
        {canManage && ['draft', 'open'].includes(session.status) && (
          <Button size="small" icon={<LinkOutlined />} onClick={() => setOpen(true)}>
            关联资源
          </Button>
        )}
      </Space>
      <ResourceModal
        open={open}
        context={context}
        session={session}
        courses={courses.data?.items ?? []}
        classes={classes.data?.items ?? []}
        campuses={campuses.data?.items ?? []}
        loading={false}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

function ResourceModal({
  open,
  context,
  session,
  courses,
  classes,
  campuses,
  loading,
  onClose,
}: {
  open: boolean;
  context?: SessionResourceContextType;
  session: LessonSession;
  courses: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; name: string }>;
  campuses: Array<{ id: string; name: string }>;
  loading: boolean;
  onClose(): void;
}) {
  const [form] = Form.useForm<UpdateSessionResourceContextRequest>();
  const update = useUpdateSessionResourceContext();
  const campusId = Form.useWatch('campusId', form);
  const classrooms = useClassrooms(campusId ?? context?.campusId ?? null, {
    page: 1,
    pageSize: 100,
    status: 'active',
  });
  useEffect(() => {
    if (open)
      form.setFieldsValue({
        expectedRevision: session.revision,
        courseId: context?.courseId ?? null,
        classGroupId: context?.classGroupId ?? null,
        campusId: context?.campusId ?? null,
        classroomId: context?.classroomId ?? null,
      });
  }, [context, form, open, session.revision]);
  async function submit(values: UpdateSessionResourceContextRequest) {
    await update.mutateAsync({
      institutionId: session.institutionId,
      sessionId: session.id,
      input: { ...values, expectedRevision: session.revision },
    });
    onClose();
  }
  return (
    <Modal
      open={open}
      destroyOnHidden
      title="关联课次资源"
      okText="保存关联"
      cancelText="取消"
      confirmLoading={loading || update.isPending}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="courseId" label="课程（可选）">
          <Select allowClear options={courses.map((x) => ({ value: x.id, label: x.name }))} />
        </Form.Item>
        <Form.Item name="classGroupId" label="班级（可选）">
          <Select allowClear options={classes.map((x) => ({ value: x.id, label: x.name }))} />
        </Form.Item>
        <Form.Item name="campusId" label="校区（可选）">
          <Select allowClear options={campuses.map((x) => ({ value: x.id, label: x.name }))} />
        </Form.Item>
        <Form.Item name="classroomId" label="教室（可选）">
          <Select
            allowClear
            options={(classrooms.data?.items ?? []).map((x) => ({ value: x.id, label: x.name }))}
          />
        </Form.Item>
        <Alert
          type="info"
          showIcon
          message="关系可以全部清空"
          description="资源仅作为课次上下文，不会限定课时包、名单、签到或消课。"
        />
      </Form>
    </Modal>
  );
}
