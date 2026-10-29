// 主题页上的「相关知识」：讲这个主题时，配哪几张编年史图表（对应表在 topic-map.ts）。
import { IconChart, IconChevronRight } from "@aihot/web/components/icons";
import { IntentLink } from "@aihot/web/components/ui/IntentLink";
import type { TopicPagePart } from "@aihot/web/modules";
import { ROUTES } from "../catalog.ts";
import type { TopicChroniclePart } from "../topic-map.ts";

const NONE: TopicChroniclePart = { blurb: "", pages: [] };

/** 服务端给的是这一块本身；形状不对（没有配图）时按“没有”处理。 */
function read(data: unknown): TopicChroniclePart {
  const part = data as TopicChroniclePart | null | undefined;
  return part && Array.isArray(part.pages) ? part : NONE;
}

function ChronicleBlock({ part }: { part: TopicChroniclePart }) {
  return (
    <section aria-labelledby="topic-chronicle" className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
        <span className="text-accent">
          <IconChart size={16} />
        </span>
        <h2 id="topic-chronicle" className="text-[13.5px] font-bold text-ink">
          相关知识 · 编年史
        </h2>
        <IntentLink viewTransition to={ROUTES.home} className="ml-auto text-[12px] text-accent hover:underline">
          全部图表
        </IntentLink>
      </div>
      <p className="px-4 pt-3 text-[13px] leading-[1.75] text-ink-3">{part.blurb}</p>
      <ul className="mt-3 divide-y divide-line-soft">
        {part.pages.map((page) => (
          <li key={page.href}>
            <IntentLink viewTransition to={page.href} className="group flex items-center gap-3 px-4 py-3 transition-colors active:bg-bg-sunk">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold leading-snug text-ink transition-colors group-hover:text-accent">{page.title}</span>
                <span className="mt-0.5 block text-[12.5px] leading-[1.65] text-ink-4">{page.blurb}</span>
              </span>
              <IconChevronRight size={15} className="shrink-0 text-ink-4" />
            </IntentLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

const part: TopicPagePart = {
  name: "编年史",
  shows: (data) => read(data).pages.length > 0,
  Block: ({ data }) => <ChronicleBlock part={read(data)} />,
  entries: (data) => read(data).pages.map((page) => ({ title: page.title, href: page.href })),
  // 这几张图是常设的，不是“最近的进展”，所以不进搜索摘要。
  news: () => [],
};

export default part;
