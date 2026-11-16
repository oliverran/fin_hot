// 量化工具 · 总览：一段说明领起，下面两个工具入口（选股信号 / 策略回测）、三个策略的规则与口径。
import { IntentLink } from "@aihot/web/components/ui/IntentLink";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { PillTabs } from "@aihot/web/components/ui/Tabs";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { pageMeta } from "@aihot/web/lib/seo";
import { Link } from "react-router";
import { DISCLAIMER, QUANT_NAV, ROUTES, STRATEGIES } from "../../catalog.ts";

export const handle: Screen = { tab: "me", name: "量化工具" };

const TOOLS = [
  { to: ROUTES.signals, title: "选股信号", blurb: "按三个策略扫描股票池，给出当日符合条件的候选，附触发理由与置信度。" },
  { to: ROUTES.backtest, title: "策略回测", blurb: "用同一套规则跑一段历史，看净值曲线、年化、夏普与最大回撤。" },
];

export function meta() {
  return pageMeta({
    title: "量化工具",
    description: "站内的量化工具：超卖反弹、趋势向好、放量突破三个策略的每日选股信号，以及组合的净值回测。",
    path: ROUTES.home,
  });
}

export default function QuantHome() {
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-14">
      <PhoneBar back={{ to: "/more", label: "我的" }} title="量化工具" />
      <header className="pt-4 lg:pt-0">
        <Kicker>工具 · 量化</Kicker>
        <h1 data-page-title="" className="mt-4 text-[30px] font-black leading-[1.2] tracking-[-0.02em] text-ink lg:text-[38px]">
          量化工具
        </h1>
        <div className="mt-4 max-w-[42em] space-y-3">
          <p className="text-[14.5px] leading-[1.9] text-ink-3">
            把开源项目 stock-daily-analyzer 的三条流水线接进站内：按技术指标扫描候选、用同一套规则回测组合，再把结果和站内的资讯放在一起看。
          </p>
          <p className="text-[14.5px] leading-[1.9] text-ink-3">
            两张页面读的都是站外脚本跑出来的产物（行情快照与当日扫描结果），各自标注配置、区间与数据来源；回测有多份配置时可以切换着看。站内还没有产物时，先显示离线合成示例。
          </p>
          <p className="text-[14.5px] leading-[1.9] text-ink-3">
            候选与持仓里的每只股票都能跳到编年史的上市公司背景卡，以及站内关于它的报道。
          </p>
        </div>
        <PillTabs items={QUANT_NAV} active="home" layoutId="quant-nav" size="sm" label="量化页面" className="mt-6" />
      </header>

      <section className="pt-10">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line pb-3">
          <span className="text-[12px] font-bold tracking-[0.18em] text-accent">工具</span>
          <h2 className="text-[19px] font-bold text-ink">两个工具</h2>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <li key={tool.to}>
              <IntentLink viewTransition to={tool.to} className="card card-hover flex h-full flex-col gap-1.5 p-5">
                <span className="text-[17px] font-bold text-ink">{tool.title}</span>
                <span className="text-[13px] leading-[1.75] text-ink-3">{tool.blurb}</span>
                <span className="mt-auto pt-2 text-[12.5px] font-semibold text-accent">打开 →</span>
              </IntentLink>
            </li>
          ))}
        </ul>
      </section>

      <section className="pt-10">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line pb-3">
          <span className="text-[12px] font-bold tracking-[0.18em] text-accent">规则</span>
          <h2 className="text-[19px] font-bold text-ink">三个策略</h2>
        </div>
        <ul className="mt-4 space-y-2">
          {STRATEGIES.map((strategy) => (
            <li key={strategy.key} className="well flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-card px-4 py-3">
              <span className="text-[14px] font-semibold text-ink">{strategy.label}</span>
              <span className="num text-[12.5px] text-accent">{strategy.rule}</span>
              <span className="text-[12.5px] text-ink-3">{strategy.blurb}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="well mt-10 rounded-card px-4 py-3 text-[12.5px] leading-[1.75] text-ink-3">{DISCLAIMER}</p>

      <footer className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-[12.5px] text-ink-4">
        <Link viewTransition to={ROUTES.signals} className="transition-colors hover:text-accent">
          选股信号
        </Link>
        <Link viewTransition to={ROUTES.backtest} className="transition-colors hover:text-accent">
          策略回测
        </Link>
        <span>算法收录自开源项目 stock-daily-analyzer（oliverran/stock-daily-analyzer）</span>
      </footer>
    </div>
  );
}
