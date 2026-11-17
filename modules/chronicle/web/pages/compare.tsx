// 多指数对比与区间复盘：任选指数、对齐同一区间，比涨跌幅、回撤与波动。
// 取数与计算都在服务端（/api/chronicle/compare），这一页只负责筛选、取数与排版。
import { useEffect, useState } from "react";
import { ToggleChip } from "@aihot/web/components/ui/Controls";
import type { Screen } from "@aihot/web/components/shell/screens";
import { LIVE_CHARTS } from "../../catalog.ts";
import { Canvas } from "../chart.tsx";
import { DataTable, Notice, SectionHead, StatGrid, ToolShell } from "../tool-ui.tsx";

export const handle: Screen = { tab: "chronicle", name: "区间复盘" };

type Result = {
  dates: string[];
  seriesData: Record<string, number[]>;
  missing: string[];
  summaries: Array<{ name: string; count: number; change: number | null; drawdown: number | null; volatility: number | null }>;
  events: Array<{ id: string; title: string; date: string; url: string }>;
};

const CHOICES = LIVE_CHARTS.filter((chart) => chart.kind === "index" && chart.group === "broad");
const pct = (value: number | null) => (value === null ? "—" : value.toFixed(2) + "%");
const dateInput = "h-11 rounded-full border border-line-strong bg-surface px-3.5 text-[16px] text-ink-2 outline-none transition-colors hover:border-ink-4 focus:border-accent lg:h-8 lg:text-[12.5px]";

export default function ComparePage() {
  const [codes, setCodes] = useState(["sh000300", "sh000905"]);
  const [start, setStart] = useState("2020-01-01");
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    fetch("/api/chronicle/compare?" + new URLSearchParams({ codes: codes.join(","), start, end }), { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw Error("请选择有效日期和至少一个指数");
        return res.json() as Promise<Result>;
      })
      .then(setData)
      .catch((err: Error) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [codes, start, end]);

  return (
    <ToolShell
      kicker="编年史 · 数据工具"
      title="多指数对比与区间复盘"
      intro="按共同交易日对齐，起点归一为 100；价格指数，不含分红再投资。新闻标记表示同期报道，不表示因果关系。"
    >
      <section className="card mt-6 p-4 sm:p-5">
        <h2 className="text-[13px] font-semibold text-ink">对比指数</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {CHOICES.map((choice) => (
            <ToggleChip
              key={choice.code}
              on={codes.includes(choice.code)}
              onToggle={() => setCodes((prev) => (prev.includes(choice.code) ? prev.filter((v) => v !== choice.code) : [...prev, choice.code]))}
            >
              {choice.indexName}
            </ToggleChip>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-[12px] text-ink-3">
            开始日期
            <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className={dateInput} />
          </label>
          <label className="flex flex-col gap-1.5 text-[12px] text-ink-3">
            结束日期
            <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className={dateInput} />
          </label>
        </div>
      </section>

      {error && <Notice kind="error">{error}</Notice>}
      {!data && !error && <Notice>正在读取真实数据…</Notice>}

      {data && (
        <>
          {data.missing.length > 0 && <Notice>尚未取得数据：{data.missing.join("、")}。请取消这些指数后对比。</Notice>}

          {data.dates.length < 2 ? (
            <Notice kind="empty">所选区间共同交易日不足，无法计算。</Notice>
          ) : (
            <section className="pt-8">
              <SectionHead title="归一化走势" aside={`实际区间 ${data.dates[0]} — ${data.dates.at(-1)}，共 ${data.dates.length} 个共同交易日`} />
              <figure className="card mt-4 px-4 py-5 sm:px-6">
                <div className="h-[360px] sm:h-[420px]" role="img" aria-label="多指数归一化走势，起点 100">
                  <Canvas data={{ meta: { id: "compare", name: "起点 100", type: "multi-line", events: data.events.filter((event) => data.dates.includes(event.date)) }, series: { dates: data.dates, seriesData: data.seriesData } }} />
                </div>
              </figure>

              <div className="pt-8">
                <SectionHead kicker="统计" title="区间表现" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.summaries.map((summary) => (
                    <section key={summary.name} className="card p-4">
                      <h3 className="text-[15px] font-semibold text-ink">{summary.name}</h3>
                      <StatGrid
                        className="mt-3"
                        cols="grid-cols-3"
                        stats={[
                          { label: "区间涨跌幅", value: pct(summary.change) },
                          { label: "最大回撤", value: pct(summary.drawdown) },
                          { label: "年化波动率", value: pct(summary.volatility) },
                        ]}
                      />
                    </section>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="pt-10">
            <SectionHead kicker="同期" title="精选新闻" />
            <p className="mt-3 max-w-[52em] text-[12.5px] leading-[1.8] text-ink-4">按站内时间线日期展示，最多最近 100 条；站点未收录不代表当时没有事件。</p>
            <DataTable
              minWidth={480}
              empty={<span className="text-ink-4">此区间暂无已收录新闻。</span>}
              rows={data.events}
              rowKey={(event) => event.id}
              columns={[
                { key: "date", label: "日期", render: (event) => <span className="num text-ink-4">{event.date}</span> },
                {
                  key: "title",
                  label: "标题",
                  render: (event) => (
                    <a className="text-ink-2 transition-colors hover:text-accent" href={event.url} target="_blank" rel="noreferrer">
                      {event.title}
                    </a>
                  ),
                },
              ]}
            />
          </section>
        </>
      )}
    </ToolShell>
  );
}
