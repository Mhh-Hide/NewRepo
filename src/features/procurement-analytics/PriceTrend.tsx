import { Alert, Empty, Tag } from 'antd';
import { buildChannelTrend } from '../../domain/procurement-analytics';
import type { AnalysisRecord } from '../../domain/procurement-analytics';
import { quoteStatusLabels } from '../../domain/statuses';
import { displayDate } from '../quotes/quote-format';
const colors = ['#265f98', '#a76b17', '#287c72', '#7753a5'];
export function PriceTrend({
  records,
  channelId,
  axis,
}: {
  records: readonly AnalysisRecord[];
  channelId: string;
  axis: 'created' | 'supplier';
}) {
  const trend = buildChannelTrend(records, channelId, axis);
  const points = trend.series.flatMap((s) => s.points);
  const dates = points.map((p) => Date.parse(p.at));
  const min = Math.min(...dates),
    max = Math.max(...dates);
  const x = (s: string) =>
    55 + (max === min ? 350 : ((Date.parse(s) - min) / (max - min)) * 690);
  const y = (n: number) => 205 - (n / 10000) * 170;
  return (
    <div className="analysis-trend">
      <p>
        横轴：
        {axis === 'created'
          ? '报价记录创建时间'
          : '供应商报价时间（不是回复时间）'}
        ；北京时间。纵轴：折扣基点。按完整价格口径和原录入状态分组，确认不会新增价格点。
      </p>
      {trend.issues.length > 0 && (
        <Alert
          type="info"
          showIcon
          title="趋势数据提示"
          description={
            <ul>
              {trend.issues.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          }
        />
      )}
      {points.length ? (
        <>
          <svg
            role="img"
            aria-label="渠道报价折扣历史趋势"
            viewBox="0 0 800 260"
            className="analysis-svg"
          >
            <title>
              同口径分组报价趋势；菱形为纠错，方形为原录入正式价，空心圆为原录入临时优惠
            </title>
            {[0, 5000, 10000].map((n) => (
              <g key={n}>
                <line x1="55" y1={y(n)} x2="760" y2={y(n)} stroke="#dae3ee" />
                <text x="5" y={y(n) + 4} fontSize="12">
                  {n}
                </text>
              </g>
            ))}
            {trend.series.map((s, index) => {
              const genuine = s.points.filter((p) => !p.correction);
              const color = colors[index % colors.length]!;
              return (
                <g key={s.label}>
                  {genuine.length >= 2 && (
                    <polyline
                      points={genuine
                        .map((p) => `${x(p.at)},${y(p.record.quote.discount)}`)
                        .join(' ')}
                      fill="none"
                      stroke={color}
                      strokeWidth="2"
                      strokeDasharray={
                        s.points[0]?.record.recordedStatus === 'temporary'
                          ? '6 4'
                          : undefined
                      }
                    />
                  )}
                  {s.points.map((p) => {
                    const px = x(p.at),
                      py = y(p.record.quote.discount);
                    const title = `${p.record.channel.name} · ${p.record.quote.discount}基点 · ${displayDate(p.at)} · ${p.correction ? '历史纠错，不作为真实调价' : quoteStatusLabels[p.record.recordedStatus]}`;
                    return (
                      <g key={p.record.quote.id}>
                        <title>{title}</title>
                        {p.correction ? (
                          <polygon
                            points={`${px},${py - 7} ${px + 7},${py} ${px},${py + 7} ${px - 7},${py}`}
                            fill={color}
                          />
                        ) : p.record.recordedStatus === 'effective' ? (
                          <rect
                            x={px - 5}
                            y={py - 5}
                            width="10"
                            height="10"
                            fill={color}
                          />
                        ) : (
                          <circle
                            cx={px}
                            cy={py}
                            r="5"
                            fill={
                              p.record.recordedStatus === 'temporary'
                                ? 'white'
                                : color
                            }
                            stroke={color}
                            strokeWidth="2"
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
            <text x="55" y="240" fontSize="12">
              {displayDate(new Date(min).toISOString())}
            </text>
            <text x="745" y="240" fontSize="12" textAnchor="end">
              {displayDate(new Date(max).toISOString())}
            </text>
          </svg>
          <div className="analysis-legend">
            {trend.series.map((s, i) => (
              <Tag key={s.label} color={colors[i % colors.length]!}>
                {s.label.replace(
                  / · (reference|pending_contract|effective|temporary|expired)$/,
                  ` · ${quoteStatusLabels[s.points[0]!.record.recordedStatus]}`,
                )}
              </Tag>
            ))}
          </div>
          <p>
            实心圆：参考/待确认；方形：原录入正式价；空心圆和虚线：临时优惠；菱形：纠错（不连入真实调价线）。数值与时间详见下方报价明细。
          </p>
        </>
      ) : (
        <Empty description="信息不足，无法绘制可信价格趋势；请查看上述具体原因及报价明细。" />
      )}
    </div>
  );
}
