// Daily housekeeping: expired leases, old run history, feedback screenshots left behind and derived caches,
// and the site's modules' own periods (their server.ts retention).
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { POLICY } from "@aihot/site";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { expireFeedbackBans, pruneFeedbackSubmissionState, screenshotPath, screenshotsForwarded } from "./feedback.ts";
import { pruneReceipts } from "../providers/receipts.ts";
import { serverModules } from "../modules.ts";

/** Removes files under `dir` last written more than `maxAgeMs` ago. */
async function removeOlderThan(dir: string, maxAgeMs: number, now: number): Promise<number> {
  let removed = 0;
  const walk = async (d: string): Promise<void> => {
    const entries = await readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        await walk(p);
        continue;
      }
      const info = await stat(p).catch(() => null);
      if (info && now - info.mtimeMs > maxAgeMs) {
        await unlink(p).catch(() => {});
        removed += 1;
      }
    }
  };
  await walk(dir);
  return removed;
}

export async function dailyRetention(now = new Date()) {
  // The modules' periods first (their aggregates before their deletions, as the engine's).
  const modules: Record<string, unknown> = {};
  for (const m of serverModules()) if (m.retention) Object.assign(modules, await m.retention(now));
  const leases = await sql`DELETE FROM delivery_leases WHERE expires_at < ${now}`;
  const expiredFeedbackBans = await sql.begin(tx => expireFeedbackBans(tx, now));
  const expiredFeedbackState = await pruneFeedbackSubmissionState(now);
  // Scheduled-task history: 14 days (failures 90) is enough for the runs view.
  const runs = await sql`DELETE FROM job_runs WHERE started_at < ${new Date(now.getTime() - 14 * 86400_000)} AND (status IS DISTINCT FROM 'failed' OR started_at < ${new Date(now.getTime() - 90 * 86400_000)})`;
  // Paid-request receipts, with their attempts (receipt_attempts cascades) and any grouping receipt
  // reference on an article (ON DELETE SET NULL); the owner holds the period.
  const deletedReceipts = await pruneReceipts(now);
  const monthMs = 30 * 86400_000;
  const feedbackAge = POLICY.privacy.retentionDays * 86400_000;
  const expiredFeedback = await sql.begin(async tx => {
    const rows = await tx<{ screenshot_key: string | null }[]>`DELETE FROM feedback
      WHERE created_at < ${new Date(now.getTime() - feedbackAge)} RETURNING screenshot_key`;
    for (const row of rows) {
      const file = screenshotPath(row.screenshot_key);
      if (file) await unlink(file).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw e; });
    }
    return rows.count;
  });
  // Local attachments are created at submission. The directory sweep also covers orphaned files.
  const screenshotAge = screenshotsForwarded() ? Math.min(feedbackAge, 8 * 86400_000) : feedbackAge;
  const deletedScreenshots = await removeOlderThan(path.join(config.dataDir, "feedback-screenshots"), screenshotAge, now.getTime());
  // Derived caches (proxied images, share cards and posters) are rebuilt on demand.
  const prunedCache = (await removeOlderThan(path.join(config.dataDir, "imgcache"), monthMs, now.getTime())) + (await removeOlderThan(path.join(config.dataDir, "ogcache"), monthMs, now.getTime()));
  return {
    ...modules,
    deletedLeases: leases.count,
    expiredFeedbackBans,
    expiredFeedbackState,
    deletedJobRuns: runs.count,
    deletedReceipts,
    deletedFeedback: expiredFeedback,
    deletedScreenshots,
    prunedCache,
  };
}
