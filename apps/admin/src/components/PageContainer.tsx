import { Breadcrumb, type BreadcrumbProps } from 'antd';
import type { ReactNode } from 'react';

export interface PageContainerProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: BreadcrumbProps['items'];
  children: ReactNode;
}

export function PageContainer({
  title,
  description,
  actions,
  breadcrumbs,
  children,
}: PageContainerProps) {
  return (
    <div className="page-container">
      {breadcrumbs && <Breadcrumb items={breadcrumbs} style={{ marginBottom: 14 }} />}
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div>{actions}</div>}
      </header>
      {children}
    </div>
  );
}
