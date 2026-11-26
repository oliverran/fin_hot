// 后台「评测前沿」页：把一次 SelectBench 对比运行画成帕累托前沿图——横轴成本（或令牌），
// 纵轴质量，泡泡大小看延迟，非支配点连成阶梯前沿线（越靠左上越好）。数据来自 /api/admin/model-eval
//（server.ts 的 adminHandler 守卫）；前沿在页面里现算，切换横纵指标不必再请求后端。
// 模块的后台页没有 +types 产物，props 自己声明。
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { AdminModelEval, AdminModelEvalPoint } from "@aihot/contracts/admin";
import { adminGet } from "@aihot/web/lib/admin.server";
import { bj, num, pct } from "@aihot/web/features/admin/format";
import { AdminPage, Badge, Card, Empty, Select } from "@aihot/web/features/admin/ui";

export async function loader({ request }: { request: Request }): Promise<AdminModelEval> {
  const run = new URL(request.url).searchParams.get("run");
  return adminGet<AdminModelEval>(request, `/api/admin/model-eval${run ? `?run=${encodeURIComponent(run)}` : ""}`);
}

export const meta = () => [{ title: "评测前沿 · 后台" }];

/** 纵轴可选的质量指标；越靠上越好。默认「完整准确率」：把失败算进分母，藏不住答不出的模型。 */
const QUALITY = [
  { key: "completeAccuracy", label: "完整准确率", hint: "失败也算错，含覆盖率" },
  { key: "f1", label: "F1", hint: "只算答出来的判定" },
  { key: "precision", label: "精确率", hint: "选中里有多少该选" },
  { key: "recall", label: "召回率", hint: "该选的有多少选中" },
] as const;
type QualityKey = (typeof QUALITY)[number]["key"];

/** 横轴可选的成本口径；越靠左越省。 */
const COST = [
  { key: "money", label: "成本（元/样本）", hint: "按 service_prices 目录价估算" },
  { key: "tokens", label: "令牌（千/样本）", hint: "入+出，缺价时也能比" },
] as const;
type CostKey = (typeof COST)[number]["key"];

const PALETTE = ["#2f6fed", "#e0651a", "#0f9d58", "#9b51e0", "#c2185b", "#00838f", "#f9a825", "#5c6bc0"];

/** 横坐标：成本（元/样本，缺价是 null）或令牌（千/样本）。 */
function xOf(p: AdminModelEvalPoint, axis: CostKey, sampleSize: number): number | null {
  if (axis === "tokens") return sampleSize > 0 ? (p.tokensIn + p.tokensOut) / sampleSize / 1000 : null;
  return p.costPerCase;
}

const xTick = (v: number, axis: CostKey) => (axis === "tokens" ? `${v.toFixed(1)}k` : `¥${v < 1 ? v.toFixed(3) : v.toFixed(2)}`);

/** 非支配点：没有人同时更便宜且更准。按横坐标升序返回，纵坐标随之递增。 */
function paretoFrontier<T extends { x: number; y: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.x - b.x || b.y - a.y);
  const out: T[] = [];
  let best = -Infinity;
  for (const it of sorted) if (it.y > best) { out.push(it); best = it.y; }
  return out;
}

const WM = 58;
const WT = 26;
const WR = 28;
const WB = 46;
const W = 760;
const H = 460;

