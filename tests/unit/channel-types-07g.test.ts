import { describe, it, expect } from 'vitest';
import {
  channelTypeOptions,
  legacyChannelMapping,
} from '../../src/domain/channel-types';
describe('07G vendor channel dictionary', () => {
  it('preserves distinct Claude key sizes and providers', () => {
    const options = channelTypeOptions({
      code: 'anthropic',
      businessDomain: 'overseas',
    });
    expect(options).toHaveLength(11);
    expect(new Set(options.map((o) => o.value)).size).toBe(11);
    expect(options.map((o) => o.label)).toContain('AWS 中转小 Key');
    expect(options.map((o) => o.label)).toContain('Anthropic 中转大 Key');
  });
  it('uses manufacturer domain for domestic overseas regional models', () => {
    expect(
      channelTypeOptions({ code: 'bytedance', businessDomain: 'domestic' }).map(
        (o) => o.label,
      ),
    ).toEqual([
      '官方',
      '云厂商自部署',
      '供应商自部署',
      '云厂商自部署中转',
      '官方中转',
    ]);
  });
  it('does not invent ambiguous foreign legacy mappings or unknown providers', () => {
    expect(
      legacyChannelMapping('official_direct', {
        code: 'openai',
        businessDomain: 'overseas',
      }),
    ).toEqual({
      original: 'official_direct',
      mapped: null,
      needsConfirmation: true,
    });
    expect(
      channelTypeOptions({ code: 'xai', businessDomain: 'overseas' }),
    ).toEqual([]);
    expect(
      legacyChannelMapping('official_proxy', {
        code: 'deepseek',
        businessDomain: 'domestic',
      }).mapped,
    ).toBe('domestic_proxy');
  });
});
