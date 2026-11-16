// 市场背景：市场宽度、行业当日表现、两融与 ETF 份额。
// 取数与计算都在服务端（/api/chronicle/market 快照），这一页只负责取数与排版。
import { useEffect, useState } from "react";
import type { Screen } from "@aihot/web/components/shell/screens";
import type { MarketDay } from "../../backend/market.ts";
import { DataTable, Notice, StatGrid, ToolShell } from "../tool-ui.tsx";

export const handle: Screen = { tab: "chronicle", name: "市场背景" };

const formatPercent = (value: number | null) => (value === null ? "—" : `${value.toFixed(2)}%`);

export default function MarketPage() {
  const [data, setData] = useState<MarketDay | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/chronicle/market", { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<MarketDay>) : Promise.reject(new Error("api"))))
      .then((day) => {
        setData(day);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const etfs = data?.etfs.filter((x) => x.change !== null).sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!)).slice(0, 30) ?? [];

  return (
    <ToolShell
      kicker="编年史 · 数据工具"
      title="市场背景、ETF 与两融"
      intro="以 Tushare Pro 当日返回的 A 股记录为样本；停牌或缺报证券不计入，不是指数加权收益。"
    >
      {failed ? (
        <Notice kind="error">读取失败，请重试。</Notice>
      ) : !loaded ? (
        <Notice>正在读取…</Notice>
      ) : !data ? (
        <Notice kind="empty">尚未同步。</Notice>
      ) : (
        <>
          <p className="well mt-6 rounded-card px-4 py-3 text-[12.5px] leading-[1.75] text-ink-3">
            交易日 {data.date} · 来源：Tushare Pro 配置服务 · 最近读取 {data.observedAt}
          </p>
          {data.errors.length > 0 && <Notice>部分数据缺失：{data.errors.join("；")}</Notice>}

          <section className="card mt-4 p-4 sm:p-5">
            <h2 className="text-[15px] font-bold text-ink">市场宽度</h2>
            <StatGrid
              className="mt-3"
              cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
              stats={[
                { label: "上涨", value: data.breadth.up },
                { label: "下跌", value: data.breadth.down },
                { label: "平盘", value: data.breadth.flat },
                { label: "中位数涨跌幅", value: formatPercent(data.breadth.median) },
                { label: "成交额", value: data.breadth.turnover === null ? "缺失" : (data.breadth.turnover / 1e8).toFixed(2) + " 亿元" },
              ]}
            />
            <p className="mt-3 text-[12.5px] leading-[1.8] text-ink-4">有涨跌幅记录 {data.breadth.count} 只；停牌或缺报证券不计入，不是指数加权收益。</p>
          </section>

          <section className="card mt-4 p-4 sm:p-5">
            <h2 className="text-[15px] font-bold text-ink">行业当日表现</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {[...data.industries].sort((a, b) => (b.change ?? 0) - (a.change ?? 0)).map((industry) => (
                <li key={industry.name} className="well flex items-center justify-between gap-2 rounded-tile px-3 py-2">
                  <span className="truncate text-[12.5px] text-ink-3">{industry.name}</span>
                  <span className={`num shrink-0 text-[12.5px] ${industry.change === null ? "text-ink-4" : industry.change >= 0 ? "text-hot" : "text-ok"}`}>{formatPercent(industry.change)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card mt-4 p-4 sm:p-5">
            <h2 className="text-[15px] font-bold text-ink">融资观察</h2>
            <p className="mt-2 text-[12.5px] leading-[1.8] text-ink-4">交易所数据可能晚于行情披露；只显示上述交易日已返回的市场，不将缺失交易所计为零。</p>
            <DataTable
              minWidth={420}
              empty="暂无该日两融数据。"
              rows={data.margin}
              rowKey={(row) => row.exchange}
              columns={[
                { key: "exchange", label: "交易所", render: (row) => row.exchange },
                { key: "balance", label: "融资余额（亿元）", align: "right", render: (row) => (row.balance === null ? "—" : (row.balance / 1e8).toFixed(2)) },
                { key: "net", label: "买入减偿还（亿元）", align: "right", render: (row) => (row.buy === null || row.repay === null ? "—" : ((row.buy - row.repay) / 1e8).toFixed(2)) },
              ]}
            />
          </section>

          <section className="card mt-4 p-4 sm:p-5">
            <h2 className="text-[15px] font-bold text-ink">ETF 份额变化</h2>
            <p className="mt-2 text-[12.5px] leading-[1.8] text-ink-4">覆盖 {data.etfs.length} 只，展示变化幅度最大的 30 只；与上一交易日比较。份额变化不是资金净流入，拆分等公司行为需核查。</p>
            <DataTable
              minWidth={520}
              empty="暂无该日 ETF 数据。"
              rows={etfs}
              rowKey={(row) => row.code}
              columns={[
                {
                  key: "name",
                  label: "ETF",
                  render: (row) => (
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-ink-2">{row.name}</span>
                      <span className="mono text-[11.5px] text-ink-4">{row.code}</span>
                    </span>
                  ),
                },
                { key: "shares", label: "份额（万份）", align: "right", render: (row) => row.shares.toFixed(2) },
                {
                  key: "change",
                  label: "份额变化",
                  align: "right",
                  render: (row) => <span className={row.change === null ? "text-ink-4" : row.change >= 0 ? "text-hot" : "text-ok"}>{formatPercent(row.change)}</span>,
                },
              ]}
            />
          </section>
        </>
      )}
    </ToolShell>
  );
}
