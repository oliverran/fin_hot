// 图表详情页：图表的文案与补充章节来自目录（不必等数据），图由浏览器侧取数后画。
import { IntentLink } from "@aihot/web/components/ui/IntentLink";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { IconChevronLeft, IconChevronRight } from "@aihot/web/components/icons";
import { pageMeta, titled } from "@aihot/web/lib/seo";
import { Link, useParams } from "react-router";
import { ROUTES, dataSourceOf, dataUrl, groupOf, pageOf, type ChartPage } from "../../catalog.ts";
import { ChronicleChart } from "../chart.tsx";

export const handle: Screen = { tab: "chronicle", name: "编年史" };

export function loader({ params }: { params: { group: string; slug: string } }) {
  if (!pageOf(params.group, params.slug)) throw new Response("Not found", { status: 404 });
  return null;
}

export function meta({ params }: { params: { group: string; slug: string } }) {
  const page = pageOf(params.group, params.slug);
  if (!page) return [{ title: titled("找不到这张图") }, { name: "robots", content: "noindex" }];
  return pageMeta({ title: page.heroTitle, description: page.chartNote || page.heroLead, path: ROUTES.page(page.group, page.slug) });
}

/** 同一组里的上一张 / 下一张，按目录里的顺序。 */
function siblings(page: ChartPage): { before?: ChartPage; after?: ChartPage } {
  const group = groupOf(page.group);
  const order = (group?.sections ?? []).flatMap((s) => s.slugs).flatMap((slug) => {
    const at = pageOf(page.group, slug);
    return at ? [at] : [];
  });
  const i = order.findIndex((p) => p.slug === page.slug);
  return { before: i > 0 ? order[i - 1] : undefined, after: i >= 0 ? order[i + 1] : undefined };
}

export default function ChronicleChartPage() {
  const { group: key, slug } = useParams();
  const page = pageOf(key ?? "", slug ?? "");
  if (!page) return null;
  const group = groupOf(page.group);
  const { before, after } = siblings(page);
  return (
    <div className="pb-14">
      <PhoneBar back={{ to: ROUTES.group(page.group), label: group?.label ?? "编年史" }} title={page.heroTitle} />
      <Link
        viewTransition
        to={ROUTES.group(page.group)}
        className="hidden items-center gap-1.5 py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex"
      >
        <IconChevronLeft size={14} /> {group?.label ?? "编年史"}
      </Link>

      <header className="pt-4 lg:pt-0">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-accent">{page.chartTitle}</p>
        <h1 data-page-title="" className="mt-2 text-[28px] font-black leading-[1.22] tracking-[-0.02em] text-ink lg:text-[36px]">
          {page.heroTitle}
        </h1>
        <p className="mt-4 max-w-[46em] text-[14.5px] leading-[1.85] text-ink-3">{page.heroLead}</p>
      </header>

      <section aria-labelledby="chart" className="mt-7 card px-4 py-5 sm:px-6">
        <h2 id="chart" className="text-[16px] font-bold text-ink">
          {page.chartTitle}
        </h2>
        {page.chartNote && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-4">{page.chartNote}</p>}
        <ChronicleChart src={dataUrl(page.group, page.slug)} name={page.chartTitle} className="mt-4" />
      </section>

      {page.sections?.map((section) => (
        <section key={section.n} className="pt-9">
          <div className="flex items-baseline gap-3 border-b border-line pb-3">
            <span className="num text-[12px] font-bold tracking-[0.18em] text-accent">{section.n}</span>
            <h2 className="text-[17px] font-bold text-ink">{section.title}</h2>
          </div>
          {section.paragraphs?.map((text) => (
            <p key={text} className="mt-3 max-w-[46em] text-[14px] leading-[1.9] text-ink-2">
              {text}
            </p>
          ))}
          {section.items && (
            <ul className="mt-4 space-y-2.5">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2.5 text-[14px] leading-[1.8] text-ink-2">
                  <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="mt-10 border-t border-line pt-5 text-[12.5px] leading-[1.75] text-ink-4">
        数据来源：{dataSourceOf(page.group, page.slug)}，只作历史复盘与学习用途，不构成任何投资建议。
        <Link viewTransition to={ROUTES.methodology} className="ml-1 text-accent hover:underline">
          数据口径与免责
        </Link>
      </p>

      <nav aria-label="同章节的图表" className="mt-8 grid gap-3 sm:grid-cols-2">
        {before && <ChartStep page={before} toward="before" />}
        {after && <ChartStep page={after} toward="after" />}
      </nav>
    </div>
  );
}

function ChartStep({ page, toward }: { page: ChartPage; toward: "before" | "after" }) {
  const next = toward === "after";
  return (
    <IntentLink
      viewTransition
      to={ROUTES.page(page.group, page.slug)}
      className={`group card card-hover flex items-center gap-3 p-4 ${next ? "sm:col-start-2 sm:text-right" : ""}`}
    >
      {!next && <IconChevronLeft size={16} className="shrink-0 text-ink-4" />}
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] text-ink-4">{next ? "下一张" : "上一张"}</span>
        <span className="mt-0.5 block truncate text-[14px] font-semibold text-ink transition-colors group-hover:text-accent">{page.cardTitle}</span>
      </span>
      {next && <IconChevronRight size={16} className="shrink-0 text-ink-4" />}
    </IntentLink>
  );
}
