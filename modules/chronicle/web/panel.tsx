// 一个 panel：一张图 + 关键数字 + 深度分析。卷页里按叙事顺序内联排开，详情页里单独成篇。
// 图仍然由浏览器侧取数后画（见 chart.tsx），这里只负责排版与文案。
import { IntentLink } from "@aihot/web/components/ui/IntentLink";
import { IconChevronRight } from "@aihot/web/components/icons";
import { Link } from "react-router";
import { ROUTES, dataUrl, liveChart, type ChartPage } from "../catalog.ts";
import { panelOf } from "./narrative.ts";
import { ChronicleChart } from "./chart.tsx";

/** 一排关键数字；没有配就不占位置。 */
function StatStrip({ stats }: { stats: ReadonlyArray<{ label: string; value: string }> }) {
  if (!stats.length) return null;
  return (
    <dl className="mt-4 grid gap-2 sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="well rounded-tile px-3.5 py-2.5">
          <dt className="text-[11.5px] tracking-[0.04em] text-ink-4">{stat.label}</dt>
          <dd className="mt-0.5 text-[13.5px] font-semibold leading-snug text-ink">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * 图的正文：图表 + 关键数字 + 深度分析。卷页与详情页共用，标题与导语由调用方各自处理。
 */
export function ChartBody({ page }: { page: ChartPage }) {
  const extra = panelOf(page.group, page.slug);
  return (
    <>
      <figure className="mt-4 card px-4 py-5 sm:px-6">
        <figcaption className="text-[15px] font-bold text-ink">{page.chartTitle}</figcaption>
        {page.chartNote && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-4">{page.chartNote}</p>}
        <ChronicleChart src={dataUrl(page.group, page.slug)} name={page.chartTitle} className="mt-4" />
      </figure>

      <StatStrip stats={extra.stats ?? []} />

      {extra.analysis?.map((text) => (
        <p key={text} className="mt-4 max-w-[46em] text-[14px] leading-[1.9] text-ink-2">
          {text}
        </p>
      ))}
    </>
  );
}

/**
 * 一张图连同它的解读。`anchor` 为图上锚点（卷内目录跳转用）；卷页里用完整版（带「单独打开」链接），
 * 详情页用 ChartBody 即可。
 */
export function ChartPanel({ page, anchor }: { page: ChartPage; anchor?: string }) {
  return (
    <article id={anchor} className="scroll-mt-24 pt-8">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[17px] font-bold leading-snug text-ink">{page.heroTitle}</h3>
        {liveChart(page.group, page.slug) && (
          <span className="shrink-0 rounded-full border border-line px-1.5 py-px text-[10.5px] leading-[1.5] text-accent">日线</span>
        )}
      </div>
      <p className="mt-2 max-w-[46em] text-[14px] leading-[1.85] text-ink-3">{page.heroLead}</p>

      <ChartBody page={page} />

      <p className="mt-4">
        <IntentLink viewTransition to={ROUTES.page(page.group, page.slug)} className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline">
          单独打开这张图 <IconChevronRight size={14} />
        </IntentLink>
      </p>
    </article>
  );
}

/** 「相关图表」：跨卷的交叉引用，把同一条叙事链上的图连起来。 */
export function RelatedCharts({ pages, className = "" }: { pages: ChartPage[]; className?: string }) {
  if (!pages.length) return null;
  return (
    <section aria-label="相关图表" className={className}>
      <div className="flex items-baseline gap-3 border-b border-line pb-3">
        <span className="text-[12px] font-bold tracking-[0.18em] text-accent">相关</span>
        <h2 className="text-[17px] font-bold text-ink">相关图表</h2>
      </div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pages.map((page) => (
          <li key={`${page.group}/${page.slug}`}>
            <Link viewTransition to={ROUTES.page(page.group, page.slug)} className="card card-hover flex h-full flex-col gap-1 p-4">
              <span className="text-[14.5px] font-semibold text-ink">{page.cardTitle}</span>
              <span className="text-[12.5px] leading-[1.65] text-ink-3">{page.cardBlurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
