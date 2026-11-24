// 机会页：当天与最近 7 天的投资机会线索。
// 数据来自 /api/opportunities（后端已把模型结果与真实标的核对后落库），这一页只负责取数与排版，
// 不触发任何模型调用；每条机会的方向以「偏多 / 偏空 / 中性」标注，措辞统一为「观察」。
// 一条机会按「结论 + 前因与催化 + 逻辑链条 + 观察点 + 风险」分块展示，长文可展开；依据标出
// 来源与是否交叉印证；标的按 A 股 / 美股分组且可点开行情。顶部可按方向与市场筛选。
import { useEffect, useState, type ReactNode } from "react";
import { beijingDate, beijingTime, beijingWeekday, monthDay } from "@aihot/contracts/time";
import { IconChevronDown, IconExternal, IconMinus, IconTrendDown, IconTrendUp } from "@aihot/web/components/icons";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { Badge } from "@aihot/web/components/ui/Badge";
import { ToggleChip } from "@aihot/web/components/ui/Controls";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import type { Direction, OpportunityCard, OpportunityDay, OpportunitySymbol } from "../../backend/opportunities.ts";

export const handle: Screen = { tab: "opportunity", name: "机会" };

interface OpportunitiesResponse {
  /** 最近一次生成的时间（ISO），还没有结果时是 null。 */
  updatedAt: string | null;
  days: OpportunityDay[];
}

const DIRECTION = {
  bullish: { label: "偏多", Icon: IconTrendUp, chip: "bg-hot-soft text-hot" },
  bearish: { label: "偏空", Icon: IconTrendDown, chip: "bg-ok/10 text-ok" },
  neutral: { label: "中性", Icon: IconMinus, chip: "bg-bg-sunk text-ink-3" },
} as const;

const MARKET = { cn: "A 股", us: "美股" } as const;

/** 分块分析的标题与取值。 */
const BLOCKS = [
  { label: "前因与催化", key: "catalyst" },
  { label: "逻辑链条", key: "logic" },
  { label: "后续观察点", key: "watch" },
  { label: "风险", key: "risk" },
] as const;

const LONG_AT = 320;

/** 标的在行情站的对应页：A 股按交易所拼前缀，美股用代码。 */
function quoteUrl(symbol: OpportunitySymbol): string {
  const code = symbol.code.toUpperCase();
  if (symbol.market === "us") return `https://quote.eastmoney.com/us/${code}.html`;
  const bare = code.split(".")[0]!;
  const exchange = code.endsWith(".SZ") ? "sz" : code.endsWith(".SH") ? "sh" : bare.startsWith("6") || bare.startsWith("9") ? "sh" : "sz";
  return `https://quote.eastmoney.com/${exchange}${bare}.html`;
}

/** 一行状态提示：读取中、出错、空结果。 */
function Notice({ kind = "info", children }: { kind?: "info" | "error"; children: ReactNode }) {
  const tone = kind === "error" ? "border border-hot/25 bg-hot-soft text-hot" : "well text-ink-3";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`mt-4 rounded-card px-5 py-4 text-[13px] leading-[1.75] ${tone}`}>
      {children}
    </p>
  );
}

