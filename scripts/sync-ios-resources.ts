// Reuse site categories and chart copy in the native clients.
import { load } from "cheerio";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { PUBLIC_API_CATEGORY_KEYS, CATEGORY_LABELS } from "../packages/contracts/src/taxonomy.ts";
import { PAGES, LIVE_CHARTS } from "../modules/chronicle/catalog.ts";
import { androidChronicle } from "./android-chronicle.ts";
import { parseCopyFile, renderMarkdown } from "../apps/web/app/lib/markdown.ts";

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

// Bundle one offline document for both native readers, using the website's copy format.
const policies = await Promise.all(["terms", "privacy"].map(async (file) => {
  const raw = await readFile(new URL(`../site/pages/${file}.md`, import.meta.url), "utf8");
  const { title, meta, intro, body } = parseCopyFile(raw.replace(/\r\n/g, "\n"));
  const $ = load(renderMarkdown(body, "").html, null, false);
  type Run = { text: string; url?: string };
  const sections: { heading: string; paragraphs: Run[][] }[] = [];
  for (const block of $.root().children()) {
    if (block.name === "h2") {
      sections.push({ heading: $(block).text(), paragraphs: [] });
      continue;
    }
    const section = sections.at(-1);
    if (!section || block.name !== "p") throw new Error("Unsupported policy block in " + file + ": " + block.name);
    section.paragraphs.push($(block).contents().toArray().map((node) => {
      if (node.type === "text") return { text: node.data };
      if (node.type === "tag" && node.name === "a") return { text: $(node).text(), url: node.attribs.href };
      throw new Error("Unsupported inline policy content in " + file);
    }));
  }
  return [file, { title, metadata: Object.entries(meta).map(([label, value]) => ({ label, value })), intro, sections }];
}));
const shared = new URL("../apps/mobile-resources/", import.meta.url);
await mkdir(shared, { recursive: true });
await writeFile(new URL("policies.json", shared), JSON.stringify(Object.fromEntries(policies), null, 2) + "\n");
console.log("Synced native assets from the same site sources.");
