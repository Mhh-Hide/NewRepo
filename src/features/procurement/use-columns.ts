import { useState } from 'react';
export function useColumns(key: string, defaults: readonly string[]) {
  const [selected, setSelected] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      return Array.isArray(value) && value.every((v) => typeof v === 'string')
        ? value
        : [...defaults];
    } catch {
      return [...defaults];
    }
  });
  const update = (value: string[]) => {
    setSelected(value);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Preferences are optional; business data never enters this store. */
    }
  };
  return { selected, update };
}
