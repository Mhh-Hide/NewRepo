import type { DomainStore } from './store';
import { canExemptQuality, discountBps } from './rules';
/** Fixture validation is not database constraints or a production write API. */
export function validateStore(s: DomainStore): readonly string[] {
  const errors: string[] = [];
  const unique = (values: readonly string[], label: string) => {
    if (new Set(values).size !== values.length)
      errors.push(`Duplicate ${label}`);
  };
  const collections: Readonly<
    Record<string, readonly { readonly id: string }[]>
  > = {
    vendors: s.vendors,
    models: s.models,
    suppliers: s.suppliers,
    channels: s.channels,
    demands: s.demands,
    demandItems: s.demandItems,
    matches: s.matches,
    quotes: s.quotes,
    testTasks: s.testTasks,
    testExecutions: s.testExecutions,
    exemptions: s.exemptions,
    remediations: s.remediations,
    incidents: s.incidents,
    audits: s.audits,
    customers: s.customers,
    users: s.users,
  };
  for (const [name, rows] of Object.entries(collections))
    unique(
      rows.map((r) => r.id),
      name + ' id',
    );
  const ref = (exists: boolean, label: string) => {
    if (!exists) errors.push('Invalid reference: ' + label);
  };
  const user = (id: string) => s.users.some((u) => u.id === id);
  const channel = (id: string) => s.channels.find((c) => c.id === id);
  const task = (id: string) => s.testTasks.find((t) => t.id === id);
  unique(
    s.vendors.map((v) => v.code.trim().toLowerCase()),
    'vendor code',
  );
  unique(
    s.models.map((m) =>
      JSON.stringify([m.vendorId, m.modelCode, m.version, m.regionVariant]),
    ),
    'model identity',
  );
  unique(
    s.suppliers.map((v) => v.name.trim().toLowerCase()),
    'supplier name',
  );
  unique(
    s.suppliers.map((v) => v.shortCode.trim().toLowerCase()),
    'supplier shortCode',
  );
  unique(
    s.channels.flatMap((c) => (c.opChannelId === null ? [] : [c.opChannelId])),
    'OP channel ID',
  );
  const capability = (value: number | null) =>
    value === null || (Number.isFinite(value) && value >= 0);
  for (const m of s.models)
    ref(
      s.vendors.some((v) => v.id === m.vendorId),
      'model.vendorId',
    );
  for (const p of s.suppliers) ref(user(p.ownerUserId), 'supplier.ownerUserId');
  for (const c of s.channels) {
    ref(
      s.models.some((m) => m.id === c.modelId),
      'channel.modelId',
    );
    ref(
      s.suppliers.some((p) => p.id === c.supplierId),
      'channel.supplierId',
    );
    if (![c.tpm, c.rpm, c.concurrencyLimit, c.ttftMs].every(capability))
      errors.push('Invalid channel capacity');
    if (c.opChannelId !== null && !c.opChannelId.trim())
      errors.push('Empty OP binding');
    if (c.qualityStatus === 'exempted' && !canExemptQuality(c, s.exemptions))
      errors.push('Missing quality exemption evidence');
    if (
      !s.testTasks.some(
        (t) => t.channelId === c.id && t.testType === 'connectivity',
      )
    )
      errors.push('Missing connectivity task');
  }
  for (const d of s.demands) {
    ref(user(d.requesterUserId), 'demand.requesterUserId');
    ref(
      s.customers.some((c) => c.id === d.customerId),
      'demand.customerId',
    );
  }
  for (const i of s.demandItems) {
    ref(
      s.demands.some((d) => d.id === i.demandId),
      'item.demandId',
    );
    ref(
      s.models.some((m) => m.id === i.modelId),
      'item.modelId',
    );
    try {
      discountBps(i.targetPurchaseDiscount);
    } catch {
      errors.push('Invalid target discount');
    }
    if (
      ![
        i.requiredTpm,
        i.requiredRpm,
        i.requiredConcurrency,
        i.requiredTtftMs,
      ].every(capability)
    )
      errors.push('Invalid demand capacity');
  }
  for (const m of s.matches) {
    const i = s.demandItems.find((i) => i.id === m.demandItemId);
    ref(!!i, 'match.itemId');
    ref(
      !!channel(m.channelId) && channel(m.channelId)?.modelId === i?.modelId,
      'match.channelId/modelId',
    );
  }
  for (const q of s.quotes) {
    ref(!!channel(q.channelId), 'quote.channelId');
    ref(user(q.submittedBy), 'quote.submittedBy');
    try {
      discountBps(q.discount);
    } catch {
      errors.push('Invalid quote discount');
    }
    if (q.confirmedBy !== null) ref(user(q.confirmedBy), 'quote.confirmedBy');
    if ((q.confirmedBy === null) !== (q.confirmedAt === null))
      errors.push('Incomplete quote confirmation');
    if (
      q.priceStatus === 'effective' &&
      (!q.confirmedBy || !q.confirmedAt || !q.effectiveFrom)
    )
      errors.push('Effective quote requires confirmation');
    if (
      q.priceStatus === 'temporary' &&
      (!q.effectiveFrom || !q.effectiveUntil)
    )
      errors.push('Promotion requires validity bounds');
    if (q.effectiveFrom && !Number.isFinite(Date.parse(q.effectiveFrom)))
      errors.push('Invalid quote start');
    if (
      q.effectiveUntil &&
      (!q.effectiveFrom ||
        !Number.isFinite(Date.parse(q.effectiveUntil)) ||
        Date.parse(q.effectiveUntil) <= Date.parse(q.effectiveFrom))
    )
      errors.push('Invalid quote interval');
    if (q.previousQuoteId !== null)
      ref(
        s.quotes.some(
          (p) =>
            p.id === q.previousQuoteId &&
            p.id !== q.id &&
            p.channelId === q.channelId,
        ),
        'quote.previousQuoteId',
      );
    if (
      q.sourceType === 'correction' &&
      (!q.reason.trim() || !q.previousQuoteId)
    )
      errors.push('Correction requires reason and prior record');
  }
  for (const t of s.testTasks) {
    ref(!!channel(t.channelId), 'task.channelId');
    if (t.assignedTo !== null) ref(user(t.assignedTo), 'task.assignedTo');
  }
  for (const e of s.testExecutions) ref(!!task(e.taskId), 'execution.taskId');
  for (const e of s.exemptions) {
    ref(!!channel(e.channelId), 'exemption.channelId');
    ref(user(e.verifiedBy), 'exemption.verifiedBy');
  }
  for (const r of s.remediations) {
    ref(!!channel(r.channelId), 'remediation.channelId');
    ref(user(r.submittedBy) && user(r.updatedBy), 'remediation.users');
    if (r.relatedTestExecutionId !== null) {
      const e = s.testExecutions.find((e) => e.id === r.relatedTestExecutionId);
      ref(
        !!e && task(e.taskId)?.channelId === r.channelId,
        'remediation.execution/channel',
      );
    }
  }
  for (const i of s.incidents) {
    ref(
      s.suppliers.some((p) => p.id === i.supplierId),
      'incident.supplierId',
    );
    ref(user(i.reportedBy), 'incident.reportedBy');
    if (i.customer !== null)
      ref(
        s.customers.some(
          (c) => c.id === i.customer?.id && c.name === i.customer.name,
        ),
        'incident.customer',
      );
    if (i.purchaseDiscount !== null) {
      try {
        discountBps(i.purchaseDiscount);
      } catch {
        errors.push('Invalid incident purchase discount');
      }
    }
    if (
      i.salesPriceMinorUnits !== null &&
      (!Number.isSafeInteger(i.salesPriceMinorUnits) ||
        i.salesPriceMinorUnits < 0)
    )
      errors.push('Invalid incident sales price');

    if (i.channelId !== null)
      ref(
        channel(i.channelId)?.supplierId === i.supplierId,
        'incident.channel/supplier',
      );
  }
  for (const a of s.audits) {
    ref(user(a.actorUserId), 'audit.actorUserId');
    const targets = {
      quote: s.quotes,
      channel: s.channels,
      test: s.testTasks,
      remediation: s.remediations,
      incident: s.incidents,
    };
    ref(
      targets[a.entityType].some((r) => r.id === a.entityId),
      'audit.entityId',
    );
  }
  for (const g of s.domainGrants) ref(user(g.userId), 'domainGrant.userId');
  for (const g of s.supplierGrants)
    ref(
      user(g.userId) && s.suppliers.some((p) => p.id === g.supplierId),
      'supplierGrant',
    );
  for (const g of s.customerGrants)
    ref(
      user(g.userId) && s.customers.some((c) => c.id === g.customerId),
      'customerGrant',
    );
  return errors;
}
