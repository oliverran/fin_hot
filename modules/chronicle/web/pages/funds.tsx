// 公募披露持仓与共识：季报披露的共同持仓。
// 取数与统计都在服务端（/api/chronicle/funds 快照），这一页只负责取数与排版。
import { useEffect, useState } from "react";
import type { Screen } from "@aihot/web/components/shell/screens";
import type { fundSummary } from "../../backend/funds.ts";
import { DataTable, Notice, SectionHead, StatGrid, ToolShell } from "../tool-ui.tsx";

export const handle: Screen = { tab: "chronicle", name: "公募持仓" };

type Summary = ReturnType<typeof fundSummary>;

export default function FundsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/chronicle/funds", { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<Summary>) : Promise.reject(new Error("api"))))
      .then((summary) => {
        setData(summary);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);

  return (
    <ToolShell
      kicker="编年史 · 数据工具"
      title="公募披露持仓与共识"
      intro="范围：在运作的场外股票型及混合型公募，剔除名称或投资类型标明指数、ETF、联接、增强的产品；分类依赖供应商标签，不能保证识别所有被动产品。"
    >
      <p className="well mt-6 rounded-card px-4 py-3 text-[12.5px] leading-[1.8] text-ink-3">
        A/C 等份额按基金公司与标准化名称近似归组，每组仅取一份已披露组合，避免份额类别重复计数。披露范围随报告类型不同，不视为完整实时仓位；本页不做组合回测。
      </p>

      {failed ? (
        <Notice kind="error">读取失败，请重试。</Notice>
      ) : !loaded ? (
        <Notice>正在读取…</Notice>
      ) : !data ? (
        <Notice kind="empty">尚未启动批量同步。</Notice>
      ) : (
        <>
          <section className="card mt-4 p-4 sm:p-5">
            <h2 className="text-[15px] font-bold text-ink">
              报告期 {data.period} · 截至 {data.asOf} 已公开
            </h2>
            <StatGrid
              className="mt-3"
              cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
              stats={[
                { label: "基金份额代码", value: data.total },
                { label: "已处理", value: data.processed },
                { label: "待处理", value: data.total - data.processed },
                { label: "有披露", value: data.reported },
                { label: "暂无披露", value: data.empty },
                { label: "同步失败", value: data.failed },
                { label: "可统计产品组", value: data.products },
              ]}
            />
            <p className="mt-3 text-[12.5px] leading-[1.8] text-ink-4">分批同步期间排名会变化，不能当作全市场结论。公告日期晚于当前日期的持仓不参与统计。</p>
          </section>

          <section className="pt-10">
            <SectionHead kicker="共识" title="已披露样本的共同持仓" aside="按持有产品组数排序，最多 50 只" />
            <DataTable
              minWidth={560}
              empty="尚无已披露的持仓样本。"
              rows={data.leaders}
              rowKey={(leader) => leader.symbol}
              columns={[
                { key: "symbol", label: "证券代码", render: (leader) => <span className="mono text-[12.5px] text-ink-2">{leader.symbol}</span> },
                { key: "products", label: "持有产品组", align: "right", render: (leader) => leader.products },
                { key: "share", label: "样本占比", align: "right", render: (leader) => (leader.share === null ? "—" : leader.share.toFixed(1) + "%") },
                { key: "weight", label: "持有者平均股票市值占比", align: "right", render: (leader) => (leader.averageWeight === null ? "—" : leader.averageWeight.toFixed(2) + "%") },
              ]}
            />
          </section>
        </>
      )}
    </ToolShell>
  );
}
