// 量化工具 · 策略回测：把选股规则放回历史里跑一遍，展示几项常规指标、净值曲线与最近一次调仓的持仓。
// 数据来自 /api/quant/backtest（server.ts）；页面只读，不落任何状态。
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { PillTabs } from "@aihot/web/components/ui/Tabs";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { loadOr404 } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { Link } from "react-router";
import { companyLinks, DISCLAIMER, QUANT_NAV, ROUTES, type BacktestData, type EquityPoint } from "../../catalog.ts";

export const handle: Screen = { tab: "me", name: "策略回测" };

export async function loader({ request }: { request: Request }): Promise<BacktestData> {
  // 配置名走查询参数：切换配置就是换一个 ?name=，其余交给服务端那一份产物。
  const name = new URL(request.url).searchParams.get("name");
  const path = name ? `/api/quant/backtest?name=${encodeURIComponent(name)}` : "/api/quant/backtest";
  return loadOr404<BacktestData>(path, { signal: request.signal });
}

export function meta() {
  return pageMeta({
    title: "策略回测",
    description: "用同一套选股规则跑一段历史：净值曲线、年化收益、夏普比率与最大回撤。",
    path: ROUTES.backtest,
  });
}

/** 小数写成百分数；回撤为负值，保留负号。 */
const pct = (value: number, digits = 2) => `${value < 0 ? "-" : ""}${(Math.abs(value) * 100).toFixed(digits)}%`;

