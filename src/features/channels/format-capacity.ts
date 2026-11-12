export function formatCapacity(value: number | null): string {
  return value === null ? '未知' : value.toLocaleString('zh-CN');
}