/** 帕累托散点图：横轴越小越好、纵轴越大越好；前端现算前沿，一条阶梯线连起非支配点。 */
function ParetoChart({ points, colors, quality, axis, sampleSize }: { points: AdminModelEvalPoint[]; colors: Map<string, string>; quality: QualityKey; axis: CostKey; sampleSize: number }) {
  const plotted = points
    .map((p) => ({ p, x: xOf(p, axis, sampleSize), y: p[quality] }))
    .filter((o): o is { p: AdminModelEvalPoint; x: number; y: number } => o.x !== null && Number.isFinite(o.x));
  if (!plotted.length) return <Empty>这次运行里没有可画的模型：要么该口径下的数据缺失（如渠道没有单价），要么还没有逐条结果。</Empty>;

  const front = new Set(paretoFrontier(plotted));
  const xs = plotted.map((o) => o.x);
  const ys = plotted.map((o) => o.y);
  const xMax = Math.max(...xs) * 1.08 || 1;
  const yMin = Math.max(0, Math.min(...ys) - 0.05);
  const yMax = Math.min(1, Math.max(...ys) + 0.05);
  const X = (v: number) => WM + (v / xMax) * (W - WM - WR);
  const Y = (v: number) => WT + (1 - (v - yMin) / Math.max(1e-6, yMax - yMin)) * (H - WT - WB);
  const lat = plotted.map((o) => o.p.avgLatencyMs);
  const latMin = Math.min(...lat);
  const latMax = Math.max(...lat);
  const R = (v: number) => (latMax > latMin ? 5 + 6 * ((v - latMin) / (latMax - latMin)) : 6.5);

  // 阶梯：从左起，向右一步、向上一格，表示「再贵一点能换到的最高质量」。
  const steps = paretoFrontier(plotted).sort((a, b) => a.x - b.x);
  let d = `M${X(steps[0]!.x)} ${Y(steps[0]!.y)}`;
  for (let i = 1; i < steps.length; i++) d += ` H${X(steps[i]!.x)} V${Y(steps[i]!.y)}`;
  d += ` H${X(xMax)}`;

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * xMax);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="不同模型在成本与质量上的帕累托前沿">
        {xTicks.map((t, i) => (
          <g key={`x${i}`}>
            <line x1={X(t)} x2={X(t)} y1={WT} y2={H - WB} stroke="currentColor" className="text-line-soft" strokeWidth="1" />
            <text x={X(t)} y={H - WB + 18} textAnchor="middle" className="fill-ink-4 text-[11px]">{xTick(t, axis)}</text>
          </g>
        ))}
        {yTicks.map((t, i) => (
          <g key={`y${i}`}>
            <line x1={WM} x2={W - WR} y1={Y(t)} y2={Y(t)} stroke="currentColor" className="text-line-soft" strokeWidth="1" />
            <text x={WM - 8} y={Y(t) + 3.5} textAnchor="end" className="fill-ink-4 text-[11px]">{pct(t, 0)}</text>
          </g>
        ))}
        <line x1={WM} x2={W - WR} y1={H - WB} y2={H - WB} stroke="currentColor" className="text-line-strong" strokeWidth="1" />
        <line x1={WM} x2={WM} y1={WT} y2={H - WB} stroke="currentColor" className="text-line-strong" strokeWidth="1" />
        <text x={(WM + W - WR) / 2} y={H - 8} textAnchor="middle" className="fill-ink-4 text-[11px]">{COST.find((c) => c.key === axis)!.label}</text>
        <text x={14} y={WT + (H - WT - WB) / 2} textAnchor="middle" transform={`rotate(-90 14 ${WT + (H - WT - WB) / 2})`} className="fill-ink-4 text-[11px]">
          {QUALITY.find((q) => q.key === quality)!.label}
        </text>
        {steps.length > 1 && <path d={d} fill="none" stroke="currentColor" className="text-accent" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />}
        {plotted.map((o) => (
          <g key={o.p.model}>
            <circle cx={X(o.x)} cy={Y(o.y)} r={R(o.p.avgLatencyMs)} fill={colors.get(o.p.model)} fillOpacity={front.has(o) ? 0.85 : 0.4} stroke={colors.get(o.p.model)} strokeWidth={front.has(o) ? 1.5 : 0} />
            <title>{`${o.p.model}｜${COST.find((c) => c.key === axis)!.label} ${xTick(o.x, axis)}｜${QUALITY.find((q) => q.key === quality)!.label} ${pct(o.y)}｜平均耗时 ${(o.p.avgLatencyMs / 1000).toFixed(1)}s`}</title>
          </g>
        ))}
        {plotted.map((o) => {
          const below = Y(o.y) - R(o.p.avgLatencyMs) < WT + 14;
          return (
            <text key={`t${o.p.model}`} x={Math.min(X(o.x), W - WR - 24)} y={Y(o.y) + (below ? R(o.p.avgLatencyMs) + 13 : -R(o.p.avgLatencyMs) - 5)} textAnchor="middle" className="fill-ink-2 text-[10.5px]">
              {o.p.model}
            </text>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-3">
        {plotted.map((o) => (
          <span key={`l${o.p.model}`} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ background: colors.get(o.p.model), opacity: front.has(o) ? 1 : 0.45 }} />
            {o.p.model}
            {front.has(o) && <Badge tone="accent">前沿</Badge>}
          </span>
        ))}
        <span className="text-ink-4">泡泡越大 = 平均耗时越长；虚线 = 帕累托前沿</span>
      </div>
    </div>
  );
}

