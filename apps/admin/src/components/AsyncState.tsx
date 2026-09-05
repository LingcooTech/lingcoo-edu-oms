import { Alert, Empty, Flex, Spin } from 'antd';
import type { ReactNode } from 'react';

export function AsyncState({
  loading,
  error,
  empty,
  children,
}: {
  loading?: boolean;
  error?: Error | null;
  empty?: boolean;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 160 }}>
        <Spin description="加载中" />
      </Flex>
    );
  }
  if (error) return <Alert type="error" showIcon title="加载失败" description={error.message} />;
  if (empty) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />;
  return children;
}
