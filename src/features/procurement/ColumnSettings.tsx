import { Button, Checkbox, Popover, Space } from 'antd';
export function ColumnSettings({
  options,
  selected,
  onChange,
  defaults,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  defaults: readonly string[];
}) {
  return (
    <Popover
      trigger="click"
      title="列设置"
      content={
        <Space orientation="vertical">
          <Checkbox.Group
            options={options}
            value={selected}
            onChange={(v) => onChange(v.map(String))}
          />
          <Button type="link" onClick={() => onChange([...defaults])}>
            恢复默认列
          </Button>
        </Space>
      }
    >
      <Button>列设置</Button>
    </Popover>
  );
}
