import type { ModelVendor } from './entities';
/** Stable business codes. Legacy codes remain readable and are never rewritten in history. */
export const businessChannelTypes = {
  openai_official: 'OpenAI 官方',
  azure_official: 'Azure 官方',
  openai_proxy: 'OpenAI 官方中转',
  azure_proxy: 'Azure 官方中转',
  codex_reverse: 'Codex 逆向',
  aws_official: 'AWS 官方',
  anthropic_official: 'Anthropic 官方',
  aws_proxy: 'AWS 中转',
  anthropic_proxy: 'Anthropic 中转',
  ccmax_reverse: 'CCMax 逆向',
  krio_proxy: 'Krio 中转',
  vertex_proxy: 'Vertex 中转',
  aws_large: 'AWS 中转大 Key',
  aws_small: 'AWS 中转小 Key',
  anthropic_large: 'Anthropic 中转大 Key',
  anthropic_small: 'Anthropic 中转小 Key',
  vertex_official: 'Vertex 官方',
  ai_studio_proxy: 'AI Studio 中转',
  cli_reverse: 'CLI 逆向',
  domestic_official: '官方',
  domestic_cloud: '云厂商自部署',
  domestic_supplier: '供应商自部署',
  domestic_cloud_proxy: '云厂商自部署中转',
  domestic_proxy: '官方中转',
} as const;
export type BusinessChannelType = keyof typeof businessChannelTypes;
const groups: Record<string, readonly BusinessChannelType[]> = {
  openai: [
    'openai_official',
    'azure_official',
    'openai_proxy',
    'azure_proxy',
    'codex_reverse',
  ],
  anthropic: [
    'aws_official',
    'anthropic_official',
    'aws_proxy',
    'anthropic_proxy',
    'ccmax_reverse',
    'krio_proxy',
    'vertex_proxy',
    'aws_large',
    'aws_small',
    'anthropic_large',
    'anthropic_small',
  ],
  google: ['vertex_official', 'vertex_proxy', 'ai_studio_proxy', 'cli_reverse'],
  domestic: [
    'domestic_official',
    'domestic_cloud',
    'domestic_supplier',
    'domestic_cloud_proxy',
    'domestic_proxy',
  ],
};
export function channelTypeOptions(
  vendor: Pick<ModelVendor, 'code' | 'businessDomain'>,
) {
  const codes =
    vendor.businessDomain === 'domestic'
      ? groups.domestic!
      : (groups[vendor.code.toLowerCase()] ?? []);
  return codes.map((value) => ({ value, label: businessChannelTypes[value] }));
}
export function legacyChannelMapping(
  value: string,
  vendor: Pick<ModelVendor, 'code' | 'businessDomain'>,
): {
  original: string;
  mapped: BusinessChannelType | null;
  needsConfirmation: boolean;
} {
  const domestic: Record<string, BusinessChannelType> = {
    official_direct: 'domestic_official',
    official_proxy: 'domestic_proxy',
    cloud_self_hosted: 'domestic_cloud',
    cloud_self_hosted_proxy: 'domestic_cloud_proxy',
    supplier_self_hosted: 'domestic_supplier',
  };
  const mapped =
    vendor.businessDomain === 'domestic' ? (domestic[value] ?? null) : null;
  return { original: value, mapped, needsConfirmation: !mapped };
}

export function channelTypeDisplay(
  value: string,
  vendor: Pick<ModelVendor, 'code' | 'businessDomain'>,
  legacyLabel: string,
): string {
  if (Object.hasOwn(businessChannelTypes, value))
    return businessChannelTypes[value as BusinessChannelType];
  const mapped = legacyChannelMapping(value, vendor);
  return mapped.mapped
    ? businessChannelTypes[mapped.mapped]
    : `${legacyLabel} · 待确认`;
}
