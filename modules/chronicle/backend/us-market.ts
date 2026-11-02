// 美股编年史子应用（historyofmarket）的数据集随仓库提交一份快照；这里定期从上游回源，把有变化的文件写到
// 数据目录（api 与 worker 共享的 AIHOT_DATA_DIR），接口优先读回源的那份、读不到再退回随包快照。
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT, config } from "@aihot/backend/config";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";

const UPSTREAM = "https://historyofmarket.com";

/** 随包数据集：historyofmarket/server/cache/api/**（117 个数据集，另有 _latest、profile 等几个）。 */
const shippedApi = () => path.join(REPO_ROOT, "historyofmarket", "server", "cache", "api");
/** 回源数据集所在目录，与随包目录同构（api/**）。 */
export const usFreshRoot = () => path.join(config.dataDir, "chronicle", "us-market");
const freshApi = () => path.join(usFreshRoot(), "api");

/** 上游一个文件（有 status 与 body 就够；guardedFetch 的 GuardedResponse 结构上兼容）。 */
export interface UpstreamFile { status: number; body: Buffer; text(): string }
type FetchJson = (url: string) => Promise<UpstreamFile>;

interface Dataset { key: string; url: string; sha256: string }
interface Manifest { generated_at?: string; datasets?: Dataset[] }

const sha256 = (body: Buffer) => createHash("sha256").update(body).digest("hex");

async function readIfPresent(file: string): Promise<Buffer | null> {
  try { return await readFile(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

async function writeAtomic(file: string, body: Buffer) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, body);
  await rename(`${file}.tmp`, file);
}

/** 随包里不在 manifest 上的文件（_latest、profile、tools、static 等），网页也会读同一条路径，一并回源。 */
async function uncoveredKeys(covered: ReadonlySet<string>): Promise<string[]> {
  const names = await readdir(shippedApi(), { recursive: true }).catch(() => [] as string[]);
  return names.filter((name) => name.endsWith(".json") && name !== "_manifest.json")
    .map((name) => name.slice(0, -".json".length).split(path.sep).join("/"))
    .filter((key) => !covered.has(key));
}

export interface UsMarketRefresh { generatedAt: string | null; updated: string[]; unchanged: number; failed: string[] }

/**
 * 按上游 manifest 的内容哈希回源：与手上这份相同的跳过，不同的下载并核对 sha256 后原子写入，
 * 某个文件失败只记下来、不影响其余。整份 manifest 变了就重下一次，所以除了首次，日常只搬变化的数据集。
 */
export async function refreshUsMarket(fetchJson: FetchJson = guardedFetch): Promise<UsMarketRefresh> {
  const response = await fetchJson(`${UPSTREAM}/api/_manifest.json`);
  if (response.status !== 200) throw new Error(`Upstream manifest HTTP ${response.status}`);
  const manifest = JSON.parse(response.text()) as Manifest;
  const datasets = manifest.datasets ?? [];
  if (!datasets.length) throw new Error("Upstream manifest has no datasets");
  const byKey = new Map(datasets.map((dataset) => [dataset.key, dataset]));
  const keys = [...byKey.keys(), ...(await uncoveredKeys(new Set(byKey.keys())))].sort();

  const updated: string[] = [], failed: string[] = [];
  let unchanged = 0;
  for (const key of keys) {
    const rel = `${key}.json`;
    const target = path.join(freshApi(), rel);
    const dataset = byKey.get(key);
    try {
      const local = (await readIfPresent(target)) ?? (await readIfPresent(path.join(shippedApi(), rel)));
      if (dataset && local && sha256(local) === dataset.sha256) { unchanged++; continue; }
      const body = await fetchJson(dataset?.url ?? `${UPSTREAM}/api/${rel}`);
      if (body.status !== 200) throw new Error(`HTTP ${body.status}`);
      if (dataset && sha256(body.body) !== dataset.sha256) throw new Error("sha256 mismatch");
      if (local?.equals(body.body)) { unchanged++; continue; }
      await writeAtomic(target, body.body);
      updated.push(rel);
    } catch { failed.push(rel); }
  }
  // 清单本身也留一份，接口发出去的 _manifest.json 才和数据集对得上。
  const manifestFile = path.join(freshApi(), "_manifest.json");
  if (!(await readIfPresent(manifestFile))?.equals(response.body)) await writeAtomic(manifestFile, response.body);
  const summary: UsMarketRefresh = { generatedAt: manifest.generated_at ?? null, updated, unchanged, failed };
  console.log(JSON.stringify({ msg: "chronicle us-market refresh", generatedAt: summary.generatedAt, updated: updated.length, unchanged, failed: failed.length }));
  return summary;
}
