// 上市公司背景卡：按代码或名称查一只证券的行业、估值与股息。
// 取数在服务端（/api/chronicle/companies 快照），这一页只负责查询与排版。
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { buttonClass } from "@aihot/web/components/ui/Controls";
import type { Screen } from "@aihot/web/components/shell/screens";
import type { CompanyRecord } from "../../backend/companies.ts";
import { Notice, ToolShell } from "../tool-ui.tsx";

export const handle: Screen = { tab: "chronicle", name: "公司背景" };

const inputClass = "h-11 w-full rounded-full border border-line-strong bg-surface px-4 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-4 hover:border-ink-4 focus:border-accent lg:h-9 lg:text-[13.5px]";

export default function Companies() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [draft, setDraft] = useState(query);
  const [items, setItems] = useState<CompanyRecord[]>([]);
  const [state, setState] = useState("");

  useEffect(() => {
    if (!query) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    setState("正在查询…");
    fetch("/api/chronicle/companies?q=" + encodeURIComponent(query), { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ updatedAt: string | null; items: CompanyRecord[] }>) : Promise.reject(new Error("api"))))
      .then((data) => {
        setItems(data.items);
        setState(data.updatedAt ? (data.items.length ? "" : "没有匹配证券") : "数据尚未同步");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("读取失败");
      });
    return () => controller.abort();
  }, [query]);

  return (
    <ToolShell kicker="编年史 · 数据工具" title="上市公司背景卡" intro="按证券代码或名称查询，数据来自已同步快照；不根据新闻中的模糊名称自动猜测上市主体。">
      <section className="card mt-6 p-4 sm:p-5">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setParams({ q: draft }); }}>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-[12px] text-ink-3">
            公司或代码
            <input value={draft} maxLength={60} autoComplete="off" placeholder="如 600519 或 贵州茅台" onChange={(event) => setDraft(event.target.value)} className={inputClass} />
          </label>
          <button type="submit" className={buttonClass("primary")}>
            查询
          </button>
        </form>
      </section>

      {state === "读取失败" ? <Notice kind="error">读取失败，请重试。</Notice> : state ? <Notice>{state}</Notice> : null}

      {!query && <Notice kind="empty">输入证券代码或名称后查询。</Notice>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((company) => (
          <article key={company.code} className="card flex h-full flex-col gap-3 p-4">
            <div>
              <h2 className="text-[15px] font-bold text-ink">{company.name}</h2>
              <p className="mono mt-0.5 text-[12px] text-ink-4">{company.code}</p>
            </div>
            <dl className="space-y-1.5 text-[12.5px] text-ink-3">
              {[
                { label: "供应商行业", value: company.industry },
                { label: "指标日期", value: company.date ?? "缺失" },
                { label: "PE-TTM", value: company.pe ?? "—" },
                { label: "PB", value: company.pb ?? "—" },
                { label: "股息率TTM", value: company.dividendYield === null ? "—" : company.dividendYield.toFixed(2) + "%" },
                { label: "总市值", value: company.marketValue === null ? "—" : (company.marketValue / 10000).toFixed(2) + "亿元" },
              ].map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0">{row.label}</dt>
                  <dd className="num text-right text-ink-2">{row.value}</dd>
                </div>
              ))}
            </dl>
            <Link className="mt-auto inline-flex items-center gap-1 text-[13px] text-accent hover:underline" to={"/all?q=" + encodeURIComponent(company.name)}>
              检索站内相关报道 →
            </Link>
          </article>
        ))}
      </div>
    </ToolShell>
  );
}
