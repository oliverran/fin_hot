// 卷页：一卷读到底。卷首叙事领起，章节导读串场，图与深度解读按叙事顺序内联排开，
// 顶部给一份卷内目录做锚点跳转。想深究某一张，再从它的 panel 点进详情页。
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { pageMeta, titled } from "@aihot/web/lib/seo";
import { Link, useParams } from "react-router";
import { GROUPS, ROUTES, groupOf, pageOf } from "../../catalog.ts";
import { VOLUME_META, chapterLead } from "../narrative.ts";
import { ChartPanel } from "../panel.tsx";

export const handle: Screen = { tab: "chronicle", name: "编年史" };

export function loader({ params }: { params: { group: string } }) {
  if (!groupOf(params.group)) throw new Response("Not found", { status: 404 });
  return null;
}

export function meta({ params }: { params: { group: string } }) {
  const group = groupOf(params.group);
  if (!group) return [{ title: titled("找不到这一卷") }, { name: "robots", content: "noindex" }];
  return pageMeta({ title: group.listTitle, description: group.listDescription, path: ROUTES.group(group.key) });
}

/** 按目录顺序取下一卷，读到卷尾时给一条继续读的入口。 */
function nextVolume(key: string) {
  const i = GROUPS.findIndex((group) => group.key === key);
  return i >= 0 && i < GROUPS.length - 1 ? GROUPS[i + 1] : undefined;
}

export default function ChronicleVolume() {
  const { group: key } = useParams();
  const group = groupOf(key ?? "");
  if (!group) return null;
  const meta = VOLUME_META[group.key];
  const next = nextVolume(group.key);
  return (
    <div className="pb-14">
      <PhoneBar back={{ to: ROUTES.home, label: "A股编年史" }} title={group.label} />
      <Link viewTransition to={ROUTES.home} className="hidden py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex">
        ← A股编年史
      </Link>

      <header className="pt-4 lg:pt-0">
        <p className="num text-[12px] font-bold tracking-[0.18em] text-accent">
          {group.kicker} · {group.english}
        </p>
        <h1 data-page-title="" className="mt-3 text-[28px] font-black leading-[1.22] tracking-[-0.02em] text-ink lg:text-[36px]">
          {group.heroTitle}
        </h1>
        <p className="mt-4 max-w-[44em] text-[14.5px] leading-[1.85] text-ink-3">{group.heroLead}</p>
        {meta?.prologue.map((text) => (
          <p key={text} className="mt-3 max-w-[44em] text-[14px] leading-[1.9] text-ink-2">
            {text}
          </p>
        ))}
      </header>

      <nav aria-label="卷内目录" className="mt-7 well rounded-card px-4 py-3">
        {group.sections.map((section) => (
          <div key={section.n} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1.5">
            <span className="num text-[12px] font-bold text-accent">{section.n}</span>
            <span className="text-[13px] font-semibold text-ink">{section.title}</span>
            <span className="text-ink-4">·</span>
            {section.slugs.map((slug) => {
              const page = pageOf(group.key, slug);
              return page ? (
                <a
                  key={slug}
                  href={`#panel-${slug}`}
                  className="text-[12.5px] text-ink-3 transition-colors hover:text-accent"
                >
                  {page.cardTitle}
                </a>
              ) : null;
            })}
          </div>
        ))}
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-line-soft pt-2.5">
          <Link viewTransition to={ROUTES.charts} className="text-[12.5px] text-accent hover:underline">
            想直接找某一张？去图表索引搜索全部图表 →
          </Link>
          <Link viewTransition to={ROUTES.timeline} className="text-[12.5px] text-ink-3 transition-colors hover:text-accent">
            对照：A股大事记 →
          </Link>
        </div>
      </nav>

      {group.sections.map((section) => (
        <section key={section.n} className="pt-12">
          <div className="flex items-baseline gap-3 border-b border-line pb-3">
            <span className="num text-[12px] font-bold tracking-[0.18em] text-accent">{section.n}</span>
            <h2 className="text-[19px] font-bold text-ink">{section.title}</h2>
          </div>
          {chapterLead(group.key, section.n) && (
            <p className="mt-3 max-w-[46em] text-[13.5px] leading-[1.85] text-ink-3">{chapterLead(group.key, section.n)}</p>
          )}
          {section.slugs.map((slug) => {
            const page = pageOf(group.key, slug);
            return page ? <ChartPanel key={slug} page={page} anchor={`panel-${slug}`} /> : null;
          })}
        </section>
      ))}

      <nav aria-label="其他卷" className="mt-12 grid gap-3 sm:grid-cols-2">
        <Link viewTransition to={ROUTES.home} className="card card-hover flex flex-col gap-1 p-4">
          <span className="text-[11.5px] text-ink-4">返回</span>
          <span className="text-[14.5px] font-semibold text-ink">A股编年史 · 序章</span>
        </Link>
        {next && (
          <Link viewTransition to={ROUTES.group(next.key)} className="card card-hover flex flex-col gap-1 p-4 sm:text-right">
            <span className="text-[11.5px] text-ink-4">下一卷</span>
            <span className="text-[14.5px] font-semibold text-ink">
              {next.kicker} · {next.label}
            </span>
          </Link>
        )}
      </nav>

      <p className="mt-10 border-t border-line pt-5 text-[12.5px] leading-[1.75] text-ink-4">
        标「日线」的图表来自公开行情接口，每个交易日收盘后自动更新；缺失数据不展示曲线；随机示例仅在独立演示入口展示。只作历史复盘与学习用途，不构成任何投资建议。
        <Link viewTransition to={ROUTES.methodology} className="ml-1 text-accent hover:underline">
          数据口径与免责
        </Link>
      </p>
    </div>
  );
}
