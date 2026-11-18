import { InputNumber } from 'antd';
/** All forms retain bps values; only this boundary accepts business discount units. */
export function DiscountInput({
  value,
  onChange,
  ...props
}: {
  value?: number | null;
  onChange?: (v: number | null) => void;
  'aria-label'?: string;
  placeholder?: string;
}) {
  return (
    <InputNumber
      {...props}
      min={0}
      max={10}
      step={0.1}
      precision={2}
      suffix="折"
      value={value == null ? null : value / 1000}
      onChange={(v) => onChange?.(v == null ? null : Math.round(v * 1000))}
      style={{ width: '100%' }}
    />
  );
}
