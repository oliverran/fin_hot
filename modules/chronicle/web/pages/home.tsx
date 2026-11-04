// 编年史首页 · 序章：一段总导读领起，下面按卷列出入口（宽基 / 行业 / 抱团），
// 再由三个数据工具收尾。点进任一卷，就是一篇可以一路读下去的长文。
import { IntentLink } from "@aihot/web/components/ui/IntentLink";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { PillTabs } from "@aihot/web/components/ui/Tabs";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { pageMeta } from "@aihot/web/lib/seo";
import { Link } from "react-router";
import { GROUPS, PAGES, ROUTES } from "../../catalog.ts";
import { SITE_PROLOGUE, VOLUME_META } from "../narrative.ts";
import { TIMELINE } from "../timeline.ts";

export const handle: Screen = { tab: "chronicle", name: "编年史" };

/** A股 / 美股两个编年史的切换；手机底栏只有一个「编年史」页签，切换放在页内。 */
const SCOPE_TABS = [
  { key: "a-share", label: "A股编年史", to: ROUTES.home },
  { key: "us", label: "美股编年史", to: ROUTES.usMarket },
];

/** 首页底部的数据工具入口，卡片式，与上面的卷入口一致。 */
const TOOLS = [
  { to: "/chronicle/compare", title: "多指数对比与区间复盘", blurb: "任选多只指数对齐同一区间，比较涨跌幅、最大回撤与年化波动。" },
  { to: "/chronicle/sectors-live", title: "行业数据与轮动", blurb: "申万一级行业的涨跌幅、估值分位与最近十二个月轮动。" },
  { to: "/chronicle/market", title: "市场背景与两融", blurb: "市场宽度、ETF 份额与两融余额。" },
  { to: "/chronicle/funds", title: "公募披露持仓与共识", blurb: "基金季报披露的持仓与共识。" },
  { to: "/chronicle/companies", title: "上市公司背景查询", blurb: "按代码或名称查一只证券的行业、估值与股息。" },
];

export function meta() {
  return pageMeta({
    title: "A股编年史",
    description: `把每天的资讯放回长周期里看：${GROUPS.map((g) => g.label).join("、")}三卷、${PAGES.length} 张历史图表，卷内叙事串联，逐图深度解读。`,
    path: ROUTES.home,
  });
}

export default function ChronicleHome() {
  return (
    <div className="pb-14">
      <PhoneBar title="A股编年史" />
      <header className="pt-4 lg:pt-0">
        <Kicker>知识库 · 编年史</Kicker>
        <h1 data-page-title="" className="mt-4 text-[30px] font-black leading-[1.2] tracking-[-0.02em] text-ink lg:text-[38px]">A股编年史</h1>
        <div className="mt-4 max-w-[42em] space-y-3">
          {SITE_PROLOGUE.map((text) => (
            <p key={text} className="text-[14.5px] leading-[1.9] text-ink-3">
              {text}
            </p>
          ))}
        </div>
        <PillTabs items={SCOPE_TABS} active="a-share" layoutId="chronicle-scope" size="sm" label="编年史范围" className="mt-6" />
        <p className="well mt-5 rounded-card px-4 py-3 text-[12.5px] leading-[1.75] text-ink-3">
          标「日线」的图表来自公开行情接口，每个交易日收盘后自动更新；缺失数据不展示曲线；随机示例仅在独立演示入口展示。只作历史复盘与学习用途，不构成任何投资建议。
          <Link viewTransition to={ROUTES.methodology} className="ml-1 text-accent hover:underline">
            数据口径与免责
          </Link>
        </p>
      </header>

      <section className="pt-10">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line pb-3">
          <span className="text-[12px] font-bold tracking-[0.18em] text-accent">目录</span>
          <h2 className="text-[19px] font-bold text-ink">三卷</h2>
          <span className="text-[12px] text-ink-4">I–III</span>
          <Link viewTransition to={ROUTES.charts} className="ml-auto text-[12.5px] text-accent hover:underline">
            按图查找：图表索引 →
          </Link>
        </div>
        <ul className="mt-4 grid gap-3 lg:grid-cols-3">
          {GROUPS.map((group) => {
            const count = group.sections.reduce((n, section) => n + section.slugs.length, 0);
            return (
              <li key={group.key}>
                <IntentLink viewTransition to={ROUTES.group(group.key)} className="card card-hover flex h-full flex-col gap-2 p-5">
                  <span className="num text-[12px] font-bold tracking-[0.18em] text-accent">{group.kicker} · {group.english}</span>
                  <span className="text-[19px] font-bold text-ink">{group.label}</span>
                  <span className="text-[13px] leading-[1.75] text-ink-3">{VOLUME_META[group.key].blurb}</span>
                  <span className="mt-auto pt-2 text-[12.5px] text-ink-4">{count} 张图表 · 一路读完 →</span>
                </IntentLink>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="pt-10">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line pb-3">
          <span className="text-[12px] font-bold tracking-[0.18em] text-accent">时间轴</span>
          <h2 className="text-[19px] font-bold text-ink">大事记</h2>
          <Link viewTransition to={ROUTES.timeline} className="ml-auto text-[12.5px] text-accent hover:underline">
            进入大事记 →
          </Link>
        </div>
        <p className="mt-3 max-w-[44em] text-[13.5px] leading-[1.85] text-ink-3">
          把三十余年的转折、制度变迁与代表个股按年代排成一条时间轴：从 1990 年的老八股，到股权分置改革、杠杆牛、核心资产，再到今天的 AI 算力。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TIMELINE.map((era) => (
            <Link
              key={era.key}
              viewTransition
              to={`${ROUTES.timeline}#era-${era.key}`}
              className="well rounded-full px-3 py-1 text-[12px] text-ink-3 transition-colors hover:text-accent"
            >
              {era.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="pt-10">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line pb-3">
          <span className="text-[12px] font-bold tracking-[0.18em] text-accent">工具</span>
          <h2 className="text-[19px] font-bold text-ink">数据工具</h2>
        </div>
        <p className="mt-3 max-w-[44em] text-[13.5px] leading-[1.85] text-ink-3">除历史图表外，还有几件按需查看的数据工具：对比指数区间、看行业轮动、查市场背景与公募持仓、查一只证券的背景。</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <li key={tool.to}>
              <Link viewTransition to={tool.to} className="card card-hover flex h-full flex-col gap-1 p-4">
                <span className="text-[15px] font-semibold text-ink">{tool.title}</span>
                <span className="text-[12.5px] leading-[1.65] text-ink-3">{tool.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-[12.5px] text-ink-4">
        <Link viewTransition to={ROUTES.methodology} className="transition-colors hover:text-accent">
          数据口径
        </Link>
        <Link viewTransition to={ROUTES.charts} className="transition-colors hover:text-accent">
          图表索引
        </Link>
        <Link viewTransition to={ROUTES.timeline} className="transition-colors hover:text-accent">
          大事记
        </Link>
        <Link viewTransition to={ROUTES.api} className="transition-colors hover:text-accent">
          数据接口
        </Link>
        <span>内容收录自开源项目 A股编年史（oliverran/the-history-of-a-stock）</span>
      </footer>
    </div>
  );
}
