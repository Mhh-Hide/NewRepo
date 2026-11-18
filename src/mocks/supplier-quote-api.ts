import type { AccessContext } from '../auth/types';
import { can } from '../auth/policy';
import type { SupplierQuoteApi } from '../services/supplier-quote-types';
import type { ApiAdapter } from '../services/api-adapter';
import type { StoragePort } from './supplier-repository';
import { atomicStorage } from '../services/atomic-storage';
import { stableFingerprint } from './quote-command';
import { SupplierError } from '../services/supplier-types';
import { fixture } from './data';
export const supplierQuoteReceiptsKey = 'maas-supplier-quote-receipts-v1';
interface Receipt {
  key: string;
  fingerprint: string;
  ownerId: string;
  batchId: string;
  quoteIds: string[];
}
export function createSupplierQuoteApi(
  ctx: AccessContext | null,
  active: () => boolean,
  storage: StoragePort,
  makeAdapter: (port: StoragePort) => ApiAdapter,
): SupplierQuoteApi {
  return {
    async saveSupplierQuote(input, key) {
      if (
        !ctx ||
        !active() ||
        !can(ctx, 'bulk:submit') ||
        !can(ctx, 'channel:create')
      )
        throw new SupplierError('FORBIDDEN', '当前身份无供应商报价权限。');
      if (
        !/^[A-Za-z0-9_-]{8,100}$/.test(key) ||
        !input.rows.length ||
        input.rows.length > 100
      )
        throw new SupplierError('VALIDATION', '请填写 1–100 行报价。');
      const port = atomicStorage(storage),
        observed = new Map<string, string | null>(),
        changes = new Map<string, string>();
      const stage: StoragePort = {
        getItem(k) {
          if (k === 'maas-atomic-demo-v1') return null;
          if (changes.has(k)) return changes.get(k)!;
          const v = port.getItem(k);
          if (!observed.has(k)) observed.set(k, v);
          return v;
        },
        setItem(k, v) {
          if (!observed.has(k)) observed.set(k, port.getItem(k));
          changes.set(k, v);
        },
      };
      const receipts: Receipt[] = JSON.parse(
        stage.getItem(supplierQuoteReceiptsKey) ?? '[]',
      ) as Receipt[];
      const fingerprint = stableFingerprint(input),
        requestKey = `${ctx.user.id}:${key}`,
        old = receipts.find((r) => r.key === requestKey);
      if (old) {
        if (old.fingerprint !== fingerprint)
          throw new SupplierError(
            'CONFLICT',
            '保存请求内容已变化，请重新提交。',
          );
        return { batchId: old.batchId, quoteIds: old.quoteIds };
      }
      const owner = fixture.users.find(
        (u) => u.id === input.ownerId && u.role === 'Procurement',
      );
      if (!owner) throw new SupplierError('VALIDATION', '请选择采购负责人。');
      const api = makeAdapter(stage);
      const allowedModels = await api.listModels();
      for (const row of input.rows) {
        const model = allowedModels.find((m) => m.id === row.modelId);
        const domain = fixture.vendors.find(
          (v) => v.id === model?.vendorId,
        )?.businessDomain;
        if (
          !domain ||
          !fixture.domainGrants.some(
            (g) => g.userId === owner.id && g.businessDomain === domain,
          )
        )
          throw new SupplierError(
            'FORBIDDEN',
            '模型或负责人不在授权厂商范围。',
          );
      }
      const batch = await api.createBulkBatch(
        {
          supplierId: input.supplierId,
          sourceReference: `mock:quote:${key}`,
          sharedReason: input.remark || '供应商报价',
        },
        `create-${key}`,
      );
      const items = [];
      for (const row of input.rows) {
        const existing = row.channelId
          ? (await api.quoteOptions()).channels.find(
              (c) =>
                c.channel.id === row.channelId &&
                c.supplier.id === input.supplierId &&
                c.model.id === row.modelId &&
                c.channel.channelType === row.channelType,
            )
          : null;
        if (row.channelId && !existing)
          throw new SupplierError(
            'FORBIDDEN',
            '已有渠道与供应商、模型或类型不一致。',
          );
        const channel =
          existing?.channel ??
          (await api.createChannel({
            supplierId: input.supplierId,
            modelId: row.modelId,
            displayName: row.displayName,
            channelType: row.channelType,
            modelInvocationName: row.modelInvocationName,
            endpointReference: row.endpointReference,
            tpm: row.tpm,
            rpm: row.rpm,
            concurrencyLimit: row.concurrencyLimit,
            ttftMs: row.ttftMs,
          }));
        items.push({
          itemId: `item-${crypto.randomUUID()}`,
          proposedQuoteInput: {
            channelId: channel.id,
            discount: row.discount,
            priceStatus: row.promotionFrom
              ? ('temporary' as const)
              : ('reference' as const),
            effectiveFrom: row.promotionFrom ?? null,
            effectiveUntil: row.promotionUntil ?? null,
            sourceType: row.promotionFrom
              ? ('promotion' as const)
              : ('supplier_submission' as const),
            supplierQuotedAt: input.quotedAt,
            supplierSubmitterReference: `mock:staff:${ctx.user.id}`,
            reason:
              [
                input.remark,
                row.note,
                row.cacheRequirement ? `缓存要求：${row.cacheRequirement}` : '',
              ]
                .filter(Boolean)
                .join('；') || '供应商报价',
            priceSpec: {
              currency: null,
              referencePriceSource: null,
              specification: null,
              rates: [],
            },
          },
        });
      }
      const draft = await api.updateBulkDraft(
        batch.batch.id,
        batch.batch.version,
        {
          sourceReference: batch.batch.sourceReference,
          sharedReason: batch.batch.sharedReason,
          items,
        },
        `draft-${key}`,
      );
      const preview = await api.previewBulkBatch(
        draft.batch.id,
        draft.batch.version,
      );
      if (!preview.canSubmit)
        throw new SupplierError(
          'VALIDATION',
          preview.rows
            .flatMap((r) =>
              r.errors.map((e) => `第${r.rowNumber}行：${e.message}`),
            )
            .join('；') || '报价校验失败',
        );
      const saved = await api.submitBulkBatch(
        draft.batch.id,
        draft.batch.version,
        preview.token,
        true,
        `submit-${key}`,
      );
      const result = {
        batchId: draft.batch.id,
        quoteIds: saved.mappings.map((m) => m.quoteId),
      };
      stage.setItem(
        supplierQuoteReceiptsKey,
        JSON.stringify([
          ...receipts,
          { key: requestKey, fingerprint, ownerId: owner.id, ...result },
        ]),
      );
      if (!active())
        throw new SupplierError('FORBIDDEN', '身份已切换，请重新保存。');
      port.commit(changes, observed);
      return result;
    },
  };
}