/** 一条机会卡片：方向、标题、分块分析、相关标的与依据。 */
function Card({ card }: { card: OpportunityCard }) {
  const { label, Icon, chip } = DIRECTION[card.direction];
  const blocks = BLOCKS.map((b) => ({ label: b.label, text: card[b.key] })).filter((b) => b.text.trim());
  const long = card.summary.length + blocks.reduce((n, b) => n + b.text.length, 0) > LONG_AT;
  const [open, setOpen] = useState(!long);

  const sources = new Set(card.evidence.map((e) => e.source).filter(Boolean));
  const groups = { cn: card.symbols.filter((s) => s.market === "cn"), us: card.symbols.filter((s) => s.market === "us") };

  return (
    <article className="card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${chip}`}>
          <Icon size={13} />
          {label}
        </span>
        <span className="text-[11.5px] text-ink-4">观察</span>
      </div>
      <h3 className="mt-2.5 text-[16.5px] font-bold leading-[1.5] text-ink">{card.title}</h3>
      {card.summary && <p className="mt-2 text-[14px] font-medium leading-[1.8] text-ink-2">{card.summary}</p>}

      {blocks.length > 0 && (open ? (
        <div className="mt-3.5 space-y-3.5">
          {blocks.map((b) => (
            <section key={b.label}>
              <h4 className="text-[11.5px] font-medium tracking-[0.04em] text-ink-4">{b.label}</h4>
              <p className="mt-1 text-[13.5px] leading-[1.85] text-ink-2">{b.text}</p>
            </section>
          ))}
          {long && (
            <button type="button" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-4 hover:text-accent">
              <IconChevronDown size={13} className="rotate-180" />
              收起
            </button>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline">
          展开全文 · 含 {blocks.length} 段分析
          <IconChevronDown size={13} />
        </button>
      ))}

      {card.symbols.length > 0 && (
        <section className="mt-4">
          <h4 className="text-[11.5px] font-medium tracking-[0.04em] text-ink-4">相关标的</h4>
          <div className="mt-2 space-y-1.5">
            {(["cn", "us"] as const).map((market) => groups[market].length > 0 && (
              <div key={market} className="flex flex-wrap items-center gap-1.5">
                <span className="w-9 shrink-0 text-[11px] text-ink-4">{MARKET[market]}</span>
                {groups[market].map((s) => (
                  <a
                    key={s.code}
                    href={quoteUrl(s)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={s.note ?? `查看 ${s.name} 行情`}
                    className="inline-flex items-baseline gap-1.5 rounded-full bg-bg-sunk px-2.5 py-1 text-[12.5px] text-ink-2 transition-colors hover:bg-accent-soft hover:text-accent"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="mono text-[11.5px] text-ink-4">{s.code}</span>
                  </a>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {card.evidence.length > 0 && (
        <section className="mt-4">
          <h4 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] font-medium tracking-[0.04em] text-ink-4">
            依据
            <span className="tracking-normal">
              {sources.size} 个来源 · {card.evidence.length} 条
            </span>
            {sources.size < 2 && <Badge title="只有一条来源，尚未得到其他来源印证">单一来源</Badge>}
          </h4>
          <ul className="mt-2 space-y-2">
            {card.evidence.map((e) => (
              <li key={e.url}>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-1.5 text-[13px] leading-[1.6] text-ink-3 transition-colors hover:text-accent"
                >
                  <IconExternal size={13} className="mt-1 shrink-0 text-ink-4 transition-colors group-hover:text-accent" />
                  <span className="min-w-0">
                    {e.source && <span className="mr-1.5 text-[11.5px] font-medium text-ink-4">{e.source}</span>}
                    {e.title}
                    <span className="mono ml-1.5 text-[11.5px] text-ink-4">{e.date}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

/** 页脚固定的强免责声明：这一页只提供观察线索，不构成投资建议。 */
function Disclaimer() {
  return (
    <section className="mt-10 rounded-card border border-line bg-bg-sunk/60 p-4 text-[12px] leading-[1.8] text-ink-4 sm:p-5">
      <h2 className="text-[12.5px] font-semibold text-ink-3">免责声明</h2>
      <p className="mt-2">
        本页内容由模型基于公开行情数据与本站已发布的资讯自动整理，标的代码与名称经真实清单核对；仅供观察线索，不构成任何投资建议、要约或收益承诺。市场随时变化，信息可能存在滞后或错漏，据此操作风险自负。
      </p>
      <p className="mt-2">股市有风险，投资需谨慎。</p>
    </section>
  );
}

export default function OpportunitiesPage() {
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dirs, setDirs] = useState<ReadonlySet<Direction>>(new Set());
  const [markets, setMarkets] = useState<ReadonlySet<"cn" | "us">>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/opportunities?days=7", { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<OpportunitiesResponse>) : Promise.reject(new Error("api"))))
      .then((body) => {
        setData(body);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const toggleDir = (d: Direction) => setDirs((prev) => {
    const next = new Set(prev);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    return next;
  });
  const toggleMarket = (m: "cn" | "us") => setMarkets((prev) => {
    const next = new Set(prev);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    return next;
  });

  const today = beijingDate(new Date());
  const days = (data?.days ?? [])
    .map((day) => ({
      ...day,
      cards: day.cards.filter((c) =>
        (dirs.size === 0 || dirs.has(c.direction)) && (markets.size === 0 || c.symbols.some((s) => markets.has(s.market)))),
    }))
    .filter((day) => day.cards.length > 0);
  const total = days.reduce((n, day) => n + day.cards.length, 0);
  const filtering = dirs.size > 0 || markets.size > 0;

  let body: ReactNode;
  if (failed) {
    body = <Notice kind="error">读取失败，请稍后重试。</Notice>;
  } else if (!loaded) {
    body = <Notice>正在读取…</Notice>;
  } else {
    body = (
      <>
        {(data?.days.length ?? 0) === 0 ? (
          <Notice>还没有生成机会。每个交易日收盘后会更新，稍后再来看看。</Notice>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(["bullish", "bearish", "neutral"] as const).map((d) => (
                <ToggleChip key={d} on={dirs.has(d)} onToggle={() => toggleDir(d)}>{DIRECTION[d].label}</ToggleChip>
              ))}
              <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
              {(["cn", "us"] as const).map((m) => (
                <ToggleChip key={m} on={markets.has(m)} onToggle={() => toggleMarket(m)}>{MARKET[m]}</ToggleChip>
              ))}
            </div>
            <p className="well mt-3 rounded-card px-4 py-3 text-[12.5px] leading-[1.75] text-ink-3">
              {filtering ? <>筛选出 <span className="num">{total}</span> 条</> : <>最近 7 天共 <span className="num">{total}</span> 条</>}
              {data?.updatedAt && (
                <>
                  {" · "}最近更新 <span className="num">{monthDay(beijingDate(data.updatedAt), today)} {beijingTime(data.updatedAt)}</span>
                </>
              )}
            </p>
            {total === 0 ? (
              <Notice>没有符合筛选条件的机会，换一组条件试试。</Notice>
            ) : (
              days.map((day) => (
                <section key={day.date} className="mt-6">
                  <div className="flex items-baseline gap-x-2.5 border-b border-line pb-2.5">
                    <h2 className="text-[15px] font-bold text-ink">{day.date === today ? "今日观察" : monthDay(day.date, today)}</h2>
                    <span className="text-[11.5px] text-ink-4">
                      {beijingWeekday(day.date)} · 共 <span className="num">{day.cards.length}</span> 条
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {day.cards.map((card) => (
                      <Card key={card.id} card={card} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </>
        )}
        <Disclaimer />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-14">
      <PhoneBar title="机会" large sub="基于公开行情与已发布资讯，仅供观察" />
      <header className="hidden pb-5 pt-1 lg:block">
        <Kicker>投资机会</Kicker>
        <h1 data-page-title="" className="mt-3 text-[26px] font-bold leading-[1.3] tracking-[-0.01em] text-ink">
          机会观察
        </h1>
        <p className="mt-2 max-w-[52em] text-[13.5px] leading-[1.8] text-ink-3">
          结合当天行情背景与本站已发布的资讯，挑出值得留意的机会与相关标的；A 股为主，兼顾美股常见大盘股。每个交易日收盘后更新，仅作观察线索。
        </p>
      </header>
      {body}
    </div>
  );
}
