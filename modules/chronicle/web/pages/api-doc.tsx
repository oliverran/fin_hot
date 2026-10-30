// 数据接口：编年史图表 JSON 的地址、形状与取值。这些文件由模块的后端插口从 /api/chronicle 发出。
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { pageMeta } from "@aihot/web/lib/seo";
import { Link } from "react-router";
import { GROUPS, PAGES, ROUTES, dataUrl, pageOf } from "../../catalog.ts";

export const handle: Screen = { tab: "chronicle", name: "数据接口" };

export function meta() {
  return pageMeta({
    title: "数据接口",
    description: `编年史图表的公开 JSON 接口：三组、${PAGES.length} 张图，指数行情图每日收盘后更新，精选页的实时行情另有一个地址，都可直接取用。`,
    path: ROUTES.api,
  });
}

const ENDPOINTS: Array<[string, string]> = [
  ["GET /api/chronicle/_manifest.json", "行情最后写入的时间、三组地址与实时图表清单。"],
  ["GET /api/chronicle/live?code=&kind=", "精选页那张实时图的数据；code 是 sh000001 或 sz399006，kind 是 minute（分时）或 day（日K）。"],
  ["GET /api/chronicle/{group}/{slug}.json", "一张图的全部数据；group 是 broad、sectors 或 clusters。"],
];

const TYPES: Array<[string, string]> = [
  ["line · drawdown · valuation", "折线、回撤、估值带"],
  ["bar · distribution-bar", "柱状、分布柱状"],
  ["multi-line · stacked-area", "多线、堆叠面积"],
  ["heatmap · range-bar", "热力图、区间柱"],
  ["stacked-bar-dual", "EPS 与 PE 拆解的堆叠柱"],
];

export default function ChronicleApiDoc() {
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-14">
      <PhoneBar back={{ to: ROUTES.home, label: "编年史" }} title="数据接口" />
      <Link viewTransition to={ROUTES.home} className="hidden py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex">
        ← 编年史
      </Link>
      <header className="pt-4 lg:pt-0">
        <Kicker>编年史 · 数据接口</Kicker>
        <h1 data-page-title="" className="mt-4 text-[28px] font-black leading-[1.22] tracking-[-0.02em] text-ink lg:text-[36px]">
          数据接口
        </h1>
        <p className="mt-4 text-[14.5px] leading-[1.85] text-ink-3">
          编年史的 {PAGES.length} 张图表都是 JSON，页面里画的就是它们。其中六只宽基指数的走势与由它们现算的派生图接的是公开行情接口，每个交易日收盘后更新；其余尚未接入真实数据，示例通过独立演示入口查看。地址很规整，想自己做图、做笔记或者喂给别的工具，直接取用即可。
        </p>
      </header>

      <section className="pt-9">
        <h2 className="text-[17px] font-bold text-ink">三个地址</h2>
        <ul className="mt-3 divide-y divide-line-soft overflow-hidden rounded-card border border-line bg-surface">
          {ENDPOINTS.map(([path, does]) => (
            <li key={path} className="px-4 py-3">
              <div className="mono break-all text-[12.5px] text-ink">{path}</div>
              <p className="mt-1 text-[12.5px] leading-[1.7] text-ink-4">{does}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] leading-[1.75] text-ink-4">
          示例图是随包的静态文件，缓存一天；行情图由后端从库里现算，缓存一刻钟；实时行情由后端从公开接口现抓，缓存 15 秒，开盘时段刷新。三者都不触发任何模型调用，也不需要密钥。
        </p>
      </section>

      <section className="pt-9">
        <h2 className="text-[17px] font-bold text-ink">返回的形状</h2>
        <pre className="mt-3 overflow-x-auto rounded-card border border-line bg-surface px-4 py-3 text-[12px] leading-[1.7] text-ink-2">
          <code>{`{
  "meta": { "id": "shanghai-composite", "name": "上证综指", "type": "line", "description": "…" },
  "series": [
    { "date": "1990-12-19", "value": 991.48 }
  ]
}`}</code>
        </pre>
        <p className="mt-3 text-[12.5px] leading-[1.75] text-ink-4">
          <span className="text-ink-3">meta.type</span> 决定 series 的形状，也就决定图表怎么画：
        </p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {TYPES.map(([names, cn]) => (
            <div key={names} className="well rounded-tile px-3.5 py-2.5">
              <dt className="mono text-[12px] text-ink-2">{names}</dt>
              <dd className="mt-0.5 text-[12.5px] text-ink-4">{cn}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="pt-9">
        <h2 className="text-[17px] font-bold text-ink">全部图表</h2>
        <p className="mt-2 text-[12.5px] leading-[1.75] text-ink-4">按三个章节列出，每行就是一份 JSON。</p>
        {GROUPS.map((group) => (
          <div key={group.key} className="pt-5">
            <h3 className="text-[14px] font-bold text-ink-2">
              <span className="num mr-2 text-[12px] text-accent">{group.kicker}</span>
              {group.label}
            </h3>
            <ul className="mt-2 divide-y divide-line-soft overflow-hidden rounded-card border border-line bg-surface">
              {group.sections.flatMap((section) =>
                section.slugs.flatMap((slug) => {
                  const page = pageOf(group.key, slug);
                  return page
                    ? [
                        <li key={slug} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5">
                          <span className="mono break-all text-[12px] text-ink-3">{dataUrl(group.key, slug)}</span>
                          <span className="text-[12.5px] text-ink-4">{page.cardTitle}</span>
                        </li>,
                      ]
                    : [];
                }),
              )}
            </ul>
          </div>
        ))}
      </section>

      <footer className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-[12.5px] text-ink-4">
        <Link viewTransition to={ROUTES.methodology} className="transition-colors hover:text-accent">
          数据口径
        </Link>
        <span>指数走势与派生图来自公开行情接口，精选页的实时行情同理（有延迟），其余为示例（随机生成），均不构成任何投资建议。</span>
      </footer>
    </div>
  );
}
