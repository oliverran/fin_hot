// 分组页：宽基 / 行业 / 抱团，按原站的分节列出这一组的全部图表。
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { pageMeta, titled } from "@aihot/web/lib/seo";
import { Link, useParams } from "react-router";
import { ROUTES, groupOf, pageOf } from "../../catalog.ts";
import { ChartCard } from "../card.tsx";

export const handle: Screen = { tab: "chronicle", name: "编年史" };

export function loader({ params }: { params: { group: string } }) {
  if (!groupOf(params.group)) throw new Response("Not found", { status: 404 });
  return null;
}

export function meta({ params }: { params: { group: string } }) {
  const group = groupOf(params.group);
  if (!group) return [{ title: titled("找不到这个章节") }, { name: "robots", content: "noindex" }];
  return pageMeta({ title: group.listTitle, description: group.listDescription, path: ROUTES.group(group.key) });
}

export default function ChronicleGroup() {
  const { group: key } = useParams();
  const group = groupOf(key ?? "");
  if (!group) return null;
  return (
    <div className="pb-14">
      <PhoneBar back={{ to: ROUTES.home, label: "编年史" }} title={group.label} />
      <Link viewTransition to={ROUTES.home} className="hidden py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex">
        ← 编年史
      </Link>
      <header className="pt-4 lg:pt-0">
        <p className="num text-[12px] font-bold tracking-[0.18em] text-accent">
          {group.kicker} · {group.english}
        </p>
        <h1 data-page-title="" className="mt-3 text-[28px] font-black leading-[1.22] tracking-[-0.02em] text-ink lg:text-[36px]">
          {group.heroTitle}
        </h1>
        <p className="mt-4 max-w-[44em] text-[14.5px] leading-[1.85] text-ink-3">{group.heroLead}</p>
      </header>

      {group.sections.map((section) => (
        <section key={section.n} className="pt-9">
          <div className="flex items-baseline gap-3 border-b border-line pb-3">
            <span className="num text-[12px] font-bold tracking-[0.18em] text-accent">{section.n}</span>
            <h2 className="text-[17px] font-bold text-ink">{section.title}</h2>
          </div>
          <ul className="mt-2 divide-y divide-line-soft lg:mt-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:divide-y-0 xl:grid-cols-4">
            {section.slugs.map((slug) => {
              const page = pageOf(group.key, slug);
              return page ? (
                <li key={slug}>
                  <ChartCard page={page} />
                </li>
              ) : null;
            })}
          </ul>
        </section>
      ))}

      <p className="mt-10 border-t border-line pt-5 text-[12.5px] leading-[1.75] text-ink-4">
        标「日线」的图表来自公开行情接口，每个交易日收盘后自动更新；缺失数据不展示曲线；随机示例仅在独立演示入口展示。只作历史复盘与学习用途，不构成任何投资建议。
        <Link viewTransition to={ROUTES.methodology} className="ml-1 text-accent hover:underline">
          数据口径与免责
        </Link>
      </p>
    </div>
  );
}
