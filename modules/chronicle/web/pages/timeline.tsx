// 大事记：A股三十余年的转折与大事记，按时代编排成一条时间轴；每个时代与关键事件挂上代表个股。
// 与卷页的「一路读」互补：卷页按主题深入，这里按年代横看每一幕，找回市场的历史纵深感。
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { PillTabs } from "@aihot/web/components/ui/Tabs";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { pageMeta } from "@aihot/web/lib/seo";
import { Link } from "react-router";
import { ROUTES } from "../../catalog.ts";
import { TIMELINE, type TimelineStock } from "../timeline.ts";

export const handle: Screen = { tab: "chronicle", name: "编年史" };

/** A股 / 美股两个编年史的切换；与首页保持一致。 */
const SCOPE_TABS = [
  { key: "a-share", label: "A股编年史", to: ROUTES.home },
  { key: "us", label: "美股编年史", to: ROUTES.usMarket },
];

export function meta() {
  return pageMeta({
    title: "A股大事记",
    description: "把 A 股三十余年的转折、制度变迁与代表性个股，按时代串成一条时间轴。",
    path: ROUTES.timeline,
  });
}

/** 一排代表个股：名称挂到个股背景卡，后面跟一句它为什么成为代表。 */
function StockList({ stocks, label }: { stocks: readonly TimelineStock[]; label?: string }) {
  return (
    <div className="mt-3">
      {label && <p className="text-[11.5px] font-bold tracking-[0.1em] text-accent">{label}</p>}
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stocks.map((stock) => (
          <li key={stock.name} className="well rounded-tile px-3.5 py-2.5">
            {stock.code ? (
              <Link
                viewTransition
                to={`/chronicle/companies?q=${stock.code}`}
                className="text-[13.5px] font-semibold text-ink transition-colors hover:text-accent"
              >
                {stock.name}
              </Link>
            ) : (
              <span className="text-[13.5px] font-semibold text-ink">{stock.name}</span>
            )}
            <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{stock.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ChronicleTimeline() {
  return (
    <div className="pb-14">
      <PhoneBar back={{ to: ROUTES.home, label: "A股编年史" }} title="大事记" />
      <Link viewTransition to={ROUTES.home} className="hidden py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex">
        ← A股编年史
      </Link>

      <header className="pt-4 lg:pt-0">
        <Kicker>知识库 · 编年史 · 大事记</Kicker>
        <h1 data-page-title="" className="mt-4 text-[30px] font-black leading-[1.2] tracking-[-0.02em] text-ink lg:text-[38px]">
          A股大事记
        </h1>
        <div className="mt-4 max-w-[42em] space-y-3">
          <p className="text-[14.5px] leading-[1.9] text-ink-3">
            三十余年，A 股从「老八股」长到五千多家上市公司，也走过了数轮从狂热到绝望的完整周期。这条时间轴把那些改变了市场规则的转折——制度、资金结构与产业叙事——按年代排开，并附上每个时代最典型的代表个股。
          </p>
          <p className="text-[14.5px] leading-[1.9] text-ink-3">
            它不预测行情，只提供一份可以按图索骥的历史底稿：读三卷之前先看一遍，知道每一幕的来处；读到某一张图时再翻回来，就能把它放回当年的语境里。
          </p>
        </div>
        <PillTabs items={SCOPE_TABS} active="a-share" layoutId="chronicle-scope" size="sm" label="编年史范围" className="mt-6" />
        <p className="well mt-5 rounded-card px-4 py-3 text-[12.5px] leading-[1.75] text-ink-3">
          事件按公开市场史整理，代表个股仅为该时点的历史样本，不代表推荐。点开个股名称可查其背景资料；退市个股不设链接。只作历史复盘与学习用途，不构成任何投资建议。
        </p>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_190px] lg:gap-10">
        <div className="min-w-0">
          {TIMELINE.map((era) => (
            <section key={era.key} id={`era-${era.key}`} className="scroll-mt-24 pt-11">
              <div className="border-b border-line pb-3">
                <h2 className="num text-[19px] font-bold text-ink">{era.label}</h2>
              </div>
              <p className="mt-3 max-w-[46em] text-[13.5px] leading-[1.85] text-ink-3">{era.intro}</p>
              {era.stocks?.length ? <StockList stocks={era.stocks} label="这个时代的代表个股" /> : null}

              <ol className="mt-6 space-y-7 border-l border-line-soft pl-5">
                {era.events.map((event) => (
                  <li key={event.title} className="relative">
                    <span className="absolute -left-[25px] top-[7px] h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                    <p className="num text-[12px] font-bold tracking-[0.12em] text-accent">{event.date}</p>
                    <h3 className="mt-1 text-[15.5px] font-bold leading-snug text-ink">{event.title}</h3>
                    <p className="mt-1.5 max-w-[46em] text-[13.5px] leading-[1.85] text-ink-2">{event.summary}</p>
                    {event.stocks?.length ? <StockList stocks={event.stocks} label="代表个股" /> : null}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <nav aria-label="大事记目录" className="hidden lg:block">
          <div className="sticky top-8">
            <p className="text-[11.5px] font-bold tracking-[0.1em] text-ink-4">目录</p>
            <ul className="mt-3 space-y-1.5 border-l border-line pl-3">
              {TIMELINE.map((era) => (
                <li key={era.key}>
                  <a href={`#era-${era.key}`} className="block text-[12.5px] leading-snug text-ink-3 transition-colors hover:text-accent">
                    {era.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>

      <nav aria-label="继续阅读" className="mt-12 grid gap-3 sm:grid-cols-2">
        <Link viewTransition to={ROUTES.home} className="card card-hover flex flex-col gap-1 p-4">
          <span className="text-[11.5px] text-ink-4">返回</span>
          <span className="text-[14.5px] font-semibold text-ink">A股编年史 · 序章</span>
        </Link>
        <Link viewTransition to={ROUTES.charts} className="card card-hover flex flex-col gap-1 p-4 sm:text-right">
          <span className="text-[11.5px] text-ink-4">按图查找</span>
          <span className="text-[14.5px] font-semibold text-ink">图表索引</span>
        </Link>
      </nav>

      <p className="mt-10 border-t border-line pt-5 text-[12.5px] leading-[1.75] text-ink-4">
        标「日线」的图表来自公开行情接口，每个交易日收盘后自动更新；缺失数据不展示曲线。只作历史复盘与学习用途，不构成任何投资建议。
        <Link viewTransition to={ROUTES.methodology} className="ml-1 text-accent hover:underline">
          数据口径与免责
        </Link>
      </p>
    </div>
  );
}
