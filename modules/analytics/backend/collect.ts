// 访客明细的写入：每次页面浏览或关键入口点击一行，只存随机访客号，不含 IP、账号或用户代理。
import { sql } from "@aihot/backend/db";
import { beijingDate } from "@aihot/contracts/time";
import { groupOf } from "./groups.ts";

/** 事件种类：一次页面浏览，或一次关键入口点击。 */
export type EventKind = "pageview" | "click" | "open";
export type AnalyticsClient = "ios" | "android" | "mobile-web" | "web";
export function analyticsClient(agent = ""): AnalyticsClient {
  if (agent.startsWith("FinHOT-iOS/")) return "ios";
  if (agent.startsWith("FinHOT-Android/")) return "android";
  return /Mobile|Android|iPhone|iPad/i.test(agent) ? "mobile-web" : "web";
}

export interface AnalyticsEvent {
  kind: EventKind;
  path: string;
  /** 点击的入口名（导航项、卡片上的文字）；浏览时为 null。 */
  label: string | null;
  visitor: string;
}

const PATH_MAX = 200;
const LABEL_MAX = 24;
const VISITOR = /^[A-Za-z0-9_-]{8,64}$/;

/** 读一条上报的事件；不认得的字段组合整个丢掉，不落库。 */
export function readEvent(body: unknown, client: AnalyticsClient = "web"): AnalyticsEvent | null {
  if (!body || typeof body !== "object") return null;
  const { kind, path, label, visitor } = body as Record<string, unknown>;
  if (kind !== "pageview" && kind !== "click" && kind !== "open") return null;
  if (kind === "open" && (path !== "/" || (client !== "ios" && client !== "android"))) return null;
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.length > PATH_MAX || /\s/.test(path)) return null;
  if (typeof visitor !== "string" || !VISITOR.test(visitor)) return null;
  const text = typeof label === "string" ? label.trim().replace(/\s+/g, " ").slice(0, LABEL_MAX) : "";
  if (kind === "click" && !text) return null;
  return { kind, path, label: kind === "click" ? text : null, visitor };
}

/** 落一行；板块名由地址算出来，不由上报方决定。 */
export async function recordEvent(event: AnalyticsEvent, now = new Date(), client: AnalyticsClient = "web"): Promise<void> {
  await sql`INSERT INTO analytics_events (day, at, kind, path, module, label, visitor, client)
    VALUES (${beijingDate(now)}, ${now}, ${event.kind}, ${event.path}, ${groupOf(event.path)}, ${event.label}, ${event.visitor}, ${client})`;
}
