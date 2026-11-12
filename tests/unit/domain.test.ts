import { describe, expect, it } from 'vitest';
import { fixture as data } from '../../src/mocks/data';
import {
  appendQuote,
  bindOpChannelId,
  canExemptQuality,
  discountBps,
  modelDomain,
  supplierCoverage,
} from '../../src/domain/rules';
import { validateStore } from '../../src/domain/validation';
import {
  availabilityStatusLabels,
  connectivityStatusLabels,
  incidentStatusLabels,
  integrationStatusLabels,
  qualityStatusLabels,
  quoteStatusLabels,
  remediationStatusLabels,
  sourcingStatusLabels,
} from '../../src/domain/statuses';
const channel = data.channels.find((c) => c.id === 'ch-1')!;
const quote = data.quotes.find((q) => q.id === 'q-1')!;
describe('domain graph and invariants', () => {
  it('validates all fixture IDs and foreign keys', () => {
    expect(validateStore(data)).toEqual([]);
  });
  it('links every model to its vendor', () => {
    for (const m of data.models)
      expect(data.vendors.some((v) => v.id === m.vendorId)).toBe(true);
  });
  it('one model has multiple suppliers, one supplier has multiple models', () => {
    expect(
      new Set(
        data.channels
          .filter((c) => c.modelId === 'm-seed-cn')
          .map((c) => c.supplierId),
      ).size,
    ).toBe(3);
    expect(
      new Set(
        data.channels
          .filter((c) => c.supplierId === 's-1')
          .map((c) => c.modelId),
      ).size,
    ).toBe(2);
  });
  it('allows multiple channels for one supplier/model pair', () => {
    expect(
      data.channels.filter(
        (c) => c.modelId === 'm-seed-cn' && c.supplierId === 's-1',
      ),
    ).toHaveLength(2);
  });
  it('rejects duplicate channel IDs but permits missing OP IDs', () => {
    expect(new Set(data.channels.map((c) => c.id)).size).toBe(
      data.channels.length,
    );
    expect(channel.opChannelId).toBeNull();
    expect(
      validateStore({ ...data, channels: [...data.channels, channel] }),
    ).toContain('Duplicate channels id');
  });
  it('derives both Seedance regional variants from the domestic vendor', () => {
    for (const id of ['m-seed-cn', 'm-seed-os'])
      expect(
        modelDomain(
          data.models.find((m) => m.id === id)!,
          data.vendors,
        ),
      ).toBe('domestic');
    for (const id of ['m-gpt', 'm-claude', 'm-gemini', 'm-grok'])
      expect(
        modelDomain(
          data.models.find((m) => m.id === id)!,
          data.vendors,
        ),
      ).toBe('overseas');
  });
  it('does not silently infer a domain for a missing vendor', () => {
    expect(() =>
      modelDomain({ ...data.models[0]!, vendorId: 'missing' }, data.vendors),
    ).toThrow();
  });
  it('distinguishes version/region identity rather than display names', () => {
    const model = data.models[0]!;
    expect(
      validateStore({
        ...data,
        models: [...data.models, { ...model, id: 'duplicate-model' }],
      }),
    ).toContain('Duplicate model identity');
    expect(
      validateStore({
        ...data,
        models: [
          ...data.models,
          { ...model, id: 'version-model', version: 'mock-v2' },
        ],
      }),
    ).toEqual([]);
  });
  it('validates supplier name and code independently', () => {
    const supplier = data.suppliers[0]!;
    const errors = validateStore({
      ...data,
      suppliers: [...data.suppliers, { ...supplier, id: 'new-supplier' }],
    });
    expect(errors).toContain('Duplicate supplier name');
    expect(errors).toContain('Duplicate supplier shortCode');
  });
  it('keeps a cross-domain supplier master unique', () => {
    expect(data.suppliers.filter((s) => s.id === 's-1')).toHaveLength(1);
    expect(
      new Set(
        data.channels
          .filter((c) => c.supplierId === 's-1')
          .map((c) =>
            modelDomain(
              data.models.find((m) => m.id === c.modelId)!,
              data.vendors,
            ),
          ),
      ),
    ).toEqual(new Set(['domestic', 'overseas']));
  });
  it('preserves confirmed quote history and distinguishes corrections', () => {
    expect(data.quotes.find((q) => q.id === 'q-2')?.previousQuoteId).toBe(
      'q-1',
    );
    expect(quote.discount).toBe(9000);
    const next = appendQuote(data.quotes, {
      ...quote,
      id: 'q-next',
      discount: discountBps(8800),
      previousQuoteId: quote.id,
    });
    expect(next).toHaveLength(data.quotes.length + 1);
    expect(data.quotes.find((q) => q.id === quote.id)?.discount).toBe(9000);
    expect(data.quotes.find((q) => q.id === 'q-6')?.sourceType).toBe(
      'correction',
    );
    expect(() => appendQuote(data.quotes, quote)).toThrow();
  });
  it('temporary promotions coexist with formal and pending quotes', () => {
    const history = data.quotes.filter((q) => q.channelId === 'ch-1');
    expect(history.map((q) => q.priceStatus)).toEqual(
      expect.arrayContaining(['effective', 'temporary', 'pending_contract']),
    );
    expect(
      history.find((q) => q.priceStatus === 'temporary')?.effectiveUntil,
    ).not.toBeNull();
    expect(history.find((q) => q.id === 'q-1')?.effectiveUntil).toBeNull();
    expect(() =>
      appendQuote(data.quotes, {
        ...quote,
        id: 'q-bad',
        priceStatus: 'temporary',
        effectiveUntil: null,
      }),
    ).toThrow();
  });
  it('rejects incomplete confirmations, invalid promotion dates and unlinked corrections', () => {
    expect(() =>
      appendQuote(data.quotes, {
        ...quote,
        id: 'q-incomplete',
        confirmedBy: null,
      }),
    ).toThrow();
    expect(() =>
      appendQuote(data.quotes, {
        ...quote,
        id: 'q-invalid-promo',
        priceStatus: 'temporary',
        effectiveFrom: 'invalid',
        effectiveUntil: 'invalid',
      }),
    ).toThrow();
    expect(() =>
      appendQuote(data.quotes, {
        ...quote,
        id: 'q-invalid-correction',
        sourceType: 'correction',
        previousQuoteId: null,
      }),
    ).toThrow();
  });
  it('uses exact fixed point discount values', () => {
    expect(discountBps(8000)).toBe(8000);
    for (const n of [0.8, -1, 10001, NaN, Infinity])
      expect(() => discountBps(n)).toThrow();
  });
  it('does not permit replacement of an OP binding', () => {
    const bound = bindOpChannelId(channel, 'mock-op');
    expect(channel.opChannelId).toBeNull();
    expect(bindOpChannelId(bound, 'mock-op').opChannelId).toBe('mock-op');
    expect(() => bindOpChannelId(bound, 'other')).toThrow();
    expect(() => bindOpChannelId(channel, ' ')).toThrow();
  });
  it('retains repeated executions of one channel test task', () => {
    expect(data.testExecutions.filter((e) => e.taskId === 'tt-1')).toHaveLength(
      2,
    );
    expect(
      data.testExecutions.filter((e) => e.taskId === 'tt-1').map((e) => e.id),
    ).toEqual(['te-1', 'te-2']);
  });
  it('quality and connectivity are independent and do not imply integration', () => {
    const c = data.channels.find((c) => c.id === 'ch-3')!;
    expect(c.qualityStatus).toBe('passed');
    expect(c.connectivityStatus).toBe('passed');
    expect(c.integrationStatus).toBe('not_started');
    expect(c.availabilityStatus).toBe('closed');
    expect(channel.qualityStatus).toBe('exempted');
    expect(channel.connectivityStatus).toBe('pending');
  });
  it('requires verification evidence for quality exemption, never exempts connectivity', () => {
    expect(canExemptQuality(channel, data.exemptions)).toBe(true);
    expect(canExemptQuality(channel, [])).toBe(false);
    expect(
      canExemptQuality(
        { ...channel, channelType: 'official_proxy' },
        data.exemptions,
      ),
    ).toBe(false);
    expect(
      canExemptQuality(
        { ...channel, sourceVerificationStatus: 'unverified' },
        data.exemptions,
      ),
    ).toBe(false);
    for (const c of data.channels)
      expect(
        data.testTasks.some(
          (t) => t.channelId === c.id && t.testType === 'connectivity',
        ),
      ).toBe(true);
  });
  it('matches one demand item to several channels and counts distinct suppliers', () => {
    const channels = data.channels.filter((c) =>
      data.matches.some(
        (m) => m.demandItemId === 'di-1' && m.channelId === c.id,
      ),
    );
    expect(channels).toHaveLength(4);
    expect(supplierCoverage(channels)).toEqual({
      supplierCount: 3,
      shortfall: 0,
    });
    expect(supplierCoverage([channel, channel])).toEqual({
      supplierCount: 1,
      shortfall: 2,
    });
    expect(
      validateStore({ ...data, matches: data.matches.slice(0, 1) }),
    ).toEqual([]);
  });
  it('preserves null unknown capabilities instead of zero', () => {
    const c = data.channels.find((c) => c.id === 'ch-2')!;
    expect(c.tpm).toBeNull();
    expect(c.rpm).toBeNull();
  });
  it('detects mismatched demand, remediation and incident relationships', () => {
    expect(
      validateStore({
        ...data,
        matches: [{ ...data.matches[0]!, channelId: 'ch-5' }],
      }),
    ).toContain('Invalid reference: match.channelId/modelId');
    expect(
      validateStore({
        ...data,
        remediations: [
          { ...data.remediations[0]!, relatedTestExecutionId: 'te-4' },
        ],
      }),
    ).toContain('Invalid reference: remediation.execution/channel');
    expect(
      validateStore({
        ...data,
        incidents: [{ ...data.incidents[0]!, supplierId: 's-3' }],
      }),
    ).toContain('Invalid reference: incident.channel/supplier');
  });
  it('keeps independently named status dictionaries with Chinese labels', () => {
    for (const dict of [
      sourcingStatusLabels,
      qualityStatusLabels,
      connectivityStatusLabels,
      integrationStatusLabels,
      availabilityStatusLabels,
      quoteStatusLabels,
      remediationStatusLabels,
      incidentStatusLabels,
    ])
      expect(
        Object.values(dict).every((label) => /[\u4e00-\u9fff]/.test(label)),
      ).toBe(true);
    expect('exempted' in connectivityStatusLabels).toBe(false);
  });
});
