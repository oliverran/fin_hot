// 编年史首页：三大章节（宽基 / 行业 / 抱团），每章列出要点进去的几张图。
import { IntentLink } from "@aihot/web/components/ui/IntentLink";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { pageMeta } from "@aihot/web/lib/seo";
import { Link } from "react-router";
import { GROUPS, HOME_SECTIONS, PAGES, ROUTES, groupOf, pageOf } from "../../catalog.ts";
import { ChartCard } from "../card.tsx";

export const handle: Screen = { tab: "chronicle", name: "编年史" };

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
        <p className="well mt-5 rounded-card px-4 py-3 text-[12.5px] leading-[1.75] text-ink-3">
          标「日线」的图表来自公开行情接口，每个交易日收盘后自动更新；缺失数据不展示曲线；随机示例仅在独立演示入口展示。只作历史复盘与学习用途，不构成任何投资建议。
          <Link viewTransition to={ROUTES.methodology} className="ml-1 text-accent hover:underline">
            数据口径与免责
          </Link>
        </p>
      </header>

      <Link viewTransition to={ROUTES.usMarket} className="mt-6 block rounded-card border border-line bg-surface px-4 py-3 text-[14px] text-ink transition-colors hover:border-accent/40">
        <span className="font-semibold text-accent">美股编年史 →</span>
        <span className="mt-1 block text-[13px] leading-[1.7] text-ink-3">标普 500、纳斯达克、道琼斯与半导体、科技、金融、消费板块及七姐妹的百年走势、估值与回撤。</span>
      </Link>

      <Link to="/chronicle/compare" className="mt-6 block text-accent">多指数对比与区间复盘 →</Link>
      <Link to="/chronicle/sectors-live" className="mt-4 block text-accent">真实行业数据、估值与轮动 →</Link>
      <Link to="/chronicle/market" className="mt-4 block text-accent">市场背景、ETF 与两融 →</Link>
      <Link to="/chronicle/funds" className="mt-4 block text-accent">公募披露持仓与共识 →</Link>
      <Link to="/chronicle/companies" className="mt-4 block text-accent">上市公司背景查询 →</Link>
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
