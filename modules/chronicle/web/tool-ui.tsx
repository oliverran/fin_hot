// 数据工具几页共用的外壳与版式：页头、区块标题、数据表、状态提示与关键数字。
// 这一层只把各页原本各写一套的裸 HTML 收敛到站内设计系统，不参与任何取数与计算。
import type { ReactNode } from "react";
import { Link } from "react-router";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { ROUTES } from "../catalog.ts";

/** 数据工具页共用的页头：手机返回条、桌面返回链接、英文小标、标题与导语。 */
export function ToolShell({ kicker, title, intro, children }: { kicker: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-14">
      <PhoneBar back={{ to: ROUTES.home, label: "A股编年史" }} title={title} />
      <Link viewTransition to={ROUTES.home} className="hidden py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex">
        ← A股编年史
      </Link>
      <header className="pt-4 lg:pt-0">
        <Kicker>{kicker}</Kicker>
        <h1 data-page-title="" className="mt-4 text-[28px] font-black leading-[1.22] tracking-[-0.02em] text-ink lg:text-[36px]">
          {title}
        </h1>
        {intro && <p className="mt-4 max-w-[52em] text-[14.5px] leading-[1.85] text-ink-3">{intro}</p>}
      </header>
      {children}
    </div>
  );
}

/** 区块标题行：发丝线 + 可选的英文小标与右侧补充说明。 */
export function SectionHead({ kicker, title, aside }: { kicker?: string; title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line pb-3">
      {kicker && <span className="text-[12px] font-bold tracking-[0.18em] text-accent">{kicker}</span>}
      <h2 className="text-[19px] font-bold text-ink">{title}</h2>
      {aside && <span className="ml-auto text-[12.5px] text-ink-4">{aside}</span>}
    </div>
  );
}

/** 一行状态提示：读取中、出错、空结果。 */
export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "empty"; children: ReactNode }) {
  const tone = kind === "error" ? "border border-hot/25 bg-hot-soft text-hot" : "well text-ink-3";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`mt-4 rounded-card px-5 py-4 text-[13px] leading-[1.75] ${tone}`}>
      {children}
    </p>
  );
}

/** 一排关键数字的小块；空数组不占位置。 */
export function StatGrid({ stats, cols = "sm:grid-cols-2 lg:grid-cols-4", className = "" }: { stats: Array<{ label: string; value: ReactNode }>; cols?: string; className?: string }) {
  if (!stats.length) return null;
  return (
    <dl className={`grid gap-2 ${cols} ${className}`}>
      {stats.map((stat) => (
        <div key={stat.label} className="well rounded-tile px-3.5 py-2.5">
          <dt className="text-[11.5px] tracking-[0.04em] text-ink-4">{stat.label}</dt>
          <dd className="num mt-0.5 text-[15px] font-semibold leading-snug text-ink">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface Column<Row> {
  key: string;
  label: ReactNode;
  render: (row: Row) => ReactNode;
  /** 数值列右对齐并使用等宽数字。 */
  align?: "right";
}

/** 一张数据表：卡片式外框、发丝线行距、窄屏横向滚动（给单元格留最小宽度）。 */
export function DataTable<Row>({ columns, rows, rowKey, minWidth = 560, empty = "暂无数据" }: {
  columns: Array<Column<Row>>;
  rows: Row[];
  rowKey: (row: Row) => string | number;
  minWidth?: number;
  empty?: ReactNode;
}) {
  if (!rows.length) return <p className="well mt-4 rounded-card px-5 py-8 text-center text-[13px] text-ink-4">{empty}</p>;
  return (
    <div className="scrollbar-none mt-4 overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full text-left text-[13px]" style={{ minWidth }}>
        <thead className="bg-bg-sunk text-[12px] text-ink-3">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`whitespace-nowrap px-3.5 py-2.5 font-medium ${column.align === "right" ? "text-right" : ""}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-line-soft">
              {columns.map((column) => (
                <td key={column.key} className={`px-3.5 py-2.5 align-top text-ink-2 ${column.align === "right" ? "num text-right" : ""}`}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
