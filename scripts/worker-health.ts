import { hostname } from "node:os";
import { sql, closeDb } from "@aihot/backend/db";

try {
  const [row] = await sql`SELECT value FROM settings WHERE key = 'heartbeat.worker'`;
  const beat = row?.value;
  if (!beat || beat.host !== hostname() || !Number.isFinite(Date.parse(beat.at))
    || Date.now() - Date.parse(beat.at) > 180_000) process.exitCode = 1;
} catch { process.exitCode = 1; }
finally { await closeDb(); }
