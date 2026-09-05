import { SearchOutlined } from '@ant-design/icons';
import { AutoComplete, Input, Modal } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AdminNavigationItem } from '../app/navigation';

export function CommandPalette({ items }: { items: AdminNavigationItem[] }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const options = useMemo(
    () => items.map((item) => ({ label: item.label, value: item.path })),
    [items],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Modal
      title="快速导航"
      open={open}
      footer={null}
      destroyOnHidden
      onCancel={() => setOpen(false)}
      afterOpenChange={(visible) => {
        if (!visible) setOpen(false);
      }}
    >
      <AutoComplete
        autoFocus
        options={options}
        style={{ width: '100%' }}
        onSelect={(path) => {
          navigate(path);
          setOpen(false);
        }}
      >
        <Input size="large" prefix={<SearchOutlined />} placeholder="输入页面名称" />
      </AutoComplete>
    </Modal>
  );
}
