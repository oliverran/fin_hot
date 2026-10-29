import type { QuoteBar } from './quotes.ts';

export function compareBars(inputs: Array<{ name: string; bars: QuoteBar[] }>, start: string, end: string) {
  const filtered = inputs.map(x => ({ ...x, bars: x.bars.filter(b => b.date >= start && b.date <= end) }));
  const calendars = filtered.map(x => new Set(x.bars.map(b => b.date)));
  const dates = filtered.length ? filtered[0]!.bars.map(b => b.date).filter(d => calendars.every(days => days.has(d))) : [];
  const seriesData: Record<string, number[]> = {};
  const summaries = filtered.map(x => {
    const byDate = new Map(x.bars.map(b => [b.date, b.close]));
    const values = dates.map(d => byDate.get(d)!);
    if (values.length < 2) return { name: x.name, count: values.length, change: null, drawdown: null, volatility: null };
    let peak = values[0]!, drawdown = 0;
    const returns: number[] = [];
    values.forEach((v,i) => { peak=Math.max(peak,v); drawdown=Math.min(drawdown,(v/peak-1)*100); if(i) returns.push(Math.log(v/values[i-1]!)); });
    const mean = returns.reduce((a,b)=>a+b,0)/returns.length;
    seriesData[x.name]=values.map(v=>v/values[0]!*100);
    return {name:x.name,count:values.length,change:(values.at(-1)!/values[0]!-1)*100,drawdown,
      volatility: returns.length > 1 ? Math.sqrt(returns.reduce((a,b)=>a+(b-mean)**2,0)/(returns.length-1)*252)*100 : null};
  });
  return { dates, seriesData, summaries };
}
