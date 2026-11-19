// Reuse site categories and chart copy in the native clients.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { PUBLIC_API_CATEGORY_KEYS, CATEGORY_LABELS } from "../packages/contracts/src/taxonomy.ts";
import { PAGES, LIVE_CHARTS } from "../modules/chronicle/catalog.ts";
import { androidChronicle } from "./android-chronicle.ts";

const kinds = new Set(["index", "drawdown", "annual", "rolling", "volatility", "annual-vol", "relative"]);
const pages = PAGES.filter((page) => LIVE_CHARTS.some((chart) => chart.group === page.group && chart.slug === page.slug && kinds.has(chart.kind)));
await writeFile(new URL("../apps/ios/Resources/chronicle.json", import.meta.url), JSON.stringify(pages, null, 2) + "\n");
console.log(`Synced ${pages.length} native chart entries.`);

const categories = PUBLIC_API_CATEGORY_KEYS.map((key) => ({ key, label: CATEGORY_LABELS[key] }));
await writeFile(new URL("../apps/ios/Resources/categories.json", import.meta.url), JSON.stringify(categories, null, 2) + "\n");
console.log(`Synced ${categories.length} public categories.`);

const androidAssets = new URL("../apps/android/app/src/main/assets/", import.meta.url);
await mkdir(androidAssets, { recursive: true });
await writeFile(new URL("../apps/ios/Resources/chronicle-reading.json", import.meta.url), JSON.stringify(androidChronicle(pages), null, 2) + "\n");
await Promise.all(["categories.json", "chronicle.json", "chronicle-reading.json"].map(async (name) => {
  await writeFile(new URL(name, androidAssets), await readFile(new URL(`../apps/ios/Resources/${name}`, import.meta.url)));
}));
await Promise.all(["terms", "privacy"].map(async (name) => {
  await writeFile(new URL(`${name}.md`, androidAssets), await readFile(new URL(`../site/pages/${name}.md`, import.meta.url)));
}));
console.log("Synced Android assets from the same site sources.");
