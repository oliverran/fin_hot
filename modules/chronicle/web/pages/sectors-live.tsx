// 行业数据与轮动：申万一级行业的涨跌幅、估值分位与最近十二个月轮动。
// 取数与计算都在服务端（/api/chronicle/provider 的快照 + analytics），这一页只负责取数与排版。
import { useEffect, useState } from "react";
import { Select } from "@aihot/web/components/ui/Controls";
import { monthReturns, percentile, periodReturn } from "../../analytics.ts";
import type { ProviderSnapshot } from "../../backend/provider.ts";
import { Canvas } from "../chart.tsx";
import { DataTable, Notice, SectionHead, StatGrid, ToolShell } from "../tool-ui.tsx";
import type { Screen } from "@aihot/web/components/shell/screens";

export const handle: Screen = { tab: "chronicle", name: "行业轮动" };

type Index = ProviderSnapshot["indices"][number];
const pct = (value: number | null) => (value === null ? "—" : value.toFixed(2) + "%");

export default function SectorData() {
  const [data, setData] = useState<ProviderSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/chronicle/provider", { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<ProviderSnapshot>) : Promise.reject(new Error("api"))))
      .then((snapshot) => {
        setData(snapshot);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);

  const sectors = data?.indices.filter((x) => x.classification === "SW2021-L1") ?? [];
  const end = data?.expectedDate;
  const calendar = data?.calendar ?? [];
  const benchmark = data?.indices.find((x) => x.code === "000300.SH");
  const benchmark20 = benchmark && end ? periodReturn(benchmark, calendar, end, 20) : null;
  const rows = sectors.map((x) => ({ x, r20: end ? periodReturn(x, calendar, end, 20) : null })).sort((a, b) => (b.r20 ?? -Infinity) - (a.r20 ?? -Infinity));
  const current = data?.indices.find((x) => x.code === selected) ?? sectors[0] ?? data?.indices[0];
  const months = new Map<string, string>();
  for (const day of calendar.filter((d) => end && d <= end)) months.set(day.slice(0, 7), day);
  const endpoints = [...months.values()].slice(-13);
  const monthRows = sectors.map((x) => ({ x, values: monthReturns(x, endpoints) }));

  const returnOf = (x: Index, days: number) => (end ? periodReturn(x, calendar, end, days) : null);

  return (
    <ToolShell
      kicker="编年史 · 数据工具"
      title="申万行业轮动与估值"
      intro="统一申万 2021 版一级行业，历史覆盖从 2021 年起；宽基保留 2020 年起历史。缺失和未更新的行业不参与同期排名。"
    >
      {error ? (
        <Notice kind="error">数据读取失败，请刷新重试。</Notice>
      ) : !loaded ? (
        <Notice>正在读取…</Notice>
      ) : !data ? (
        <Notice kind="empty">尚未同步数据。</Notice>
      ) : (
        <>
          <p className="well mt-6 rounded-card px-4 py-3 text-[12.5px] leading-[1.75] text-ink-3">
            来源：{data.source} · 最近同步：{data.updatedAt} · 应有交易日：{end ?? "日历不可用"}
          </p>
          {data.errors?.length ? <Notice>{data.errors.join("；")}</Notice> : null}

          <section className="pt-10">
            <SectionHead kicker="行业" title="表现与历史估值分位" />
            <p className="mt-3 max-w-[56em] text-[12.5px] leading-[1.8] text-ink-4">
              统一交易日计算。PE 与 PB 分位使用近五年已取得正值观测，至少 252 条；PE 采用申万接口口径，不标为 PE-TTM。超额为同期涨幅减沪深 300 涨幅（百分点）。
            </p>
            <DataTable
              minWidth={840}
              empty="尚无同步到申万一级行业。"
              rows={rows}
              rowKey={(row) => row.x.code}
              columns={[
                {
                  key: "name",
                  label: "行业",
                  render: ({ x }) => (
                    <button type="button" onClick={() => setSelected(x.code)} className="text-left font-medium text-accent hover:underline">
                      {x.name}
                    </button>
                  ),
                },
                { key: "asOf", label: "截至", render: ({ x }) => <span className="mono text-[12px] text-ink-4">{x.bars.at(-1)?.date ?? "缺失"}</span> },
                { key: "d1", label: "1日", align: "right", render: ({ x }) => pct(returnOf(x, 1)) },
                { key: "d5", label: "5日", align: "right", render: ({ x }) => pct(returnOf(x, 5)) },
                { key: "d20", label: "20日", align: "right", render: ({ x }) => pct(returnOf(x, 20)) },
                { key: "d60", label: "60日", align: "right", render: ({ x }) => pct(returnOf(x, 60)) },
                { key: "excess", label: "20日超额", align: "right", render: ({ r20 }) => (r20 !== null && benchmark20 !== null ? (r20 - benchmark20).toFixed(2) : "—") },
                { key: "pe", label: "PE分位", align: "right", render: ({ x }) => pct(end ? percentile(x.valuations, "pe", end) : null) },
                { key: "pb", label: "PB分位", align: "right", render: ({ x }) => pct(end ? percentile(x.valuations, "pb", end) : null) },
              ]}
            />
          </section>

          <section className="pt-10">
            <SectionHead kicker="轮动" title="最近十二个月" aside="末列为当月截至应有交易日" />
            <p className="mt-3 max-w-[56em] text-[12.5px] leading-[1.8] text-ink-4">各行业必须具有相同月末端点，缺失留空；红为上涨、绿为下跌。</p>
            <DataTable
              minWidth={880}
              empty="尚无同步到申万一级行业。"
              rows={monthRows}
              rowKey={(row) => row.x.code}
              columns={[
                { key: "name", label: "行业", render: (row) => <span className="font-medium text-ink-2">{row.x.name}</span> },
                ...endpoints.slice(1).map((day, i) => ({
                  key: `m${day}`,
                  label: day.slice(0, 7),
                  align: "right" as const,
                  render: (row: { x: Index; values: Array<number | null> }) => {
                    const value = row.values[i] ?? null;
                    if (value === null) return <span className="text-ink-4">—</span>;
                    return <span className={`inline-block rounded-mark px-1.5 py-0.5 ${value >= 0 ? "bg-hot-soft text-hot" : "bg-ok-soft text-ok"}`}>{pct(value)}</span>;
                  },
                })),
              ]}
            />
          </section>

          <section className="pt-10">
            <SectionHead kicker="走势" title={current?.name ?? "行业走势"} />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-[12.5px] text-ink-3">查看走势</span>
              <Select value={current?.code ?? ""} onChange={(event) => setSelected(event.target.value)}>
                {data.indices.map((x) => (
                  <option value={x.code} key={x.code}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </div>
            {current && (
              <div className="card mt-4 p-4 sm:p-5">
                <p className="text-[12.5px] text-ink-3">
                  行情覆盖 {current.bars[0]?.date ?? "缺失"} — {current.bars.at(-1)?.date ?? "缺失"}
                  {end && current.bars.at(-1)?.date !== end ? " · 未更新到应有交易日" : ""}
                </p>
                {current.error && <p className="mt-2 text-[12.5px] text-amber-ink">{current.error}</p>}
                {current.bars.length > 0 && (
                  <figure className="mt-4">
                    <div className="h-[320px] sm:h-[380px]" role="img" aria-label={`${current.name} 走势`}>
                      <Canvas data={{ meta: { id: current.code, name: current.name, type: "line" }, series: current.bars.map((bar) => ({ date: bar.date, value: bar.close })) }} />
                    </div>
                  </figure>
                )}
                <StatGrid
                  className="mt-4"
                  cols="grid-cols-3"
                  stats={[
                    { label: current.peBasis ?? "PE", value: current.valuations.at(-1)?.pe ?? "缺失" },
                    { label: "PB", value: current.valuations.at(-1)?.pb ?? "缺失" },
                    { label: "估值日期", value: current.valuations.at(-1)?.date ?? "缺失" },
                  ]}
                />
              </div>
            )}
          </section>
        </>
      )}
    </ToolShell>
  );
}