export default function QuantBacktest({ loaderData }: { loaderData: BacktestData }) {
  const { config, metrics, equity, holdings, source, snapshots, active } = loaderData;
  const maxWeight = holdings[0]?.weight || 1;
  // 多份快照时给一行配置切换；每一份是同一页面的另一个 ?name=，走链接而不是本地状态。
  const configTabs = snapshots.map((name) => ({ key: name, label: name, to: `${ROUTES.backtest}?name=${encodeURIComponent(name)}` }));
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-14">
      <PhoneBar back={{ to: ROUTES.home, label: "量化工具" }} title="策略回测" />
      <header className="pt-4 lg:pt-0">
        <Kicker>工具 · 量化</Kicker>
        <h1 data-page-title="" className="mt-4 text-[30px] font-black leading-[1.2] tracking-[-0.02em] text-ink lg:text-[38px]">
          策略回测
        </h1>
        <p className="mt-4 max-w-[42em] text-[14.5px] leading-[1.9] text-ink-3">
          把选股规则放回历史里跑一遍：按固定节奏调仓，看组合的净值曲线与几项常规指标。回测衡量的是规则与过去行情的贴合程度，不是对未来的承诺。
        </p>
        <PillTabs items={QUANT_NAV} active="backtest" layoutId="quant-nav" size="sm" label="量化页面" className="mt-6" />
        <p className="well mt-5 rounded-card px-4 py-3 text-[12.5px] leading-[1.75] text-ink-3">
          {config.name} · {config.universe} · {config.start} 至 {config.end} · {config.rebalance}。数据来源：{source}。
        </p>
        {snapshots.length > 1 && (
          <PillTabs items={configTabs} active={active} layoutId="quant-backtest-config" size="sm" label="回测配置" className="mt-4" />
        )}
      </header>

      <section className="pt-10">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line pb-3">
          <span className="text-[12px] font-bold tracking-[0.18em] text-accent">指标</span>
          <h2 className="text-[19px] font-bold text-ink">组合表现</h2>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Metric label="累计收益" value={pct(metrics.totalReturn)} tone={metrics.totalReturn >= 0 ? "up" : "down"} />
          <Metric label="年化收益" value={pct(metrics.cagr)} tone={metrics.cagr >= 0 ? "up" : "down"} />
          <Metric label="夏普比率" value={metrics.sharpe.toFixed(2)} />
          <Metric label="最大回撤" value={pct(metrics.maxDrawdown)} tone="down" />
          <Metric label="胜率" value={pct(metrics.winRate, 1)} />
        </dl>
      </section>

      <section className="pt-10">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line pb-3">
          <span className="text-[12px] font-bold tracking-[0.18em] text-accent">曲线</span>
          <h2 className="text-[19px] font-bold text-ink">净值走势</h2>
          <span className="ml-auto text-[12px] text-ink-4">起点 = 1.00</span>
        </div>
        <EquityCurve points={equity} />
      </section>

      <section className="pt-10">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line pb-3">
          <span className="text-[12px] font-bold tracking-[0.18em] text-accent">持仓</span>
          <h2 className="text-[19px] font-bold text-ink">最近一次调仓</h2>
          <span className="ml-auto text-[12px] text-ink-4">{holdings.length} 只</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[12px] text-ink-4">
                <th className="py-2 pr-3 font-medium">持仓</th>
                <th className="py-2 pr-3 font-medium">行业</th>
                <th className="py-2 pr-3 font-medium">权重</th>
                <th className="py-2 font-medium">占比</th>
                <th className="py-2 pl-3 text-right font-medium">站内</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => (
                <tr key={holding.ticker} className="border-b border-line-soft">
                  <th className="py-2.5 pr-3 font-semibold text-ink">
                    <Link viewTransition to={companyLinks(holding.name).chronicle} className="transition-colors hover:text-accent">
                      {holding.name !== holding.ticker && (
                        <span className="num mr-1.5 text-[12px] font-normal text-ink-4">{holding.ticker}</span>
                      )}
                      {holding.name}
                    </Link>
                  </th>
                  <td className="py-2.5 pr-3 text-ink-3">{holding.sector}</td>
                  <td className="num py-2.5 pr-3 text-ink-2">{pct(holding.weight, 1)}</td>
                  <td className="py-2.5">
                    <span className="flex h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-bg-sunk">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${(holding.weight / maxWeight) * 100}%` }} />
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-right text-[12px]">
                    <Link viewTransition to={companyLinks(holding.name).reports} className="text-ink-4 transition-colors hover:text-accent">
                      报道 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="well mt-10 rounded-card px-4 py-3 text-[12.5px] leading-[1.75] text-ink-3">{DISCLAIMER}</p>

      <footer className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-[12.5px] text-ink-4">
        <Link viewTransition to={ROUTES.home} className="transition-colors hover:text-accent">
          量化工具
        </Link>
        <Link viewTransition to={ROUTES.signals} className="transition-colors hover:text-accent">
          选股信号
        </Link>
        <span>算法收录自开源项目 stock-daily-analyzer（oliverran/stock-daily-analyzer）</span>
      </footer>
    </div>
  );
}

/** 一项指标：小标题加一个数；收益类按 A 股习惯红涨绿跌。 */
function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const color = tone === "up" ? "text-hot" : tone === "down" ? "text-ok" : "text-ink";
  return (
    <div className="well rounded-card px-4 py-3">
      <dt className="text-[12px] text-ink-4">{label}</dt>
      <dd className={`num mt-1 text-[19px] font-bold ${color}`}>{value}</dd>
    </div>
  );
}

/**
 * 净值曲线：一条折线加一层浅色填充。等比映射到固定画布上，用 non-scaling-stroke 让线宽不随缩放变形。
 * 点数固定在一段历史内，直接用 SVG 画，不引入图表库。
 */
function EquityCurve({ points }: { points: EquityPoint[] }) {
  const width = 760;
  const height = 240;
  const padX = 8;
  const padY = 14;
  const values = points.map((point) => point.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const xAt = (index: number) => padX + index * step;
  const yAt = (value: number) => padY + (height - padY * 2) * (1 - (value - min) / span);
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(1)} ${yAt(point.equity).toFixed(1)}`).join(" ");
  const area = `${line} L${xAt(points.length - 1).toFixed(1)} ${height - padY} L${xAt(0).toFixed(1)} ${height - padY} Z`;
  return (
    <figure className="card mt-4 p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[240px] w-full text-accent"
        preserveAspectRatio="none"
        role="img"
        aria-label={`净值曲线，从 ${points[0]?.date} 到 ${points.at(-1)?.date}`}
      >
        <path d={area} fill="currentColor" className="opacity-10" />
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-2 flex items-baseline justify-between text-[12px] text-ink-4">
        <span>{points[0]?.date}</span>
        <span className="num">
          区间最高 {max.toFixed(2)} · 最低 {min.toFixed(2)}
        </span>
        <span>{points.at(-1)?.date}</span>
      </figcaption>
    </figure>
  );
}
