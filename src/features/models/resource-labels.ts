import type { Model, BusinessDomain } from '../../domain/entities';
export const modelCategoryLabels: Readonly<Record<Model['category'], string>> =
  {
    text: '文本',
    image: '图像',
    video: '视频',
    audio: '音频',
    multimodal: '多模态',
    other: '其他',
  };
export const regionVariantLabels: Readonly<
  Record<Model['regionVariant'], string>
> = { domestic: '国内版', overseas: '海外版', global: '全球版', other: '其他' };
export const businessDomainLabels: Readonly<Record<BusinessDomain, string>> = {
  domestic: '国内模型',
  overseas: '海外模型',
};
