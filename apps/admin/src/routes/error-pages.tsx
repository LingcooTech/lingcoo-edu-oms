import { Button, Result, Typography } from 'antd';
import { Link } from 'react-router-dom';

export function UnauthorizedPage() {
  return (
    <div className="error-page">
      <Result
        status="warning"
        title="需要登录"
        subTitle="当前登录状态已失效，请重新登录。"
        extra={
          <Link to="/">
            <Button type="primary">返回概览</Button>
          </Link>
        }
      />
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <div className="error-page">
      <Result
        status="403"
        title="无权访问"
        subTitle="当前账号没有访问该资源所需的权限。"
        extra={
          <Link to="/">
            <Button type="primary">返回概览</Button>
          </Link>
        }
      />
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="error-page">
      <Result
        status="404"
        title="页面不存在"
        subTitle="请检查地址，或返回后台概览。"
        extra={
          <Link to="/">
            <Button type="primary">返回概览</Button>
          </Link>
        }
      />
    </div>
  );
}

export function AppCrashPage({ error, onReset }: { error: unknown; onReset: () => void }) {
  const message = error instanceof Error ? error.message : '发生了未知错误';
  return (
    <div className="error-page">
      <Result
        status="500"
        title="应用加载失败"
        subTitle="后台捕获到了未处理异常。"
        extra={
          <Button type="primary" onClick={onReset}>
            重试
          </Button>
        }
      >
        <Typography.Text type="secondary">{message}</Typography.Text>
      </Result>
    </div>
  );
}
