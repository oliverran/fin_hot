// 后台「投资机会」页：查看最近几个交易日的生成结果，并可手动重跑当天。
// 数据来自 /api/admin/opportunities 与 /api/admin/opportunities/run（server.ts 的 adminHandler 守卫），
// 页面自身不落任何数据；重跑会重新调用模型并换掉当天已有的结果。
// 模块的后台页没有 +types 产物，props 自己声明。
import type { AdminOpportunities, AdminOpportunityCard } from "@aihot/contracts/admin";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { num } from "@aihot/web/features/admin/format";
import { AdminPage, Badge, Button, Card, Empty, FilterChips, Stat, Time } from "@aihot/web/features/admin/ui";

export async function loader({ request }: { request: Request }): Promise<AdminOpportunities> {
  const days = new URL(request.url).searchParams.get("days") ?? "7";
  return adminGet<AdminOpportunities>(request, `/api/admin/opportunities?days=${encodeURIComponent(days)}`);
}

export const meta = () => [{ title: "投资机会 · 后台" }];

const DIRECTION = {
  bullish: { label: "偏多", tone: "bad" as const },
  bearish: { label: "偏空", tone: "ok" as const },
  neutral: { label: "中性", tone: "muted" as const },
};

const MARKET = { cn: "A 股", us: "美股" } as const;

/** 分块的分析文字：与读者页同一套字段，后台一并摊开，方便核对模型写了什么。 */
const BLOCKS = [
  { key: "catalyst", label: "前因与催化" },
  { key: "logic", label: "逻辑链条" },
  { key: "watch", label: "后续观察点" },
  { key: "risk", label: "风险" },
] as const;

/** 一条机会：方向、标题、分块分析、标的与依据，末尾是模型与生成时间。 */
function CardRow({ card }: { card: AdminOpportunityCard }) {
  const dir = DIRECTION[card.direction];
  const evidences = card.evidence.length;
  const sources = new Set(card.evidence.map((e) => e.source).filter(Boolean)).size;
  return (
    <li className="border-b border-line-soft pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={dir.tone}>{dir.label}</Badge>
        <span className="text-[14px] font-semibold text-ink">{card.title}</span>
        <span className="ml-auto flex items-center gap-3 text-[12px] text-ink-4">
          {card.model && <span className="font-mono">{card.model}</span>}
          <Time at={card.createdAt} />
        </span>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{card.summary}</p>
      <dl className="mt-2 space-y-1.5">
        {BLOCKS.map(({ key, label }) =>
          card[key] ? (
            <div key={key}>
              <dt className="text-[11.5px] font-medium text-ink-4">{label}</dt>
              <dd className="text-[12.5px] leading-relaxed text-ink-2">{card[key]}</dd>
            </div>
          ) : null,
        )}
      </dl>
      {card.symbols.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {card.symbols.map((s) => (
            <li key={`${s.market}:${s.code}`} title={s.note} className="inline-flex items-baseline gap-1.5 rounded-full bg-bg-sunk px-2 py-0.5 text-[12px] text-ink-2">
              <span className="font-medium">{s.name}</span>
              <span className="font-mono text-[11px] text-ink-4">{s.code}</span>
              <span className="text-[10.5px] text-ink-4">{MARKET[s.market]}</span>
            </li>
          ))}
        </ul>
      )}
      {evidences > 0 && (
        <div className="mt-3">
          <p className="flex items-center gap-2 text-[11.5px] text-ink-4">
            依据 · {evidences} 条
            {sources > 0 && <span>· {sources} 个来源</span>}
            {sources < 2 && <span className="text-amber-ink">· 单一来源</span>}
          </p>
          <ul className="mt-1 space-y-1">
            {card.evidence.map((e) => (
              <li key={e.url} className="text-[12.5px] leading-relaxed">
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-ink-3 hover:text-accent">
                  {e.title}
                </a>
                {e.source && <span className="ml-1.5 text-[11.5px] text-ink-4">{e.source}</span>}
                <span className="ml-1.5 font-mono text-[11px] text-ink-4">{e.date}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export default function AdminOpportunities({ loaderData }: { loaderData: AdminOpportunities }) {
  const { run, pending } = useAdminAction();

  return (
    <AdminPage
      title="投资机会"
      subtitle="每个交易日 A 股收盘后，根据当天行情背景与本站已发布的资讯自动生成最多 5 条机会，标的经真实清单核对后落库。这里可以查看最近结果；手动重跑会重新调用模型并换掉当天已有的结果。"
      actions={
        <>
          <FilterChips param="days" options={[{ value: "7", label: "近 7 天" }, { value: "14", label: "近 14 天" }, { value: "30", label: "近 30 天" }]} />
          <Button
            tone="primary"
            busy={pending === "run"}
            onClick={() => run("POST", "/api/admin/opportunities/run", undefined, { label: "run", success: "已重跑，当天的结果已更新" })}
          >
            手动重跑
          </Button>
        </>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="窗口条数" value={num(loaderData.total)} hint={`近 ${loaderData.days} 天`} />
        <Stat label="有结果的天数" value={num(loaderData.items.length)} />
        <Stat label="最近更新" value={<Time at={loaderData.updatedAt} />} />
      </div>

      {loaderData.items.length === 0 ? (
        <Card>
          <Empty>这段时间还没有生成机会。每个交易日收盘后会自动生成，也可以手动重跑。</Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {loaderData.items.map((day) => (
            <Card key={day.date} title={day.date} right={<span>{day.cards.length} 条</span>}>
              <ul className="space-y-4">
                {day.cards.map((card) => (
                  <CardRow key={card.id} card={card} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
