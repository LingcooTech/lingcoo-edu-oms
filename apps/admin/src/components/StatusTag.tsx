import { Tag } from 'antd';

const colors = {
  success: 'success',
  warning: 'warning',
  error: 'error',
  neutral: 'default',
  processing: 'processing',
} as const;

export function StatusTag({ tone, children }: { tone: keyof typeof colors; children: string }) {
  return <Tag color={colors[tone]}>{children}</Tag>;
}
