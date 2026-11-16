import type { AccessContext, PermissionAction } from '../auth/types';
import { can } from '../auth/policy';
import type { Channel } from '../domain/entities';
import type {
  ManagedRemediation,
  RemediationState,
} from '../domain/remediations';
import { problemCategoryLabels } from '../domain/remediations';
import { currentConclusion, pendingExecutions } from '../domain/testing';
import type {
  RemediationApi,
  RemediationInput,
  RemediationSummary,
} from '../services/remediation-types';
import type { ChannelState } from '../services/channel-types';
import { SupplierError } from '../services/supplier-types';
import type { ChannelRepository } from './channel-repository';
import { RemediationRepository, fingerprint } from './remediation-repository';
import { basisFor } from './testing-state';
import { fixture } from './data';
import { modelDomain } from '../domain/rules';
const bad = (message: string): never => {
  throw new SupplierError('VALIDATION', message);
};
const text = (v: string) => {
  if (typeof v !== 'string' || !v.trim() || v.length > 4000)
    bad('请填写有效模拟说明（最多4000字）。');
  return v.trim();
};
const due = (v: string | null) => {
  if (
    v !== null &&
    (!/^\d{4}-\d\d-\d\dT\d\d:\d\d.*(?:Z|[+-]\d\d:\d\d)$/.test(v) ||
      !Number.isFinite(Date.parse(v)))
  )
    bad('期限须包含明确时间和时区。');
  return v;
};
export function createRemediationApi(
  ctx: AccessContext | null,
  repo: RemediationRepository,
  tests: ChannelRepository,
  channels: () => readonly Channel[],
  active: () => boolean,
): RemediationApi {
  const guard = (action: PermissionAction) => {
    if (!ctx || !active() || !ctx.domains.length || !can(ctx, action))
      throw new SupplierError('FORBIDDEN', '当前身份或业务域无此整改权限。');
    return ctx;
  };
  const channel = (id: string) => {
    const c = channels().find((c) => c.id === id);
    if (!c) throw new SupplierError('FORBIDDEN', '记录不存在或不在授权范围。');
    return c;
  };
  const record = (s: RemediationState, id: string) => {
    const r = s.records.find((r) => r.id === id);
    if (!r) throw new SupplierError('FORBIDDEN', '记录不存在或不在授权范围。');
    channel(r.channelId);
    return r;
  };
  const assignee = (id: string | null, c: Channel) => {
    if (id === null) return;
    const m = fixture.models.find((m) => m.id === c.modelId)!;
    if (
      !fixture.users.some(
        (u) => u.id === id && ['ProductOperations', 'Testing'].includes(u.role),
      ) ||
      !fixture.domainGrants.some(
        (g) =>
          g.userId === id &&
          g.businessDomain === modelDomain(m, fixture.vendors),
      )
    )
      bad('负责人须为该渠道业务域内的运营或测试人员。');
  };
  const scope = (
    input: Pick<
      RemediationInput,
      | 'category'
      | 'verificationScope'
      | 'targetReference'
      | 'sharedSummary'
      | 'internalNotes'
    >,
  ) => {
    if (
      !Object.hasOwn(problemCategoryLabels, input.category) ||
      !['quality', 'connectivity'].includes(input.verificationScope)
    )
      bad('问题分类或验证类型无效。');
    text(input.targetReference);
    text(input.sharedSummary);
    text(input.internalNotes);
  };
  const execution = (s: ChannelState, id: string, r: ManagedRemediation) => {
    const e = s.executions.find((e) => e.id === id),
      t = s.tasks.find((t) => t.id === e?.taskId);
    if (
      !e ||
      !t ||
      t.channelId !== r.channelId ||
      t.testType !== r.verificationScope ||
      e.termination !== 'finished' ||
      e.finishedAt === null
    )
      bad('请选择同渠道、同验证类型的已结束执行。');
    channel(t!.channelId);
    return {
      e: e!,
      t: t!,
      d: s.taskDefinitions.find((d) => d.taskId === t!.id)!,
    };
  };
  const preview = (
    r: ManagedRemediation,
    s: RemediationState,
    c: ChannelState,
    executionId: string,
    conclusionId: string,
    reason: string,
  ) => {
    text(reason);
    if (r.status !== 'submitted' || r.activeRound === null)
      bad('仅本轮已提交事项可以正常关闭。');
    const submission = s.submissions.find(
      (v) => v.remediationId === r.id && v.round === r.activeRound,
    );
    if (!submission) bad('本轮没有有效整改提交。');
    if (
      !s.links.some(
        (l) =>
          l.remediationId === r.id &&
          l.round === r.activeRound &&
          l.executionId === executionId,
      )
    )
      bad('请先关联本轮复测。');
    const { e, t, d } = execution(c, executionId, r),
      ch = channel(r.channelId),
      basis = basisFor(ch),
      con = currentConclusion(c, r.channelId, r.verificationScope!, basis);
    if (
      e.result !== 'passed' ||
      e.basis !== basis ||
      d.basis !== basis ||
      e.targetVersion !== d.targetVersion ||
      d.targetReference !== r.targetReference
    )
      bad('复测必须通过，且当前配置和结构化验证目标适用。');
    if (Date.parse(e.startedAt) < Date.parse(submission!.submittedAt))
      bad('复测开始时间不能早于本轮提交。');
    if (
      !con ||
      con.id !== conclusionId ||
      con.executionId !== e.id ||
      con.result !== 'passed'
    )
      bad('请选择仍为现行依据的运营采纳结论。');
    if (
      pendingExecutions(c, r.channelId, t.testType).some((v) => {
        const td = c.taskDefinitions.find((d) => d.taskId === v.taskId);
        return (
          ['failed', 'inconclusive'].includes(v.result!) &&
          Date.parse(v.finishedAt!) > Date.parse(e.finishedAt!) &&
          v.basis === basis &&
          td?.targetReference === r.targetReference
        );
      })
    )
      bad('相关验证目标仍有更晚的失败或不确定执行待处理。');
    return fingerprint({
      remediationRevision: s.revision,
      testRevision: c.revision,
      recordVersion: r.version,
      round: r.activeRound,
      basis,
      targetVersion: e.targetVersion,
      id: r.id,
      executionId,
      conclusionId,
      reason,
    });
  };
  const replay = (
    s: RemediationState,
    key: string,
    op: string,
    payload: unknown,
  ) => {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) bad('请求标识无效。');
    const found = s.requests.find((v) => v.id === `${ctx!.user.id}:${key}`);
    if (
      found &&
      (found.operation !== op || found.fingerprint !== fingerprint(payload))
    )
      throw new SupplierError('CONFLICT', '请求标识已用于其他内容。');
    return found;
  };
  const save = (
    s: RemediationState,
    r: ManagedRemediation | null,
    n: ManagedRemediation,
    op: string,
    reason: string,
    key: string,
    payload: unknown,
    extra: Partial<RemediationState> = {},
  ) => {
    const at = n.updatedAt;
    const event = {
      id: crypto.randomUUID(),
      remediationId: n.id,
      action: op,
      actorUserId: ctx!.user.id,
      occurredAt: at,
      reason,
      requestId: key,
      beforeVersion: r?.version ?? null,
      afterVersion: n.version,
      beforeStatus: r?.status ?? null,
      afterStatus: n.status,
      round: n.activeRound,
      changes: (
        [
          'status',
          'assigneeUserId',
          'dueAt',
          'category',
          'verificationScope',
          'targetReference',
          'sharedSummary',
          'internalNotes',
          'activeRound',
        ] as const
      )
        .filter((k) => r?.[k] !== n[k])
        .map((k) => ({ field: k, before: r?.[k] ?? null, after: n[k] })),
    };
    repo.write(
      s,
      {
        ...s,
        ...extra,
        records: r
          ? s.records.map((v) => (v.id === r.id ? n : v))
          : [...s.records, n],
        events: [...s.events, event],
        requests: [
          ...s.requests,
          {
            id: `${ctx!.user.id}:${key}`,
            operation: op,
            fingerprint: fingerprint(payload),
            resultId: n.id,
          },
        ],
      },
      tests.read(),
    );
  };
  const summarize = (
    s: RemediationState,
    r: ManagedRemediation,
    asOf: string,
  ): RemediationSummary => ({
    id: r.id,
    channelId: r.channelId,
    supplierId: r.supplierId,
    category: r.category,
    verificationScope: r.verificationScope,
    status: r.status,
    updatedAt: r.updatedAt,
    pendingVerification: r.status === 'submitted',
    overdue:
      r.status !== 'closed' &&
      r.dueAt !== null &&
      Date.parse(r.dueAt) < Date.parse(asOf),
    deadlineUnknown: r.status !== 'closed' && r.dueAt === null,
    exceptionClosed: s.closures.some(
      (c) => c.remediationId === r.id && c.closureType === 'exception',
    ),
  });
  const fields = (v: object, keys: readonly string[]) => {
    if (!v || Object.keys(v).some((k) => !keys.includes(k)))
      bad('包含未批准的整改字段。');
  };
  return {
    async queryRemediationSummaries(
      filter = {},
      asOf = new Date().toISOString(),
    ) {
      guard('remediation:summary');
      if (!Number.isFinite(Date.parse(asOf))) bad('统计时间无效。');
      const s = repo.read();
      return s.records
        .filter(
          (r) =>
            channels().some((c) => c.id === r.channelId) &&
            (!filter.channelId || filter.channelId === r.channelId) &&
            (!filter.supplierId || filter.supplierId === r.supplierId) &&
            (!filter.executionId ||
              r.relatedTestExecutionId === filter.executionId ||
              s.links.some(
                (l) =>
                  l.remediationId === r.id &&
                  l.executionId === filter.executionId,
              )),
        )
        .map((r) => summarize(s, r, asOf));
    },
    async getRemediation(id) {
      guard('remediation:detail');
      const s = repo.read();
      if (
        !s.records.some(
          (r) => r.id === id && channels().some((c) => c.id === r.channelId),
        )
      )
        return null;
      const r = record(s, id),
        c = tests.read();
      const con = r.verificationScope
        ? currentConclusion(
            c,
            r.channelId,
            r.verificationScope,
            basisFor(channel(r.channelId)),
          )
        : null;
      return {
        currentConclusion: con
          ? {
              id: con.id,
              executionId: con.executionId,
              result: con.result,
              adoptedAt: con.adoptedAt,
              targetVersion: con.targetVersion,
            }
          : null,
        record: structuredClone(r),
        submissions: structuredClone(
          s.submissions.filter((v) => v.remediationId === id),
        ),
        links: structuredClone(s.links.filter((v) => v.remediationId === id)),
        closures: structuredClone(
          s.closures.filter((v) => v.remediationId === id),
        ),
        events: structuredClone(s.events.filter((v) => v.remediationId === id)),
        sourceApplicability:
          r.sourceType === 'legacy' ||
          (r.sourceType === 'failed_execution' && r.sourceBasis === null)
            ? 'legacy_unknown'
            : r.sourceType === 'manual'
              ? 'manual'
              : r.sourceBasis === basisFor(channel(r.channelId)) &&
                  c.taskDefinitions.some(
                    (d) =>
                      d.taskId === r.sourceTaskId &&
                      d.targetVersion === r.sourceTargetVersion,
                  )
                ? 'current'
                : 'invalidated',
      };
    },
    async remediationOptions() {
      guard('remediation:detail');
      const c = tests.read(),
        allowed = channels();
      return {
        channels: allowed.map((c) => ({
          id: c.id,
          name: c.displayName,
          supplierId: c.supplierId,
        })),
        assignees: fixture.users
          .filter((u) => ['ProductOperations', 'Testing'].includes(u.role))
          .map((u) => ({
            id: u.id,
            name: u.name,
            channelIds: allowed
              .filter((c) => {
                try {
                  assignee(u.id, c);
                  return true;
                } catch {
                  return false;
                }
              })
              .map((c) => c.id),
          }))
          .filter((u) => u.channelIds.length > 0),
        executions: c.executions
          .filter(
            (e) =>
              c.tasks.some(
                (t) =>
                  t.id === e.taskId &&
                  allowed.some((c) => c.id === t.channelId),
              ) && e.termination === 'finished',
          )
          .map((e) => {
            const t = c.tasks.find((t) => t.id === e.taskId)!,
              d = c.taskDefinitions.find((d) => d.taskId === t.id)!;
            return {
              id: e.id,
              taskId: t.id,
              channelId: t.channelId,
              type: t.testType,
              result: e.result,
              targetReference: e.origin === 'legacy' ? null : d.targetReference,
              current: e.basis === basisFor(channel(t.channelId)),
            };
          }),
        conclusions: c.conclusions
          .filter((v) => allowed.some((c) => c.id === v.channelId))
          .map((v) => ({ id: v.id, executionId: v.executionId })),
      };
    },
    async createRemediation(input, key) {
      fields(input, [
        'channelId',
        'sourceType',
        'sourceExecutionId',
        'category',
        'verificationScope',
        'targetReference',
        'sharedSummary',
        'internalNotes',
        'assigneeUserId',
        'dueAt',
        'splitReason',
      ]);
      const actor = guard('remediation:create'),
        ch = channel(input.channelId),
        s = repo.read();
      const previous = replay(s, key, 'create', input);
      if (previous) {
        record(s, previous.resultId);
        return previous.resultId;
      }
      scope(input);
      assignee(input.assigneeUserId, ch);
      due(input.dueAt);
      if (
        actor.user.role !== 'ProductOperations' &&
        (input.assigneeUserId !== null || input.dueAt !== null)
      )
        bad('仅运营可设置负责人和期限。');
      const c = tests.read();
      let sourceTaskId = null,
        sourceBasis = null,
        sourceTargetVersion = null;
      if (input.sourceType === 'failed_execution') {
        const temp = {
          channelId: ch.id,
          verificationScope: input.verificationScope,
        } as ManagedRemediation;
        const { e, t } = execution(c, input.sourceExecutionId!, temp);
        if (e.result !== 'failed') bad('失败来源必须为实际 failed 执行。');
        sourceTaskId = t.id;
        sourceBasis = e.basis;
        sourceTargetVersion = e.targetVersion;
        if (
          s.records.some(
            (r) =>
              r.relatedTestExecutionId === e.id &&
              r.status !== 'closed' &&
              channels().some((c) => c.id === r.channelId),
          )
        )
          text(input.splitReason);
      } else if (
        input.sourceType !== 'manual' ||
        input.sourceExecutionId !== null
      )
        bad('来源类型无效。');
      const at = new Date().toISOString(),
        id = `mock-remediation-${crypto.randomUUID()}`,
        r: ManagedRemediation = {
          id,
          source: 'mock',
          channelId: ch.id,
          supplierId: ch.supplierId,
          relatedTestExecutionId: input.sourceExecutionId,
          description: input.internalNotes,
          supplierResponse: null,
          submittedBy: actor.user.id,
          updatedBy: actor.user.id,
          createdAt: at,
          updatedAt: at,
          version: 1,
          status: 'open',
          sourceType: input.sourceType,
          sourceTaskId,
          sourceBasis,
          sourceTargetVersion,
          category: input.category,
          verificationScope: input.verificationScope,
          targetReference: input.targetReference.trim(),
          sharedSummary: input.sharedSummary.trim(),
          internalNotes: input.internalNotes.trim(),
          assigneeUserId: input.assigneeUserId,
          dueAt: input.dueAt,
          createdBy: actor.user.id,
          activeRound: 1,
          splitReason: input.splitReason.trim() || null,
        };
      save(s, null, r, 'create', '人工登记整改', key, input);
      return id;
    },
    async previewRemediationClosure(id, version, e, con, reason) {
      guard('remediation:close');
      const s = repo.read(),
        r = record(s, id);
      if (r.version !== version)
        throw new SupplierError('CONFLICT', '整改版本变化，请刷新。');
      return preview(r, s, tests.read(), e, con, reason);
    },
    async changeRemediation(id, version, input, reason, key) {
      const allowedFields: Record<string, readonly string[]> = {
        update: [
          'category',
          'verificationScope',
          'targetReference',
          'sharedSummary',
          'internalNotes',
        ],
        assign: ['assigneeUserId'],
        due: ['dueAt'],
        start: [],
        followup: [],
        return: [],
        submit: ['sharedSummary', 'internalNotes', 'evidenceReference'],
        link: ['executionId', 'applicabilityReason'],
        normal: ['executionId', 'conclusionId', 'applicabilityReason', 'token'],
        exception: ['category'],
      };
      if (!input || !Object.hasOwn(allowedFields, input.action))
        bad('整改操作无效。');
      fields(input, ['action', ...allowedFields[input.action]!]);
      const action = input.action,
        permission: PermissionAction =
          action === 'normal' || action === 'exception'
            ? 'remediation:close'
            : action === 'due'
              ? 'remediation:assign'
              : action === 'start'
                ? 'remediation:followup'
                : action === 'link'
                  ? 'remediation:link-test'
                  : `remediation:${action}`;
      const actor = guard(permission),
        s = repo.read(),
        r = record(s, id),
        payload = { id, version, input, reason };
      if (
        ['start', 'followup', 'submit', 'link'].includes(action) &&
        actor.user.role === 'Testing' &&
        r.assigneeUserId !== actor.user.id
      )
        throw new SupplierError('FORBIDDEN', '仅当前整改负责人可执行此操作。');
      if (replay(s, key, action, payload)) return;
      if (r.version !== version)
        throw new SupplierError('CONFLICT', '整改版本变化，请刷新后重新核验。');
      if (r.status === 'closed') bad('已关闭事项不可再操作。');
      text(reason);
      const testSnapshot = tests.read();
      const at = new Date().toISOString();
      let n = {
        ...r,
        version: r.version + 1,
        updatedAt: at,
        updatedBy: actor.user.id,
      };
      const extra: {
        -readonly [K in keyof RemediationState]?: RemediationState[K];
      } = {};
      if (action === 'update') {
        scope(input);
        if (
          s.submissions.some((v) => v.remediationId === id) ||
          s.links.some((v) => v.remediationId === id)
        )
          bad('已有提交或关联后不能偷换验证范围。');
        n = {
          ...n,
          category: input.category,
          verificationScope: input.verificationScope,
          targetReference: text(input.targetReference),
          sharedSummary: text(input.sharedSummary),
          internalNotes: text(input.internalNotes),
          activeRound: r.activeRound ?? 1,
        };
      } else if (action === 'assign') {
        assignee(input.assigneeUserId, channel(r.channelId));
        n.assigneeUserId = input.assigneeUserId;
      } else if (action === 'due') n.dueAt = due(input.dueAt);
      else if (action === 'exception') {
        if (
          ![
            'duplicate',
            'no_longer_applicable',
            'unable_to_verify',
            'other',
          ].includes(input.category)
        )
          bad('请选择例外分类。');
        n.status = 'closed';
        extra.closures = [
          ...s.closures,
          {
            id: crypto.randomUUID(),
            remediationId: id,
            round: r.activeRound!,
            closureType: 'exception',
            exceptionCategory: input.category,
            verificationExecutionId: null,
            verificationConclusionId: null,
            closedBy: actor.user.id,
            closedAt: at,
            reason,
            verificationToken: null,
          },
        ];
      } else {
        if (
          !r.category ||
          !r.verificationScope ||
          !r.targetReference ||
          !r.sharedSummary ||
          r.activeRound === null
        )
          bad('请先由运营补充旧事项的分类、验证范围和共享摘要。');
        if (action === 'start') {
          if (r.status !== 'open') bad('仅待跟进事项可开始。');
          n.status = 'in_progress';
        } else if (action === 'followup') {
          if (!['open', 'in_progress', 'submitted'].includes(r.status))
            bad('状态无效。');
        } else if (action === 'return') {
          if (r.status !== 'submitted') bad('仅已提交事项可退回。');
          n.status = 'in_progress';
          n.activeRound = r.activeRound! + 1;
        } else if (action === 'submit') {
          if (r.status !== 'in_progress') bad('仅处理中事项可提交。');
          if (!/^mock:[A-Za-z0-9_:/.-]{1,150}$/.test(input.evidenceReference))
            bad('仅允许 mock: 证据。');
          n.status = 'submitted';
          extra.submissions = [
            ...s.submissions,
            {
              id: crypto.randomUUID(),
              remediationId: id,
              round: r.activeRound!,
              submittedBy: actor.user.id,
              submittedAt: at,
              version: r.version,
              sharedSummary: text(input.sharedSummary),
              internalNotes: text(input.internalNotes),
              evidenceReference: input.evidenceReference,
            },
          ];
        } else if (action === 'link') {
          if (!['in_progress', 'submitted'].includes(r.status))
            bad('请先开始整改跟进。');
          const { e, t } = execution(tests.read(), input.executionId, r);
          if (
            s.links.some(
              (l) =>
                l.remediationId === id &&
                l.round === r.activeRound &&
                l.executionId === e.id,
            )
          )
            bad('本轮已经关联该执行。');
          extra.links = [
            ...s.links,
            {
              id: crypto.randomUUID(),
              remediationId: id,
              round: r.activeRound!,
              executionId: e.id,
              taskId: t.id,
              targetVersion: e.targetVersion,
              basis: e.basis,
              linkedBy: actor.user.id,
              linkedAt: at,
              applicabilityReason: text(input.applicabilityReason),
            },
          ];
        } else if (action === 'normal') {
          const token = preview(
            r,
            s,
            tests.read(),
            input.executionId,
            input.conclusionId,
            input.applicabilityReason,
          );
          if (token !== input.token)
            throw new SupplierError(
              'CONFLICT',
              '测试或整改事实已变化，请刷新重新预览。',
            );
          n.status = 'closed';
          extra.closures = [
            ...s.closures,
            {
              id: crypto.randomUUID(),
              remediationId: id,
              round: r.activeRound!,
              closureType: 'normal',
              exceptionCategory: null,
              verificationExecutionId: input.executionId,
              verificationConclusionId: input.conclusionId,
              closedBy: actor.user.id,
              closedAt: at,
              reason,
              verificationToken: token,
            },
          ];
        }
      }
      if (
        ['assign', 'due', 'update'].includes(action) &&
        fingerprint({
          ...n,
          version: r.version,
          updatedAt: r.updatedAt,
          updatedBy: r.updatedBy,
        }) === fingerprint(r)
      )
        return;
      guard(permission);
      if (
        action === 'normal' &&
        fingerprint(testSnapshot) !== fingerprint(tests.read())
      )
        throw new SupplierError('CONFLICT', '测试事实变化，请重新预览。');
      save(s, r, n, action, reason, key, payload, extra);
    },
    async resetRemediations(confirmed) {
      const actor = guard('remediation:reset');
      if (
        !confirmed ||
        actor.domains.length !== 2 ||
        new Set(
          channels().map((c) =>
            modelDomain(
              fixture.models.find((m) => m.id === c.modelId)!,
              fixture.vendors,
            ),
          ),
        ).size !== 2
      )
        bad('仅双域运营在全部业务域明确确认后可重置。');
      repo.reset();
    },
  };
}
