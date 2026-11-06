import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import { createLabServer } from "../../../examples/selection-lab/server.ts";

test("offline tutorial: guided flow, score changes, interrupted requests, reset and download", async () => {
  const server = createLabServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    const outside: string[] = [];
    const errors: string[] = [];
    page.on("request", (req) => { if (!req.url().startsWith(base) && !req.url().startsWith("blob:")) outside.push(req.url()); });
    page.on("pageerror", (error) => errors.push(error.message));
    let initialize!: () => void;
    const initialization = new Promise<void>((resolve) => { initialize = resolve; });
    await page.route("**/api/example", async (route) => { await initialization; await route.continue(); });
    await page.goto(base);
    await page.getByRole("button", { name: "02 评分实验" }).click();
    await expect(page.getByLabel("第一次评分", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "媒体来源：差半分" })).toBeDisabled();
    initialize();
    await expect(page.getByLabel("第一次评分", { exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "01 原始材料" }).click();
    await expect(page.getByRole("heading", { name: "虚构交易所公布新的信息披露时间表", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await expect(page.locator("#decision")).toHaveText("达到评分候选门槛");
    await page.getByRole("button", { name: "媒体来源：差半分" }).click();
    await expect(page.locator("#decision")).toHaveText("未达到评分候选门槛");
    await expect(page.locator("#equation")).toContainText("151 < 2 × 76");
    await page.getByLabel("第二次评分", { exact: true }).fill("77");
    await expect(page.locator("#equation")).toContainText("152 ≥ 2 × 76");
    await page.getByRole("button", { name: "缺一次评分" }).click();
    await expect(page.locator("#shown")).toContainText("无");
    await page.getByLabel("评分状态", { exact: true }).selectOption("refused");
    await expect(page.locator("#decision")).toHaveText("未达到评分候选门槛");
    await page.getByLabel("信源分级", { exact: true }).selectOption("EXCLUDE_MP");
    await expect(page.locator("#equation")).toHaveText("该分级不参与精选评分。");

    // A slow old result must not overwrite the newest form input.
    let release!: () => void;
    let captured!: () => void;
    const seen = new Promise<void>((resolve) => { captured = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/evaluate?*", async (route) => {
      if (new URL(route.request().url()).searchParams.get("tier") === "T1") { captured(); await wait; }
      await route.continue();
    });
    await page.getByRole("button", { name: "官方来源：刚好够分" }).click();
    await seen;
    await page.getByRole("button", { name: "媒体来源：差半分" }).click();
    await expect(page.locator("#equation")).toContainText("151 < 2 × 76");
    const oldResponse = page.waitForResponse((r) => r.url().includes("tier=T1&"));
    release(); await oldResponse;
    await expect(page.locator("#equation")).toContainText("151 < 2 × 76");
    await page.unroute("**/api/evaluate?*");
    await page.route("**/api/evaluate?*", (route) => route.abort());
    await page.getByRole("button", { name: "官方来源：刚好够分" }).click();
    await expect(page.locator("#error")).toBeVisible();
    await expect(page.locator("#decision")).toHaveText("未能计算");
    await page.unroute("**/api/evaluate?*");
    await page.getByRole("button", { name: "官方来源：刚好够分" }).click();
    await expect(page.locator("#decision")).toHaveText("达到评分候选门槛");
    await expect(page.locator("#error")).toBeHidden();

    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await page.getByText("展开：摘要对应哪一句原文？", { exact: true }).click();
    await expect(page.locator("#evidence")).toContainText("15 个工作日");
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await expect(page.getByText("固定教学样例 · 非实际日报产物", { exact: true })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载合成样例 JSON" }).click();
    const file = await download;
    assert.equal(file.suggestedFilename(), "finhot-synthetic-example.json");
    const stream = await file.createReadStream();
    assert.ok(stream);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const sample = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    assert.equal(sample.kind, "synthetic-tutorial");
    assert.ok(sample.material.includes(sample.evidence));
    await page.getByRole("button", { name: "上一步", exact: true }).click();
    await page.getByRole("button", { name: "重置教程" }).click();
    await expect(page.getByRole("heading", { name: "先有证据，再做判断" })).toBeVisible();
    await page.getByRole("button", { name: "02 评分实验" }).click();
    await expect(page.locator("#equation")).toContainText("59 + 61 = 120");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.route("**/api/example", (route) => route.abort());
    await page.reload();
    await expect(page.locator("#data-error")).toBeVisible();
    await page.getByRole("button", { name: "02 评分实验" }).click();
    await expect(page.getByLabel("第一次评分", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "重置教程" })).toBeDisabled();
    assert.deepEqual(outside, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