export default function AdminModelEval({ loaderData }: { loaderData: AdminModelEval }) {
  const navigate = useNavigate();
  const [quality, setQuality] = useState<QualityKey>("completeAccuracy");
  const [axis, setAxis] = useState<CostKey>("money");
  const { run, runs, points, note } = loaderData;
  if (!run) {
    return (
      <AdminPage title="评测前沿" subtitle="把每次模型对比的结果画成「成本 × 质量」的帕累托前沿：越靠左上越好，非支配点连成一条阶梯线。">
        <Card><Empty>还没有任何对比运行。按 docs/selection.md 准备好金标后，运行 scripts/eval-selection.ts；结果会自动导入 SelectBench，这里就会出现对应的前沿图。</Empty></Card>
      </AdminPage>
    );
  }
  const colors = new Map(points.map((p, i) => [p.model, PALETTE[i % PALETTE.length]!]));
  const sampleSize = run.sampleSize;
  const unpriced = points.filter((p) => xOf(p, axis, sampleSize) === null);

  const chip = (active: boolean) => `rounded-full px-2.5 py-1 text-[12.5px] transition-colors ${active ? "bg-ink text-bg" : "bg-surface text-ink-2 ring-1 ring-line hover:bg-bg-sunk"}`;

  return (
    <AdminPage
      title="评测前沿"
      subtitle="把每次模型对比的结果画成「成本 × 质量」的帕累托前沿：越靠左上越好，非支配点连成一条阶梯线。数据来自 SelectBench，由 scripts/eval-selection.ts 产生。"
      actions={
        runs.length > 1 ? (
          <Select value={run.id} onChange={(e) => navigate(`?run=${encodeURIComponent(e.target.value)}`)}>
            {runs.map((r) => <option key={r.id} value={r.id}>{`${bj(r.createdAt, true)} · ${r.label}`}</option>)}
          </Select>
        ) : (
          <span className="text-[12.5px] text-ink-4">{`${bj(run.createdAt, true)} · ${run.label}`}</span>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12.5px] text-ink-4">纵轴</span>
          {QUALITY.map((q) => (
            <button key={q.key} type="button" title={q.hint} className={chip(quality === q.key)} onClick={() => setQuality(q.key)}>{q.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12.5px] text-ink-4">横轴</span>
          {COST.map((c) => (
            <button key={c.key} type="button" title={c.hint} className={chip(axis === c.key)} onClick={() => setAxis(c.key)}>{c.label}</button>
          ))}
        </div>
      </div>

      <Card
        title="帕累托前沿"
        right={<span>{`${run.split ?? "全部"} · ${num(run.sampleSize)} 条 · ${run.promptVersion ?? "提示版本未记录"}`}</span>}
      >
        <ParetoChart points={points} colors={colors} quality={quality} axis={axis} sampleSize={sampleSize} />
        <p className="mt-3 text-[12px] leading-relaxed text-ink-4">{note}</p>
        {unpriced.length > 0 && axis === "money" && (
          <p className="mt-1 text-[12px] text-amber-ink">未画进图：{unpriced.map((p) => p.model).join("、")} 的渠道没有单价（service_prices）。</p>
        )}
      </Card>

      <div className="mt-5">
        <Card title="逐模型明细" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-3">
                  {["模型", "完整准确率", "有效输出准确率", "覆盖率", "精确率", "召回率", "F1", "入选比例", "金标入选", "失败", "平均耗时", "输入/输出 tokens", "成本/样本"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.model} className="border-b border-line/70 last:border-0">
                    <td className="px-3 py-2 font-medium text-ink">
                      <span className="mr-1.5 inline-block size-2.5 rounded-full align-middle" style={{ background: colors.get(p.model) }} />
                      {p.model}
                    </td>
                    <td className="num px-3 py-2 font-semibold text-ink">{pct(p.completeAccuracy)}</td>
                    <td className="num px-3 py-2">{pct(p.accuracy)}</td>
                    <td className="num px-3 py-2">{pct(p.coverage)}</td>
                    <td className="num px-3 py-2">{pct(p.precision)}</td>
                    <td className="num px-3 py-2">{pct(p.recall)}</td>
                    <td className="num px-3 py-2">{pct(p.f1)}</td>
                    <td className="num px-3 py-2">{pct(p.selectedRate)}</td>
                    <td className="num px-3 py-2">{pct(p.goldSelectRate)}</td>
                    <td className="num px-3 py-2">{p.errors ? <span className="text-hot">{p.errors}</span> : 0}</td>
                    <td className="num px-3 py-2">{p.avgLatencyMs ? `${(p.avgLatencyMs / 1000).toFixed(1)}s` : "—"}</td>
                    <td className="num px-3 py-2 text-ink-3">{num(p.tokensIn)} / {num(p.tokensOut)}</td>
                    <td className="num px-3 py-2">{p.costPerCase === null ? <span className="text-ink-4">未定价</span> : `¥${p.costPerCase < 1 ? p.costPerCase.toFixed(4) : p.costPerCase.toFixed(2)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-ink-4">
        想看逐条判定，去 <Link to={`/admin/selectbench/${run.id}`} className="text-accent">SelectBench</Link>；这里只做模型之间的取舍比较。
      </p>
    </AdminPage>
  );
}
