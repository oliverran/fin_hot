// 编年史首页：三大章节（宽基 / 行业 / 抱团），每章列出要点进去的几张图。
import { IntentLink } from "@aihot/web/components/ui/IntentLink";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { PillTabs } from "@aihot/web/components/ui/Tabs";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { pageMeta } from "@aihot/web/lib/seo";
import { Link } from "react-router";
import { GROUPS, HOME_SECTIONS, PAGES, ROUTES, groupOf, pageOf } from "../../catalog.ts";
import { ChartCard } from "../card.tsx";

export const handle: Screen = { tab: "chronicle", name: "编年史" };

/** A股 / 美股两个编年史的切换；手机底栏只有一个「编年史」页签，切换放在页内。 */
const SCOPE_TABS = [
  { key: "a-share", label: "A股编年史", to: ROUTES.home },
  { key: "us", label: "美股编年史", to: ROUTES.usMarket },
];

/** 首页底部的数据工具入口，卡片式，与上面的章节一致。 */
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
    description: `把每天的资讯放回长周期里看：${GROUPS.map((g) => g.label).join("、")}三个章节、${PAGES.length} 张历史图表。`,
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
        <p className="mt-4 max-w-[38em] text-[14.5px] leading-[1.85] text-ink-3">
          把每天的资讯放回长周期里看：指数走了什么形状、行业怎么轮动、抱团怎么聚起又怎么散。
          {GROUPS.length} 个章节、{PAGES.length} 张图表，都可以点开对照历史。
        </p>
        <PillTabs items={SCOPE_TABS} active="a-share" layoutId="chronicle-scope" size="sm" label="编年史范围" className="mt-5" />
        <p className="well mt-5 rounded-card px-4 py-3 text-[12.5px] leading-[1.75] text-ink-3">
          标「日线」的图表来自公开行情接口，每个交易日收盘后自动更新；缺失数据不展示曲线；随机示例仅在独立演示入口展示。只作历史复盘与学习用途，不构成任何投资建议。
          <Link viewTransition to={ROUTES.methodology} className="ml-1 text-accent hover:underline">
            数据口径与免责
          </Link>
        </p>
      </header>

      {HOME_SECTIONS.map((section) => {
        const group = groupOf(section.group);
        if (!group) return null;
        const total = group.sections.reduce((n, s) => n + s.slugs.length, 0);
        return (
          <section key={section.group} className="pt-10">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line pb-3">
              <span className="num text-[12px] font-bold tracking-[0.18em] text-accent">{group.kicker}</span>
              <h2 className="text-[19px] font-bold text-ink">{group.label}</h2>
              <span className="text-[12px] text-ink-4">{group.english}</span>
            </div>
            <p className="mt-3 max-w-[44em] text-[13.5px] leading-[1.85] text-ink-3">{section.lead}</p>
            <ul className="mt-2 divide-y divide-line-soft lg:mt-4 lg:grid lg:grid-cols-2 lg:gap-3 lg:divide-y-0 xl:grid-cols-4">
              {section.slugs.map((slug) => {
                const page = pageOf(section.group, slug);
                return page ? (
                  <li key={slug}>
                    <ChartCard page={page} />
                  </li>
                ) : null;
              })}
            </ul>
            <p className="mt-3">
              <IntentLink viewTransition to={ROUTES.group(section.group)} className="text-[13px] text-accent hover:underline">
                看{group.label}的全部 {total} 张图表 →
              </IntentLink>
            </p>
          </section>
        );
      })}

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
        <Link viewTransition to={ROUTES.api} className="transition-colors hover:text-accent">
          数据接口
        </Link>
        <span>内容收录自开源项目 A股编年史（oliverran/the-history-of-a-stock）</span>
      </footer>
    </div>
  );
}
