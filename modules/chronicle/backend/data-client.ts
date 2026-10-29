import { credential } from '@aihot/backend/config';
export type DataRow = Record<string, unknown>;
export type DataRequest = (api: string, params: Record<string, unknown>) => Promise<DataRow[]>;

export const requestData: DataRequest = async (api_name, params) => {
  const token = credential('collectors', 'TUSHARE_TOKEN');
  if (!token) throw new Error('TUSHARE_TOKEN is required');
  const response = await fetch(process.env.TUSHARE_BASE_URL || 'https://api.tushare.pro', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ api_name, token, params }), signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status} (${api_name})`);
  const body = await response.json() as { code: number; data?: { fields: string[]; items: unknown[][] } };
  if (body.code !== 0 || !Array.isArray(body.data?.fields) || !Array.isArray(body.data?.items)) throw new Error(`Invalid provider response (${api_name})`);
  return body.data.items.map(row => Object.fromEntries(body.data!.fields.map((key, i) => [key, row[i]])));
};

/** Bound pagination and reject endpoints that ignore offset; never publish a silently truncated universe. */
export async function allRows(api: string, params: Record<string, unknown>, request = requestData): Promise<DataRow[]> {
  const result: DataRow[] = [];
  let previous = '';
  for (let offset = 0; offset < 200_000; offset += 1000) {
    const rows = await request(api, { ...params, limit: 1000, offset });
    const signature = JSON.stringify(rows);
    if (rows.length && signature === previous) throw new Error(`Pagination did not advance (${api})`);
    result.push(...rows);
    if (rows.length < 1000) return result;
    previous = signature;
  }
  throw new Error(`Pagination limit reached (${api})`);
}
export function providerDate(value: unknown): string {
  const raw = String(value);
  if (!/^\d{8}$/.test(raw)) throw new Error('Invalid provider date');
  const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`;
  if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Invalid provider date');
  return date;
}
export const compactDate = (date: string) => date.replaceAll('-', '');
export const finite = (v: unknown): number | null => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
export const positive = (v: unknown) => { const n = finite(v); return n !== null && n > 0 ? n : null; };
export function mergeDates<T extends { date: string }>(old: T[], fresh: T[]): T[] {
  return [...new Map([...old, ...fresh].map(row => [row.date, row])).values()].sort((a, b) => a.date.localeCompare(b.date));
}
