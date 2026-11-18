import type {
  CooperationApi,
  CooperationIncident,
} from '../services/cooperation-types';
import type { SupplierApi } from '../services/supplier-types';
import { SupplierError } from '../services/supplier-types';
import type { QuotationApi } from '../services/quotation-types';
import type { StoragePort } from './supplier-repository';
import type { Channel } from '../domain/entities';
export function createCooperationApi(
  suppliers: SupplierApi,
  quotes: QuotationApi,
  channels: () => readonly Channel[],
  storage: StoragePort,
  active: () => boolean,
  actorId: string,
): CooperationApi {
  const read = (): CooperationIncident[] =>
    JSON.parse(
      storage.getItem('maas-cooperation-incidents-v1') ?? '[]',
    ) as CooperationIncident[];
  const stars = (): string[] =>
    JSON.parse(storage.getItem('maas-quote-followup-v1') ?? '[]') as string[];
  return {
    async supplierAccidents(supplierId) {
      const s = await suppliers.getSupplier(supplierId);
      return s?.capabilities.edit
        ? structuredClone(read().filter((r) => r.supplierId === supplierId))
        : [];
    },
    async saveSupplierAccident(supplierId, id, version, input) {
      const s = await suppliers.getSupplier(supplierId);
      if (!active() || !s?.capabilities.edit)
        throw new SupplierError('FORBIDDEN', '无事故记录维护权限。');
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
        !Number.isFinite(Date.parse(input.date)) ||
        !input.description.trim() ||
        [input.description, input.scope, input.result, input.note].some(
          (v) => typeof v !== 'string' || v.length > 4000,
        ) ||
        input.channelIds.some(
          (id) =>
            !channels().some((c) => c.id === id && c.supplierId === supplierId),
        )
      )
        throw new SupplierError(
          'VALIDATION',
          '请检查日期、问题描述及关联渠道。',
        );
      const rows = read(),
        old = id
          ? rows.find((r) => r.id === id && r.supplierId === supplierId)
          : null;
      if (id && (!old || old.version !== version))
        throw new SupplierError('CONFLICT', '事故记录已变化，请刷新。');
      const at = new Date().toISOString();
      const actor = actorId;
      const next: CooperationIncident = {
        ...input,
        id: old?.id ?? crypto.randomUUID(),
        supplierId,
        createdBy: old?.createdBy ?? actor,
        updatedAt: at,
        version: (old?.version ?? 0) + 1,
        history: [
          ...(old?.history ?? []),
          {
            actor,
            at,
            before: old
              ? {
                  date: old.date,
                  description: old.description,
                  scope: old.scope,
                  result: old.result,
                  note: old.note,
                  channelIds: old.channelIds,
                }
              : null,
            after: input,
          },
        ],
      };
      storage.setItem(
        'maas-cooperation-incidents-v1',
        JSON.stringify([...rows.filter((r) => r.id !== id), next]),
      );
    },
    async quoteFollowup(id) {
      if (!(await quotes.getQuote(id)))
        throw new SupplierError('FORBIDDEN', '报价无权访问。');
      return stars().includes(id);
    },
    async setQuoteFollowup(id, value) {
      if (!active() || !(await quotes.getQuote(id)))
        throw new SupplierError('FORBIDDEN', '报价无权维护。');
      const next = stars().filter((v) => v !== id);
      if (value) next.push(id);
      storage.setItem('maas-quote-followup-v1', JSON.stringify(next));
    },
  };
}
