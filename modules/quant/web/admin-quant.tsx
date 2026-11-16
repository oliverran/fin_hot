// 后台「量化工具」页：手动填参数（股票池 / 区间 / 调仓 / 组合 / 因子权重 / 熔断），触发一次选股扫描或策略回测。
// 提交后由 worker 里的子进程跑站外引擎（backend/engine.ts），产物落到共享数据目录，公开页随即可读；
// 这一页还报告引擎是否就绪、已有的回测快照与最近几次运行。数据来自 /api/admin/quant/status（server.ts 的
// adminHandler 守卫），页面自身不落任何数据。模块的后台页没有 +types 产物，props 自己声明。
import { SITE } from "@aihot/site";
import { useState } from "react";
import { Link } from "react-router";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { duration } from "@aihot/web/features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Empty, Field, Input, Json, KV, Select, Time, type Column } from "@aihot/web/features/admin/ui";
import { PARAM_LIMITS, ROUTES, type FactorWeights, type QuantAdminStatus, type QuantParams } from "../catalog.ts";

export async function loader({ request }: { request: Request }): Promise<QuantAdminStatus> {
  return adminGet<QuantAdminStatus>(request, "/api/admin/quant/status");
}

export const meta = () => [{ title: `量化工具 · ${SITE.name} 后台` }];

/** 数值输入留空按 0 算；上下限交给后端那一份约束去挡。 */
const toNum = (value: string) => (value === "" ? 0 : Number(value));

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

/** 一次运行在跑的是哪一类（从运行详情里读出来）。 */
const runKind = (detail: unknown) => {
  const mode = asRecord(detail).mode;
  return mode === "daily" ? "选股扫描" : mode === "backtest" ? `回测 · ${String(asRecord(detail).name ?? "")}` : "—";
};

/** 一个数值字段：标签 + 数字输入 + 范围提示。 */
function NumField({ label, value, onChange, min, max, step, hint }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; hint?: string }) {
  return (
    <Field label={label} hint={hint ?? `范围 ${min} – ${max}`}>
      <Input type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(toNum(e.target.value))} />
    </Field>
  );
}

const runColumns: Array<Column<QuantAdminStatus["runs"][number]>> = [
  { key: "id", label: "#", render: (r) => <span className="num text-ink-3">{r.id}</span> },
  { key: "s", label: "结果", render: (r) => <Badge tone={r.status === "ok" ? "ok" : r.status === "failed" ? "bad" : "muted"}>{r.status === "ok" ? "成功" : r.status === "failed" ? "失败" : "运行中"}</Badge> },
  { key: "kind", label: "类型", render: (r) => <span className="text-ink-2">{runKind(r.detail)}</span> },
  { key: "at", label: "开始", render: (r) => <Time at={r.startedAt} /> },
  { key: "d", label: "耗时", align: "right", render: (r) => duration(r.startedAt, r.finishedAt) },
  { key: "out", label: "输出 / 错误", render: (r) => (r.error ? <span className="text-[12px] text-hot">{r.error}</span> : <Json value={r.detail} label="输出" />) },
];

