import { sql } from "../db.ts";
import { seatedCondition } from "./scope.ts";

/** Historical selected news, using the same publication visibility as RSS and v1. */
export async function chronicleNews(start: string, end: string) {
  return sql<{ id: string; title: string; date: string; url: string }[]>`
    SELECT p.article_id AS id, p.title, to_char(p.sort_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS date, p.url
    FROM publications p WHERE ${seatedCondition(new Date())}
    AND p.sort_at >= ${new Date(start + 'T00:00:00+08:00')}
    AND p.sort_at < ${new Date(new Date(end + 'T00:00:00+08:00').getTime() + 86400000)}
    ORDER BY p.sort_at DESC, p.article_id LIMIT 100`;
}
