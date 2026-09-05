import { Button, Result, Spin } from 'antd';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useConfirmEmailVerification } from './hooks';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const verification = useConfirmEmailVerification();
  const token = searchParams.get('token') ?? '';

  useEffect(() => {
    if (token && verification.isIdle) verification.mutate(token);
  }, [token, verification]);

  if (!token) return <Result status="warning" title="缺少邮箱验证令牌" />;
  if (verification.isPending) return <Result icon={<Spin size="large" />} title="正在验证邮箱" />;
  if (verification.isError) {
    return (
      <Result
        status="error"
        title="验证失败"
        subTitle={verification.error.message}
        extra={
          <Button>
            <Link to="/login">返回登录</Link>
          </Button>
        }
      />
    );
  }
  return (
    <Result
      status="success"
      title="邮箱验证成功"
      extra={
        <Button type="primary">
          <Link to="/login">返回登录</Link>
        </Button>
      }
    />
  );
}
