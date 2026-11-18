import type { StoragePort } from '../mocks/supplier-repository';
/** A single storage write commits a set of repository snapshots. Legacy keys stay readable. */
const envelopeKey = 'maas-atomic-demo-v1';
const ports = new WeakMap<StoragePort, AtomicStorage>();
export interface AtomicStorage extends StoragePort {
  commit(
    changes: ReadonlyMap<string, string>,
    observed: ReadonlyMap<string, string | null>,
  ): void;
}
export function atomicStorage(base: StoragePort): AtomicStorage {
  const cached = ports.get(base);
  if (cached) return cached;
  const envelope = (): Record<string, string> => {
    const raw = base.getItem(envelopeKey);
    if (!raw) return {};
    const v: unknown = JSON.parse(raw);
    if (
      !v ||
      typeof v !== 'object' ||
      Array.isArray(v) ||
      !Object.values(v).every((x) => typeof x === 'string')
    )
      throw new Error('整批存储损坏，请恢复演示数据');
    return v as Record<string, string>;
  };
  const port: AtomicStorage = {
    getItem(k) {
      const e = envelope();
      return Object.hasOwn(e, k) ? e[k]! : base.getItem(k);
    },
    setItem(k, v) {
      const e = envelope();
      if (Object.keys(e).length) {
        e[k] = v;
        base.setItem(envelopeKey, JSON.stringify(e));
      } else base.setItem(k, v);
    },
    commit(changes, observed) {
      for (const [k, v] of observed)
        if (port.getItem(k) !== v)
          throw new Error('数据已变化，请重新保存报价');
      const next = envelope();
      for (const [k, v] of changes) next[k] = v;
      base.setItem(envelopeKey, JSON.stringify(next));
    },
  };
  ports.set(base, port);
  ports.set(port, port);
  return port;
}
