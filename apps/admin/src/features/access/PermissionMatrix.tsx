import type { Permission, PermissionKey } from '@lingcoo-edu-oms/contracts';
import { Checkbox, Typography } from 'antd';

export function PermissionMatrix({
  catalog,
  value,
  disabled,
  onChange,
}: {
  catalog: Permission[];
  value: PermissionKey[];
  disabled?: boolean;
  onChange: (value: PermissionKey[]) => void;
}) {
  const groups = new Map<string, Permission[]>();
  for (const permission of catalog) {
    const items = groups.get(permission.group) ?? [];
    items.push(permission);
    groups.set(permission.group, items);
  }
  return (
    <div className="permission-matrix">
      {[...groups.entries()].map(([group, permissions]) => (
        <section className="permission-group" key={group}>
          <Typography.Title level={5}>{group}</Typography.Title>
          <Checkbox.Group
            value={value}
            disabled={disabled}
            onChange={(keys) => onChange(keys as PermissionKey[])}
          >
            <div className="permission-group__items">
              {permissions.map((permission) => (
                <Checkbox key={permission.key} value={permission.key}>
                  <span className="permission-option">
                    <span>{permission.name}</span>
                    <Typography.Text type="secondary">{permission.description}</Typography.Text>
                    <Typography.Text code>{permission.key}</Typography.Text>
                  </span>
                </Checkbox>
              ))}
            </div>
          </Checkbox.Group>
        </section>
      ))}
    </div>
  );
}