export default function AdminQuant({ loaderData: status }: { loaderData: QuantAdminStatus }) {
  const { run, pending } = useAdminAction();
  const [params, setParams] = useState<QuantParams>(status.defaults);
  const backtest = params.mode === "backtest";
  const ready = status.engine.ready;

  const set = <K extends keyof QuantParams>(key: K, value: QuantParams[K]) => setParams((p) => ({ ...p, [key]: value }));
  const setWeight = (key: keyof FactorWeights, value: number) => setParams((p) => ({ ...p, weights: { ...p.weights, [key]: value } }));

  return (
    <AdminPage
      title="量化工具"
      subtitle="手动配置参数并触发一次计算：选股扫描写当日候选，策略回测按配置名落一份快照。计算由站外的 Python 引擎执行，产物落到共享数据目录，公开页随即可读。"
    >
      <Card title="引擎状态" right={ready ? <Badge tone="ok">就绪</Badge> : <Badge tone="bad">未就绪</Badge>}>
        <KV
          items={[
            ["解释器", status.engine.python],
            ["引擎目录", status.engine.dir],
            ["入口脚本", status.engine.script],
          ]}
        />
        {!ready && <p className="mt-3 text-[13px] leading-relaxed text-hot">{status.engine.missing}</p>}
        <p className="mt-3 text-[12px] leading-relaxed text-ink-4">
          引擎（Python + akshare + stock-daily-analyzer）不随镜像发布；用环境变量 QUANT_ENGINE_DIR 指到它所在的目录，QUANT_PYTHON 指到解释器。
        </p>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="配置" right={backtest ? "策略回测" : "选股扫描"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="类型">
              <Select value={params.mode} onChange={(e) => set("mode", e.target.value as QuantParams["mode"])}>
                <option value="backtest">策略回测</option>
                <option value="daily">选股扫描（当日）</option>
              </Select>
            </Field>
            {backtest && (
              <Field label="配置名" hint="限 24 字，作为产物目录名，跑完可在策略回测页切换查看">
                <Input maxLength={PARAM_LIMITS.name} value={params.name} onChange={(e) => set("name", e.target.value)} placeholder="例如 主板周频轮动" />
              </Field>
            )}
            <Field label="股票池">
              <Select value={params.universe} onChange={(e) => set("universe", e.target.value as QuantParams["universe"])}>
                <option value="main">沪深主板</option>
                <option value="all">全部 A 股（不含创业板）</option>
              </Select>
            </Field>
            <NumField label="股票只数上限" value={params.maxStocks} min={PARAM_LIMITS.maxStocks.min} max={PARAM_LIMITS.maxStocks.max} onChange={(v) => set("maxStocks", v)} hint={`范围 ${PARAM_LIMITS.maxStocks.min} – ${PARAM_LIMITS.maxStocks.max}，按流动性截取`} />
            {backtest && (
              <>
                <Field label="起始日期">
                  <Input type="date" value={params.start} onChange={(e) => set("start", e.target.value)} />
                </Field>
                <Field label="结束日期" hint="留空表示到当天">
                  <Input type="date" value={params.end} onChange={(e) => set("end", e.target.value)} />
                </Field>
                <Field label="调仓频率" hint="W-FRI 每周五 / M 每月末 / D 每日">
                  <Select value={params.rebalance} onChange={(e) => set("rebalance", e.target.value as QuantParams["rebalance"])}>
                    <option value="W-FRI">每周五</option>
                    <option value="M">每月末</option>
                    <option value="D">每日收盘</option>
                  </Select>
                </Field>
                <NumField label="组合只数 top_k" value={params.topK} min={PARAM_LIMITS.topK.min} max={PARAM_LIMITS.topK.max} onChange={(v) => set("topK", v)} />
                <NumField label="单只权重上限" value={params.maxWeightPerName} min={PARAM_LIMITS.maxWeightPerName.min} max={PARAM_LIMITS.maxWeightPerName.max} step={0.05} onChange={(v) => set("maxWeightPerName", v)} hint={`0.02 – 1（0.15 即 15%）`} />
                <NumField label="回撤熔断阈值" value={params.maxDrawdownHalt} min={PARAM_LIMITS.maxDrawdownHalt.min} max={PARAM_LIMITS.maxDrawdownHalt.max} step={0.05} onChange={(v) => set("maxDrawdownHalt", v)} hint="0 表示不熔断；触及后清仓" />
              </>
            )}
          </div>

          {backtest && (
            <div className="mt-4">
              <div className="mb-2 text-[12.5px] font-medium text-ink-2">因子权重</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <NumField label="动量" value={params.weights.momentum} min={PARAM_LIMITS.weight.min} max={PARAM_LIMITS.weight.max} step={0.1} onChange={(v) => setWeight("momentum", v)} hint="正值偏好上涨" />
                <NumField label="波动" value={params.weights.volatility} min={PARAM_LIMITS.weight.min} max={PARAM_LIMITS.weight.max} step={0.1} onChange={(v) => setWeight("volatility", v)} hint="负值偏好低波动" />
                <NumField label="RSI" value={params.weights.rsi} min={PARAM_LIMITS.weight.min} max={PARAM_LIMITS.weight.max} step={0.1} onChange={(v) => setWeight("rsi", v)} hint="负值偏好偏弱" />
                <NumField label="量比" value={params.weights.volume_ratio} min={PARAM_LIMITS.weight.min} max={PARAM_LIMITS.weight.max} step={0.1} onChange={(v) => setWeight("volume_ratio", v)} hint="正值偏好放量" />
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="text-[12px] text-ink-4">{ready ? "一次运行要拉行情、跑引擎，可能十几分钟" : "引擎未就绪，先按上面的说明装好再提交"}</span>
            <div className="flex items-center gap-2">
              <Button tone="ghost" size="sm" disabled={pending === "quant-run"} onClick={() => setParams(status.defaults)}>重置</Button>
              <Button
                tone="primary"
                disabled={!ready}
                busy={pending === "quant-run"}
                onClick={() =>
                  run("POST", "/api/admin/quant/run", params, {
                    label: "quant-run",
                    success: backtest ? `已提交回测「${params.name}」，跑完在策略回测页查看` : "已提交选股扫描，跑完在选股信号页查看",
                  })
                }
              >
                提交运行
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="已有回测快照" right={status.snapshots.length}>
            {status.snapshots.length ? (
              <ul className="divide-y divide-line/70 text-[13.5px]">
                {status.snapshots.map((name) => (
                  <li key={name} className="flex items-center justify-between gap-3 py-2">
                    <span className="break-all font-mono text-ink">{name}</span>
                    <Link to={`${ROUTES.backtest}?name=${encodeURIComponent(name)}`} className="shrink-0 text-accent hover:underline">查看</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>数据目录里还没有回测产物，提交一次回测后出现在这里</Empty>
            )}
          </Card>

          <Card title="最近运行" right="quant.run" pad={false}>
            <DataTable rows={status.runs} columns={runColumns} rowKey={(r) => r.id} empty="还没有运行记录" />
          </Card>
        </div>
      </div>
    </AdminPage>
  );
}
