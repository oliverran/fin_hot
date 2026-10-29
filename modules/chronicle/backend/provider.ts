import { beijingDate, beijingTime } from '@aihot/contracts/time';
import { DATA_INDICES } from '../data-indices.ts';
import { allRows, requestData, providerDate, compactDate, positive, mergeDates, type DataRequest } from './data-client.ts';
import { readSnapshot, saveSnapshot } from './snapshots.ts';
export interface ProviderIndex {
  code: string; name: string; kind: string; classification?: string; peBasis?: string;
  bars: Array<{ date: string; close: number }>;
  valuations: Array<{ date: string; pe: number | null; pb: number | null }>;
  syncedAt?: string; lastFullSync?: string; error?: string;
}
export interface ProviderSnapshot {
  updatedAt: string; source: string; indices: ProviderIndex[];
  calendar?: string[]; calendarThrough?: string; expectedDate?: string; errors?: string[];
}
export function expectedTradingDate(calendar: string[], now: Date): string | undefined {
  const today = beijingDate(now), afterClose = beijingTime(now) >= '19:00';
  return calendar.filter(date => date < today || (afterClose && date === today)).at(-1);
}
export function syncStart(index: ProviderIndex, now: Date, first: string): string {
  // Reconcile the complete series once each month; otherwise refetch a seven-calendar-day overlap.
  if (!index.lastFullSync || index.lastFullSync.slice(0, 7) !== beijingDate(now).slice(0, 7) || !index.bars.length) return first;
  return new Date(Date.parse(index.bars.at(-1)!.date) - 7 * 86400000).toISOString().slice(0, 10);
}
export async function refreshProvider(request: DataRequest = requestData, now = new Date()): Promise<ProviderSnapshot> {
  const old = await readProvider();
  const today = beijingDate(now), year = Number(today.slice(0, 4));
  const errors: string[] = [];
  let calendar = old?.calendar ?? [], calendarThrough = old?.calendarThrough;
  try {
    const days = await allRows('trade_cal', { exchange: 'SSE', start_date: '20200101', end_date: `${year}1231` }, request);
    calendar = days.filter(row => Number(row.is_open) === 1).map(row => providerDate(row.cal_date)).sort();
    if (!calendar.length) throw new Error('Empty trading calendar');
    calendarThrough = `${year}-12-31`;
  } catch { errors.push('交易日历同步失败，保留上次日历'); }
  let sectors: Array<{ code: string; name: string; kind: string; classification: string }> = [];
  try {
    const rows = await allRows('index_classify', { level: 'L1', src: 'SW2021' }, request);
    sectors = rows.filter(row => row.level === 'L1' && row.src === 'SW2021' && Number(row.is_pub) === 1)
      .map(row => ({ code: String(row.index_code), name: String(row.industry_name), kind: 'sector', classification: 'SW2021-L1' }));
    if (!sectors.length) throw new Error('Empty industry universe');
  } catch { errors.push('申万行业目录同步失败，保留已同步行业');
    sectors = (old?.indices ?? []).filter(x => x.classification === 'SW2021-L1').map(x => ({ ...x, classification: 'SW2021-L1' })); }
  const definitions = [...DATA_INDICES.filter(x => x.kind === 'broad'), ...sectors];
  const indices: ProviderIndex[] = [];
  for (const definition of definitions) {
    const previous = old?.indices.find(x => x.code === definition.code);
    let index: ProviderIndex = previous ? { ...previous, ...definition } : { ...definition, bars: [], valuations: [] };
    const first = definition.kind === 'sector' ? '2021-01-01' : '2020-01-01';
    const start = syncStart(index, now, first);
    const bars: ProviderIndex['bars'] = [], valuations: ProviderIndex['valuations'] = [];
    try {
      for (let y = Number(start.slice(0, 4)); y <= year; y++) {
        const from = y === Number(start.slice(0, 4)) ? start : `${y}-01-01`;
        const to = y === year ? today : `${y}-12-31`;
        const params = { ts_code: definition.code, start_date: compactDate(from), end_date: compactDate(to) };
        const sector = definition.kind === 'sector';
        const rows = await allRows(sector ? 'sw_daily' : 'index_daily', params, request);
        for (const row of rows) {
          const date = providerDate(row.trade_date), close = positive(row.close);
          if (row.ts_code !== definition.code || date < from || date > to || close === null) throw new Error('Invalid or out-of-range quote');
          bars.push({ date, close });
        }
        const valueRows = sector ? rows : await allRows('index_dailybasic', params, request);
        for (const row of valueRows) {
          const date = providerDate(row.trade_date);
          if (row.ts_code !== definition.code || date < from || date > to) throw new Error('Invalid valuation range');
          valuations.push({ date, pe: positive(sector ? row.pe : row.pe_ttm), pb: positive(row.pb) });
        }
      }
      if (!bars.length) throw new Error('No quotes returned');
      index = { ...index, bars: mergeDates(index.bars, bars), valuations: mergeDates(index.valuations, valuations),
        peBasis: definition.kind === 'sector' ? '申万 PE（供应商口径）' : 'PE-TTM', syncedAt: now.toISOString(), error: undefined,
        lastFullSync: start === first ? today : index.lastFullSync };
    } catch { index.error = '本次同步失败，保留最后成功数据'; errors.push(`${definition.code} 同步失败`); }
    indices.push(index);
    console.log(JSON.stringify({ msg: 'chronicle index sync', code: index.code, rows: index.bars.length, ok: !index.error }));
  }
  const snapshot: ProviderSnapshot = { updatedAt: now.toISOString(), source: 'Tushare Pro（用户配置服务）', indices,
    calendar, calendarThrough, expectedDate: calendarThrough && calendarThrough >= today ? expectedTradingDate(calendar, now) : undefined, errors };
  await saveSnapshot('provider', snapshot);
  return snapshot;
}
export async function readProvider(): Promise<ProviderSnapshot|null> {
  const snapshot=await readSnapshot<ProviderSnapshot>('provider');
  if(snapshot){const now=new Date();snapshot.expectedDate=snapshot.calendarThrough && snapshot.calendarThrough>=beijingDate(now)?expectedTradingDate(snapshot.calendar??[],now):undefined;}
  return snapshot;
}
