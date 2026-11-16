import { describe, expect, it } from 'vitest';
import { roleLabels } from '../../src/auth/types';
import { can, canSeeField } from '../../src/auth/policy';
import {
  createDemoSession,
  listDemoProfiles,
} from '../../src/services/demo-session';
import {
  selectDemoIdentity,
  replaceDemoSession,
} from '../../src/services/demo-selection';
import { navigation } from '../../src/app/navigation';
import {
  roles,
  modulePerspectives,
  fieldPerspectives,
  experienceEntries,
} from '../../src/features/roles/role-presenter';
const profiles = listDemoProfiles();
const profile = (id: string) => profiles.find((p) => p.user.id === id)!;
describe('公开角色权限展示', () => {
  it('八角色来自实际字典，允许同角色多身份且无授权身份不丢失', () => {
    expect(roles).toEqual(Object.keys(roleLabels));
    expect(roles).toHaveLength(8);
    expect(
      profiles.filter((p) => p.user.role === 'ProductOperations').length,
    ).toBeGreaterThan(1);
    expect(profile('u-no-domain').domains).toEqual([]);
  });
  it.each(roles)('%s 的已展示动作与 can 一致，入口与导航一致', (role) => {
    const p = profiles.find((p) => p.user.role === role)!,
      ctx = {
        user: p.user,
        domains: p.domains,
        supplierIds: [],
        customerIds: [],
      };
    for (const row of modulePerspectives(p)) {
      for (const op of row.operations) expect(can(ctx, op.action)).toBe(true);
      const nav = navigation.find((n) => n.id === row.id)!;
      expect(row.canExperience).toBe(
        nav.available &&
          p.domains.length > 0 &&
          (nav.permission === null || can(ctx, nav.permission)),
      );
    }
    for (const n of experienceEntries(p)) {
      const nav = navigation.find((v) => v.id === n.id)!;
      expect(nav.available).toBe(true);
      expect(nav.permission === null || can(ctx, nav.permission)).toBe(true);
    }
    expect(
      modulePerspectives(p).find((m) => m.id === 'governance'),
    ).toMatchObject({ capability: '未开放', canExperience: false });
  });
  it('采购只拥有测试/整改摘要，不能被展示成审核权限', () => {
    const rows = modulePerspectives(profile('u-proc'));
    for (const id of ['tests', 'remediations'])
      expect(rows.find((m) => m.id === id)?.capability).toBe('仅摘要');
    expect(
      rows.flatMap((r) => r.operations).map((o) => o.action),
    ).not.toContain('test:adopt');
    expect(
      rows.flatMap((r) => r.operations).map((o) => o.action),
    ).not.toContain('remediation:close');
  });
  it('测试仅特定操作，无整改关闭、采购折扣和通用审计', () => {
    const p = profile('u-test'),
      rows = modulePerspectives(p);
    expect(rows.find((r) => r.id === 'remediations')?.note).toContain(
      '本人负责',
    );
    expect(
      rows
        .flatMap((r) => r.operations)
        .some((o) => o.action === 'remediation:close'),
    ).toBe(false);
    expect(
      fieldPerspectives(p).find((f) => f.label === '采购商业折扣')?.allowed,
    ).toBe(false);
    expect(
      can(
        { user: p.user, domains: p.domains, supplierIds: [], customerIds: [] },
        'audit:read',
      ),
    ).toBe(false);
  });
  it.each(['u-sales', 'u-account', 'u-solution'])(
    '%s 无供应商身份/采购折扣/内部整改入口',
    (id) => {
      const p = profile(id),
        ctx = {
          user: p.user,
          domains: p.domains,
          supplierIds: [],
          customerIds: [],
        };
      expect(canSeeField(ctx, 'supplierIdentity')).toBe(false);
      expect(canSeeField(ctx, 'purchaseDiscount')).toBe(false);
      expect(
        fieldPerspectives(p).find((f) => f.label === '真实供应商身份')?.allowed,
      ).toBe(false);
      expect(
        experienceEntries(p).some((n) =>
          ['suppliers', 'quotes', 'remediations'].includes(n.id),
        ),
      ).toBe(false);
    },
  );
  it('供应商只有自身旧基础读取，不能进入新测试/整改模块', () => {
    const p = profile('u-supplier');
    expect(modulePerspectives(p).find((m) => m.id === 'tests')).toMatchObject({
      capability: '只读',
      identityStatus: '无新模块入口',
      canExperience: false,
    });
    expect(experienceEntries(p).some((m) => m.id === 'remediations')).toBe(
      false,
    );
  });
  it('无域身份不伪造业务入口或授权数据', () => {
    const p = profile('u-no-domain');
    expect(
      modulePerspectives(p)
        .filter((m) => m.available)
        .every(
          (m) => m.identityStatus === '暂无业务域授权' && !m.canExperience,
        ),
    ).toBe(true);
    expect(experienceEntries(p).map((m) => m.id)).toEqual(['dashboard']);
  });
  it('展示结果只包含公开说明，不返回真实范围关系或业务记录', () => {
    const value = JSON.stringify({
      rows: modulePerspectives(profile('u-proc')),
      fields: fieldPerspectives(profile('u-proc')),
    });
    for (const name of [
      'supplierIds',
      'customerIds',
      'description',
      'purchaseDiscountBps',
      'contactEmail',
      'beforeSnapshot',
    ])
      expect(value).not.toContain(`"${name}"`);
  });
});
describe('统一身份切换', () => {
  it.each([
    ['u-domestic', 'domestic'],
    ['u-overseas', 'overseas'],
    ['u-ops', 'all'],
    ['u-no-domain', 'all'],
  ])('%s 重设真实域为 %s', (id, domain) => {
    expect(selectDemoIdentity(id!)).toEqual({ id, domain });
  });
  it('切换前创建并验证新会话，撤销旧会话写入；新会话实际读取匿名资源', async () => {
    const old = createDemoSession('u-ops');
    const next = replaceDemoSession(old, selectDemoIdentity('u-sales'));
    expect(next.profile.user.id).toBe('u-sales');
    expect(next.permits('quote:read')).toBe(false);
    const channels = await next.api.listChannels();
    expect(channels.length).toBeGreaterThan(0);
    expect(channels.every((c) => !('supplierId' in c))).toBe(true);
    await expect(
      old.api.createRemediation(
        {
          channelId: 'ch-2',
          sourceType: 'manual',
          sourceExecutionId: null,
          category: 'quality',
          verificationScope: 'quality',
          targetReference: 'mock:target',
          sharedSummary: '模拟',
          internalNotes: '模拟',
          assigneeUserId: null,
          dueAt: null,
          splitReason: '',
        },
        crypto.randomUUID(),
      ),
    ).rejects.toThrow();
  });
  it('业务域切换同样撤销旧会话；单域不能扩权', async () => {
    const old = createDemoSession('u-ops'),
      next = replaceDemoSession(old, { id: 'u-ops', domain: 'domestic' });
    expect(next.domain).toBe('domestic');
    await expect(
      old.api.createTestTask(
        {
          channelId: 'ch-2',
          testType: 'quality',
          targetReference: 'mock:target',
          assignedTo: null,
        },
        crypto.randomUUID(),
      ),
    ).rejects.toThrow();
    expect(() =>
      replaceDemoSession(next, { id: 'u-domestic', domain: 'overseas' }),
    ).toThrow('未授权');
    expect((await next.api.listModels()).length).toBeGreaterThan(0);
  });
  it('无效身份不会撤销当前有效会话', async () => {
    const old = createDemoSession('u-ops');
    expect(() => selectDemoIdentity('missing')).toThrow();
    expect(() =>
      replaceDemoSession(old, { id: 'missing', domain: 'all' }),
    ).toThrow();
    expect((await old.api.queryTestSummaries()).rows.length).toBeGreaterThan(0);
  });
});
