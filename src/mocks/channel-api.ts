import type {
  ChannelApi,
  ChannelInput,
  ManagedChannel,
  ChannelState,
} from '../services/channel-types';
import type { Channel, BusinessDomain } from '../domain/entities';
import type { AccessContext } from '../auth/types';
import { canReadSupplierMaster } from '../auth/supplier-policy';
import { can, canSeeField } from '../auth/policy';
import { projectChannel } from '../auth/projections';
import { bindOpChannelId, modelDomain } from '../domain/rules';
import { channelTypeLabels } from '../domain/statuses';
import { fixture } from './data';
import { SupplierError } from '../services/supplier-types';
import type { SupplierRepository } from './supplier-repository';
import type { ChannelRepository } from './channel-repository';
const fields = [
  'displayName',
  'channelType',
  'modelInvocationName',
  'endpointReference',
  'tpm',
  'rpm',
  'concurrencyLimit',
  'ttftMs',
] as const;
export function createChannelApi(
  ctx: AccessContext | null,
  domain: BusinessDomain | undefined,
  repo: ChannelRepository,
  suppliers: SupplierRepository,
  visible: () => readonly Channel[],
  active: () => boolean,
): ChannelApi {
  const guard = (
    action:
      | 'channel:create'
      | 'channel:update'
      | 'channel:toggle'
      | 'channel:bind-op'
      | 'channel:history',
  ) => {
    if (!ctx || !active() || !ctx.domains.length || !can(ctx, action))
      throw new SupplierError('FORBIDDEN', '当前身份无渠道操作权限。');
    return ctx;
  };
  const authorized = (s: ChannelState, id: string) => {
    const c = s.channels.find((c) => c.id === id);
    if (!c || !visible().some((v) => v.id === id))
      throw new SupplierError('FORBIDDEN', '渠道不存在或无权操作。');
    return c;
  };
  const validate = (input: ChannelInput, create = false) => {
    if (
      Object.keys(input).some(
        (k) =>
          ![...fields, ...(create ? ['supplierId', 'modelId'] : [])].includes(
            k,
          ),
      )
    )
      throw new SupplierError(
        'VALIDATION',
        '不能修改关联 ID、OP ID 或技术状态。',
      );
    if (
      typeof input.displayName !== 'string' ||
      !input.displayName.trim() ||
      input.displayName.length > 160 ||
      !Object.hasOwn(channelTypeLabels, input.channelType)
    )
      throw new SupplierError('VALIDATION', '请填写渠道名称和有效类型。');
    for (const k of ['modelInvocationName', 'endpointReference'] as const)
      if (typeof input[k] !== 'string' || input[k].length > 160)
        throw new SupplierError(
          'VALIDATION',
          '请填写非敏感 Mock 引用（最多160字）。',
        );
    for (const k of ['tpm', 'rpm', 'concurrencyLimit', 'ttftMs'] as const) {
      const n = input[k];
      if (
        n !== null &&
        (!Number.isFinite(n) ||
          n < 0 ||
          (k !== 'ttftMs' && !Number.isSafeInteger(n)))
      )
        throw new SupplierError(
          'VALIDATION',
          '能力必须为空或有效非负数，TPM/RPM/并发必须为整数，TTFT 单位毫秒。',
        );
    }
    return { ...input, displayName: input.displayName.trim() };
  };
  const save = (
    state: ChannelState,
    before: ManagedChannel | null,
    after: ManagedChannel,
    action: string,
    tasks = state.tasks,
  ) => {
    const changed = before
      ? Object.keys(after).filter(
          (k) =>
            k !== 'version' &&
            k !== 'updatedAt' &&
            k !== 'updatedBy' &&
            before[k as keyof ManagedChannel] !==
              after[k as keyof ManagedChannel],
        )
      : [...fields];
    if (!changed.length) return projectChannel(ctx!, before!);
    repo.write(
      state,
      {
        ...state,
        channels: before
          ? state.channels.map((c) => (c.id === after.id ? after : c))
          : [...state.channels, after],
        tasks,
        history: [
          ...state.history,
          {
            id: crypto.randomUUID(),
            channelId: after.id,
            action,
            actorUserId: ctx!.user.id,
            occurredAt: after.updatedAt,
            reason: '模拟渠道主档操作',
            changedFields: changed,
            beforeSnapshot: before,
            afterSnapshot: after,
          },
        ],
      },
      suppliers,
    );
    return projectChannel(ctx!, after);
  };
  const change = (
    id: string,
    version: number,
    action: 'channel:update' | 'channel:toggle' | 'channel:bind-op',
    transform: (c: ManagedChannel, state: ChannelState) => ManagedChannel,
  ) => {
    const actor = guard(action);
    const state = repo.read();
    const c = authorized(state, id);
    if (c.version !== version)
      throw new SupplierError('CONFLICT', '渠道版本已变化，请重新加载后保存。');
    return save(
      state,
      c,
      {
        ...transform(c, state),
        version: c.version + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: actor.user.id,
      },
      action,
    );
  };
  return {
    async channelAccess() {
      return {
        supplierIdentity: !!ctx && canSeeField(ctx, 'supplierIdentity'),
        technical: !!ctx && canSeeField(ctx, 'internalMetadata'),
        reset:
          !!ctx &&
          can(ctx, 'demo:reset') &&
          !domain &&
          ctx.domains.includes('domestic') &&
          ctx.domains.includes('overseas'),
      };
    },
    async createChannel(input) {
      const actor = guard('channel:create');
      const values = validate(input, true);
      const model = fixture.models.find((m) => m.id === input.modelId);
      if (
        !model ||
        !actor.domains.includes(modelDomain(model, fixture.vendors)) ||
        (domain && modelDomain(model, fixture.vendors) !== domain)
      )
        throw new SupplierError('FORBIDDEN', '模型不在授权业务域。');
      const supplierState = suppliers.read();
      const supplier = supplierState.suppliers.find(
        (s) => s.id === input.supplierId,
      );
      const activeDomains = domain ? [domain] : actor.domains;
      if (
        !supplier ||
        supplier.status !== 'enabled' ||
        !canReadSupplierMaster(
          actor,
          supplier,
          supplierState.scopes,
          supplierState.maintenance,
          activeDomains,
          visible().some((c) => c.supplierId === supplier.id),
        )
      )
        throw new SupplierError('FORBIDDEN', '供应商未授权或已停用。');
      const now = new Date().toISOString();
      const c: ManagedChannel = {
        ...values,
        source: 'mock',
        id: `mock-channel-${crypto.randomUUID()}`,
        supplierId: supplier.id,
        modelId: model.id,
        opChannelId: null,
        sourceVerificationStatus: 'unverified',
        qualityStatus: 'pending',
        connectivityStatus: 'pending',
        integrationStatus: 'not_started',
        availabilityStatus: 'closed',
        resourceStatus: 'enabled',
        version: 1,
        createdBy: actor.user.id,
        updatedBy: actor.user.id,
        createdAt: now,
        updatedAt: now,
      };
      const state = repo.read();
      return save(state, null, c, 'channel:create', [
        ...state.tasks,
        ...(['quality', 'connectivity'] as const).map((testType) => ({
          source: 'mock' as const,
          id: crypto.randomUUID(),
          channelId: c.id,
          testType,
          status: 'pending' as const,
          assignedTo: null,
          createdAt: now,
          updatedAt: now,
        })),
      ]);
    },
    async updateChannel(id, v, input) {
      guard('channel:update');
      return change(id, v, 'channel:update', (c) => ({
        ...c,
        ...validate(input),
      }));
    },
    async toggleChannel(id, v, status) {
      guard('channel:toggle');
      if (status !== 'enabled' && status !== 'disabled')
        throw new SupplierError('VALIDATION', '资源状态无效。');
      return change(id, v, 'channel:toggle', (c) => ({
        ...c,
        resourceStatus: status,
      }));
    },
    async bindChannelOp(id, v, opId, confirmed) {
      guard('channel:bind-op');
      if (!confirmed || !/^MOCK-[A-Za-z0-9_-]{1,80}$/.test(opId))
        throw new SupplierError(
          'VALIDATION',
          '请确认模拟绑定，OP ID 须以 MOCK- 开头。',
        );
      const current = authorized(repo.read(), id);
      if (current.opChannelId === opId) return projectChannel(ctx!, current);
      return change(id, v, 'channel:bind-op', (c, s) => {
        try {
          return { ...c, ...bindOpChannelId(c, opId, s.channels) };
        } catch (e) {
          throw new SupplierError(
            'VALIDATION',
            e instanceof Error && e.message.includes('conflict')
              ? 'OP 渠道 ID 冲突：该 ID 已绑定其他内部渠道。'
              : 'OP ID 已绑定或无效，不允许覆盖；重绑需独立受控流程。',
          );
        }
      });
    },
    async channelVersion(id) {
      return visible().some((c) => c.id === id)
        ? (repo.read().channels.find((c) => c.id === id)?.version ?? null)
        : null;
    },
    async channelHistory(id) {
      if (
        !ctx ||
        !can(ctx, 'channel:history') ||
        !visible().some((c) => c.id === id)
      )
        return [];
      return structuredClone(
        repo.read().history.filter((e) => e.channelId === id),
      );
    },
    async resetChannelDemo(confirmed) {
      guard('channel:create');
      if (
        !confirmed ||
        domain ||
        !ctx!.domains.includes('domestic') ||
        !ctx!.domains.includes('overseas')
      )
        throw new SupplierError(
          'FORBIDDEN',
          '须由双域运营在全部域确认重置渠道及新增任务/历史，供应商资料保留。',
        );
      repo.reset(suppliers);
    },
  };
}
