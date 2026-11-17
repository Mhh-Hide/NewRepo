import { describe, it, expect, vi } from 'vitest';
import {
  businessStorage,
  enablePrivateData,
} from '../../src/services/runtime-data';
describe('private local business data', () => {
  it('isolates all private writes in memory and ignores previously persisted sample records', () => {
    localStorage.setItem('maas-private-check', 'old sample');
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    enablePrivateData();
    expect(businessStorage.getItem('maas-private-check')).toBeNull();
    businessStorage.setItem('maas-private-check', 'internal record');
    expect(businessStorage.getItem('maas-private-check')).toBe(
      'internal record',
    );
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    enablePrivateData();
    expect(businessStorage.getItem('maas-private-check')).toBeNull();
    read.mockRestore();
    write.mockRestore();
  });
});
