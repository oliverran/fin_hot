// 图表选项：十一种类型的 JSON 各自出什么图，以及不认得的类型按折线处理（与原项目一致）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { LIGHT_THEME, chartOption, type ChronicleData } from "../web/options.ts";

const data = (type: string, series: unknown): ChronicleData => ({ meta: { id: "t", name: "测试图", type }, series });
const option = (type: string, series: unknown) => chartOption(data(type, series), LIGHT_THEME) as unknown as {
  series: Array<{ type: string; stack?: string; areaStyle?: unknown }>;
  yAxis?: { max?: number };
};

const line = [{ date: "2024-01-02", value: 1 }, { date: "2024-01-03", value: 2 }];
const named = { dates: ["2024-01-02"], seriesData: { A: [1], B: [2] } };

test("每种类型出它自己的图", () => {
  assert.deepEqual(option("bar", line).series.map((s) => s.type), ["bar"]);
  assert.deepEqual(option("distribution-bar", { bins: ["0-10"], counts: [3] }).series.map((s) => s.type), ["bar"]);
  assert.deepEqual(option("range-bar", [{ year: "2024", final: 0.1, intrayear: -0.2 }]).series.map((s) => s.type), ["bar", "bar"]);
  assert.deepEqual(option("stacked-bar-dual", [{ year: "2024", total: 1, eps: 0.5, pe: 0.5 }]).series.map((s) => s.type), ["bar", "bar", "scatter"]);
  assert.deepEqual(option("heatmap", { data: [[0, 0, 1]], years: ["2024"], months: ["1月"] }).series.map((s) => s.type), ["heatmap"]);
  // 多线图与堆叠面积图：一个系列名一条线，堆叠的带 stack。
  assert.deepEqual(option("multi-line", named).series.map((s) => s.type), ["line", "line"]);
  const stacked = option("stacked-area", named).series;
  assert.deepEqual(stacked.map((s) => s.type), ["line", "line"]);
  assert.ok(stacked.every((s) => s.stack === "total" && s.areaStyle));
  // 估值图是 PE 加三条参考线。
  assert.equal(option("valuation", [{ date: "2024-01-02", value: 12, mean: 11, plus1: 14, minus1: 8 }]).series.length, 4);
});

test("回撤图从 0 往下画", () => {
  const drawdown = option("drawdown", line);
  assert.equal(drawdown.yAxis?.max, 0);
  assert.deepEqual(drawdown.series.map((s) => s.type), ["line"]);
  assert.ok(drawdown.series[0]!.areaStyle, "回撤要填色");
});

test("不认得的类型按折线处理", () => {
  assert.deepEqual(option("something-new", line).series.map((s) => s.type), ["line"]);
});
