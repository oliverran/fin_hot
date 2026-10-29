// 一张图表的卡片：首页与分组页共用。手机上是一行，宽屏上是一张卡。
import { IntentLink } from "@aihot/web/components/ui/IntentLink";
import { IconChart } from "@aihot/web/components/icons";
import { ROUTES, liveChart, type ChartPage } from "../catalog.ts";

export function ChartCard({ page }: { page: ChartPage }) {
  return (
    <IntentLink
      viewTransition
      to={ROUTES.page(page.group, page.slug)}
      className="group flex gap-3 py-3.5 transition-colors active:bg-bg-sunk lg:card lg:card-hover lg:h-full lg:flex-col lg:gap-0 lg:p-4 lg:active:bg-surface"
    >
      <span className="mt-0.5 shrink-0 text-ink-4 transition-colors group-hover:text-accent lg:mb-3 lg:mt-0">
        <IconChart size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 text-[15px] font-semibold leading-snug text-ink transition-colors group-hover:text-accent">{page.cardTitle}</span>
          {liveChart(page.group, page.slug) && (
            <span className="shrink-0 rounded-full border border-line px-1.5 py-px text-[10.5px] leading-[1.5] text-accent">实时</span>
          )}
        </span>
        <span className="mt-1 block text-[12.5px] leading-[1.65] text-ink-4 lg:line-clamp-3 lg:text-ink-3">{page.cardBlurb}</span>
      </span>
    </IntentLink>
  );
}
