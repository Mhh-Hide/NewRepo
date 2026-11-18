import { describe, it, expect } from 'vitest';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { SupplierRepository } from '../../src/mocks/supplier-repository';
import { ChannelRepository } from '../../src/mocks/channel-repository';
import { SourcingRepository } from '../../src/mocks/sourcing-repository';
import { QuoteRepository } from '../../src/mocks/quote-repository';
function setup() {
  const values = new Map<string, string>();
  const port = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
  const s = new SupplierRepository(port),
    c = new ChannelRepository(port),
    d = new SourcingRepository(port),
    q = new QuoteRepository(port);
  return (id = 'u-ops') =>
    createMockAdapter(id, undefined, s, () => true, c, d, q);
}
const input = {
  date: '2026-11-18',
  description: '演示超时事故',
  scope: '一个测试渠道',
  result: '待处理',
  note: '演示记录',
  channelIds: ['ch-1'],
};
describe('07G cooperation records', () => {
  it('creates, edits and keeps immutable incident history and actor', async () => {
    const api = setup(),
      a = api('u-proc');
    await a.saveSupplierAccident('s-1', null, 0, input);
    const first = (await a.supplierAccidents('s-1'))[0]!;
    expect(first.createdBy).toBe('u-proc');
    await a.saveSupplierAccident('s-1', first.id, first.version, {
      ...input,
      result: '已恢复',
    });
    const next = (await a.supplierAccidents('s-1'))[0]!;
    expect(next.history).toHaveLength(2);
    expect(next.history[0]!.after.result).toBe('待处理');
    expect(next.history[1]!.before?.result).toBe('待处理');
    expect(next.result).toBe('已恢复');
    await expect(
      a.saveSupplierAccident('s-1', first.id, first.version, input),
    ).rejects.toThrow();
  });
  it('rejects another supplier channel and front-office incident writes', async () => {
    const api = setup();
    await expect(
      api().saveSupplierAccident('s-1', null, 0, {
        ...input,
        channelIds: ['ch-3'],
      }),
    ).rejects.toThrow();
    await expect(
      api('u-sales').saveSupplierAccident('s-1', null, 0, input),
    ).rejects.toThrow();
    expect(await api('u-sales').supplierAccidents('s-1')).toEqual([]);
  });
  it('focus is reversible without modifying quote history and unavailable to sales', async () => {
    const api = setup(),
      a = api();
    const before = await a.getQuote('q-1');
    await a.setQuoteFollowup('q-1', true);
    expect(await a.quoteFollowup('q-1')).toBe(true);
    await a.setQuoteFollowup('q-1', false);
    expect(await a.quoteFollowup('q-1')).toBe(false);
    expect(await a.getQuote('q-1')).toEqual(before);
    await expect(
      api('u-sales').setQuoteFollowup('q-1', true),
    ).rejects.toThrow();
  });
});
