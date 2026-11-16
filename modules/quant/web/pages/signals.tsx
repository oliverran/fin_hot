// 量化工具 · 选股信号：按三个策略分组，列出当日扫描出的候选，附触发指标、置信度与理由。
// 数据来自 /api/quant/signals（server.ts）；策略定义与总览页共用 catalog.ts，不各写一份。
import { Badge } from "@aihot/web/components/ui/Badge";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { EmptyState } from "@aihot/web/components/ui/Page";
import { PillTabs } from "@aihot/web/components/ui/Tabs";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { loadOr404 } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { Link } from "react-router";
import { companyLinks, DISCLAIMER, QUANT_NAV, ROUTES, type Signal, type SignalsData } from "../../catalog.ts";

export const handle: Screen = { tab: "me", name: "选股信号" };

export async function loader({ request }: { request: Request }): Promise<SignalsData> {
  return loadOr404<SignalsData>("/api/quant/signals", { signal: request.signal });
}

export function meta() {
  return pageMeta({
    title: "选股信号",
    description: "超卖反弹、趋势向好、放量突破三个策略的每日选股信号，附触发指标与置信度。",
    path: ROUTES.signals,
  });
}

export default function QuantSignals({ loaderData }: { loaderData: SignalsData }) {
  const total = loaderData.strategies.reduce((sum, strategy) => sum + strategy.picks.length, 0);
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-14">
      <PhoneBar back={{ to: ROUTES.home, label: "量化工具" }} title="选股信号" />
      <header className="pt-4 lg:pt-0">
        <Kicker>工具 · 量化</Kicker>
        <h1 data-page-title="" className="mt-4 text-[30px] font-black leading-[1.2] tracking-[-0.02em] text-ink lg:text-[38px]">
          选股信号
        </h1>
        <p className="mt-4 max-w-[42em] text-[14.5px] leading-[1.9] text-ink-3">
          按三个策略逐一扫描股票池，列出当日符合条件的候选。信号说明的是「此刻的形态像什么」，不是「该不该买」——它给的是研究的起点。
        </p>
        <PillTabs items={QUANT_NAV} active="signals" layoutId="quant-nav" size="sm" label="量化页面" className="mt-6" />
        <p className="well mt-5 rounded-card px-4 py-3 text-[12.5px] leading-[1.75] text-ink-3">
          截至 {loaderData.asOf} · 扫描 {loaderData.universe} 只 · 共 {total} 条候选。数据来源：{loaderData.source}。
        </p>
      </header>

      {loaderData.strategies.map((strategy) => (
        <section key={strategy.key} className="pt-10">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line pb-3">
            <span className="text-[12px] font-bold tracking-[0.18em] text-accent">{strategy.key}</span>
            <h2 className="text-[19px] font-bold text-ink">{strategy.label}</h2>
            <span className="num text-[12.5px] text-ink-3">{strategy.rule}</span>
            <span className="ml-auto text-[12px] text-ink-4">{strategy.picks.length} 条</span>
          </div>
          {strategy.picks.length === 0 ? (
            <EmptyState title="今日没有符合条件的候选">放宽其中一个条件，或换一个策略看看。</EmptyState>
          ) : (
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {strategy.picks.map((pick) => (
                <PickCard key={`${strategy.key}-${pick.ticker}`} pick={pick} />
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="well mt-10 rounded-card px-4 py-3 text-[12.5px] leading-[1.75] text-ink-3">{DISCLAIMER}</p>

      <footer className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-[12.5px] text-ink-4">
        <Link viewTransition to={ROUTES.home} className="transition-colors hover:text-accent">
          量化工具
        </Link>
        <Link viewTransition to={ROUTES.backtest} className="transition-colors hover:text-accent">
          策略回测
        </Link>
        <span>算法收录自开源项目 stock-daily-analyzer（oliverran/stock-daily-analyzer）</span>
      </footer>
    </div>
  );
}

/** 一条候选：名称与行业、置信度条、四项触发指标、理由。 */
function PickCard({ pick }: { pick: Signal }) {
  return (
    <li className="card flex flex-col gap-2.5 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="num text-[12.5px] text-ink-4">{pick.ticker}</span>
        <span className="text-[15.5px] font-semibold text-ink">{pick.name}</span>
        <Badge tone="neutral">{pick.sector}</Badge>
        <span className="ml-auto inline-flex items-baseline gap-1.5">
          <span className="text-[11.5px] text-ink-4">置信度</span>
          <span className="num text-[13px] font-semibold text-accent">{pick.confidence}</span>
        </span>
      </div>
      <span className="flex h-1 overflow-hidden rounded-full bg-well">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pick.confidence}%` }} />
      </span>
      <dl className="num grid grid-cols-4 gap-x-3 gap-y-1">
        <div>
          <dt className="text-[11.5px] text-ink-4">现价</dt>
          <dd className="text-[13px] text-ink-2">{pick.price}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-ink-4">RSI</dt>
          <dd className="text-[13px] text-ink-2">{pick.rsi}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-ink-4">MACD</dt>
          <dd className="text-[13px] text-ink-2">{pick.macdSignal}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-ink-4">量比</dt>
          <dd className="text-[13px] text-ink-2">{pick.volumeRatio}</dd>
        </div>
      </dl>
      <p className="text-[12.5px] leading-[1.75] text-ink-3">{pick.reasoning}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5 text-[12px]">
        <Link viewTransition to={companyLinks(pick.name).chronicle} className="text-ink-4 transition-colors hover:text-accent">
          上市公司背景卡
        </Link>
        <Link viewTransition to={companyLinks(pick.name).reports} className="text-ink-4 transition-colors hover:text-accent">
          站内报道 →
        </Link>
      </div>
    </li>
  );
}
