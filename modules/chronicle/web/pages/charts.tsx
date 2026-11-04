// 图表索引：把三卷里的全部图表汇到一处。按卷筛选、按关键词搜索、按数据来源过滤，
// 直接跳到想看的那一张。卷页适合「一路读」，这一页适合「找某一张」。
import { useMemo, useState } from "react";
import { IntentLink } from "@aihot/web/components/ui/IntentLink";
import { IconChevronRight, IconClose, IconSearch } from "@aihot/web/components/icons";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { PillTabs } from "@aihot/web/components/ui/Tabs";
import { pageMeta } from "@aihot/web/lib/seo";
import { Link } from "react-router";
import { GROUPS, PAGES, ROUTES, liveChart, type ChartPage, type GroupKey } from "../../catalog.ts";

export const handle: Screen = { tab: "chronicle", name: "图表索引" };

export function meta() {
  return pageMeta({
    title: "图表索引",
    description: `A股编年史全部 ${PAGES.length} 张图表：按卷浏览、关键词搜索，直接跳到想看的那一张。`,
    path: ROUTES.charts,
  });
}

const GROUP_LABEL = new Map(GROUPS.map((group) => [group.key, group.label]));

/** 每张图连同它的卷、来源与用于搜索的合并文本，启动时算一次。 */
interface Entry {
  page: ChartPage;
  group: GroupKey;
  label: string;
  live: boolean;
  text: string;
}

const ENTRIES: Entry[] = PAGES.map((page) => ({
  page,
  group: page.group,
  label: GROUP_LABEL.get(page.group) ?? page.group,
  live: !!liveChart(page.group, page.slug),
  text: [page.cardTitle, page.cardBlurb, page.heroTitle, page.heroLead, page.chartTitle, page.chartNote, GROUP_LABEL.get(page.group)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase(),
}));

type Scope = "all" | GroupKey;
type Source = "all" | "live" | "demo";

const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: "all", label: "全部" },
  ...GROUPS.map((group) => ({ key: group.key as Scope, label: group.label })),
];

const SOURCES: Array<{ key: Source; label: string }> = [
  { key: "all", label: "全部来源" },
  { key: "live", label: "实时日线" },
  { key: "demo", label: "示例数据" },
];

function matches(entry: Entry, terms: string[]): boolean {
  return terms.every((term) => entry.text.includes(term));
}

export default function ChronicleCharts() {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [source, setSource] = useState<Source>("all");

  const terms = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);

  const counts = useMemo(
    () => SCOPES.map((item) => (item.key === "all" ? ENTRIES.length : ENTRIES.filter((entry) => entry.group === item.key).length)),
    [],
  );

  const results = useMemo(() => ENTRIES.filter((entry) => {
    if (scope !== "all" && entry.group !== scope) return false;
    if (source === "live" && !entry.live) return false;
    if (source === "demo" && entry.live) return false;
    return matches(entry, terms);
  }), [scope, source, terms]);

  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-14">
      <PhoneBar back={{ to: ROUTES.home, label: "A股编年史" }} title="图表索引" />
      <Link viewTransition to={ROUTES.home} className="hidden py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex">
        ← A股编年史
      </Link>
      <header className="pt-4 lg:pt-0">
        <Kicker>编年史 · 图表索引</Kicker>
        <h1 data-page-title="" className="mt-4 text-[28px] font-black leading-[1.22] tracking-[-0.02em] text-ink lg:text-[36px]">
          图表索引
        </h1>
        <p className="mt-4 text-[14.5px] leading-[1.85] text-ink-3">
          三卷里一共 {PAGES.length} 张图表。卷页是按叙事顺序一路读，这一页是反过来用的——想找某一张，按卷筛选或直接搜标题与关键词，点开就是它的完整解读。
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <div className="group relative w-full sm:w-72">
          <IconSearch size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-4 transition-colors group-focus-within:text-ink-3" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索图表标题、关键词…"
            maxLength={60}
            autoComplete="off"
            aria-label="搜索图表"
            className="h-[42px] w-full rounded-full bg-well pl-10 pr-10 text-[14px] text-ink outline-none ring-1 ring-inset ring-line-soft transition-[background-color,box-shadow] placeholder:text-ink-4 hover:ring-line-strong focus:bg-surface focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:ring-accent"
          />
          {query && (
            <button type="button" aria-label="清空" onClick={() => setQuery("")} className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-ink-4 transition-colors hover:bg-bg-sunk hover:text-ink">
              <IconClose size={13} />
            </button>
          )}
        </div>
        <PillTabs
          items={SCOPES.map((item, i) => ({ ...item, count: counts[i] }))}
          active={scope}
          onSelect={(key) => setScope(key as Scope)}
          layoutId="charts-scope"
          size="sm"
          label="按卷筛选"
        />
        <PillTabs
          items={SOURCES.map((item) => ({ ...item, count: item.key === "all" ? null : ENTRIES.filter((entry) => (item.key === "live" ? entry.live : !entry.live)).length }))}
          active={source}
          onSelect={(key) => setSource(key as Source)}
          layoutId="charts-source"
          size="sm"
          label="按数据来源筛选"
        />
      </div>

      <p aria-live="polite" className="mt-4 text-[12.5px] text-ink-4">
        {results.length === ENTRIES.length ? `共 ${ENTRIES.length} 张` : `找到 ${results.length} 张`}
      </p>

      {results.length === 0 ? (
        <p className="well mt-3 rounded-card px-5 py-10 text-center text-[13.5px] leading-relaxed text-ink-3">
          没有匹配的图表。换个关键词，或把筛选清空再试。
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {results.map(({ page, label, live }) => (
            <li key={`${page.group}/${page.slug}`}>
              <IntentLink viewTransition to={ROUTES.page(page.group, page.slug)} className="card card-hover flex h-full flex-col gap-2 p-4">
                <span className="flex items-center gap-2">
                  <span className="text-[11.5px] font-semibold tracking-[0.06em] text-accent">{label}</span>
                  {live && <span className="rounded-full border border-line px-1.5 py-px text-[10.5px] leading-[1.5] text-accent">日线</span>}
                </span>
                <span className="text-[15.5px] font-semibold leading-snug text-ink">{page.cardTitle}</span>
                <span className="text-[12.5px] leading-[1.65] text-ink-3">{page.cardBlurb}</span>
                <span className="mt-auto flex items-center gap-1 pt-1.5 text-[12.5px] text-ink-4">
                  打开这张图
                  <IconChevronRight size={13} />
                </span>
              </IntentLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
