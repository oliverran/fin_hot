// Temporary diagnostic runner. It samples OS counters outside the browser, without changing its work.
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, createWriteStream } from 'node:fs';
import { availableParallelism } from 'node:os';

const [output, ...args] = process.argv.slice(2);
if (!output || args.length === 0) throw new Error('Usage: node scripts/sample-webkit-processes.ts OUTPUT NODE_ARGS...');
const file = createWriteStream(output);
const read = (path: string) => { try { return readFileSync(path, 'utf8').trim(); } catch { return null; } };
const list = (path: string) => { try { return readdirSync(path); } catch { return []; } };
const write = (value: unknown) => file.write(JSON.stringify(value) + '\n');
const parseStat = (text: string) => {
  const end = text.lastIndexOf(')');
  const fields = text.slice(end + 2).split(/\s+/);
  return { name: text.slice(text.indexOf('(') + 1, end), state: fields[0], ppid: Number(fields[1]), user: Number(fields[11]), system: Number(fields[12]), threads: Number(fields[17]), start: Number(fields[19]), rss: Number(fields[21]) };
};
write({ kind: 'environment', at: Date.now(), parallelism: availableParallelism(), clockTicks: Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' })), pageSize: Number(execFileSync('getconf', ['PAGESIZE'], { encoding: 'utf8' })), cgroup: read('/proc/self/cgroup'), cgroupMounts: read('/proc/self/mountinfo')?.split('\n').filter(line => line.includes(' - cgroup')), schedstatsEnabled: read('/proc/sys/kernel/sched_schedstats'), rootCgroupCpuMax: read('/sys/fs/cgroup/cpu.max') });
const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
let previous = Date.now();
const sample = () => {
  const at = Date.now();
  const processes: unknown[] = [];
  const identities: unknown[] = [];
  for (const pid of list('/proc').filter(id => /^\d+$/.test(id))) {
    const raw = read(`/proc/${pid}/stat`);
    if (!raw) continue;
    const stat = parseStat(raw);
    identities.push({ pid: Number(pid), ppid: stat.ppid, name: stat.name, start: stat.start });
    if (!/^(WPE|WebKit|MiniBrowser|chrome|chromium)/.test(stat.name)) continue;
    const threads: unknown[] = [];
    if (!/^chrome|chromium/.test(stat.name)) for (const tid of list(`/proc/${pid}/task`)) {
      const task = read(`/proc/${pid}/task/${tid}/stat`);
      if (task) threads.push({ tid: Number(tid), ...parseStat(task), schedstat: read(`/proc/${pid}/task/${tid}/schedstat`), wchan: read(`/proc/${pid}/task/${tid}/wchan`) });
    }
    processes.push({ pid: Number(pid), ...stat, schedstat: read(`/proc/${pid}/schedstat`), threads });
  }
  write({ kind: 'sample', at, gap: at - previous, duration: Date.now() - at, cpu: read('/proc/stat')?.split('\n')[0], cpuPressure: read('/proc/pressure/cpu'), memoryPressure: read('/proc/pressure/memory'), rootCgroupCpu: read('/sys/fs/cgroup/cpu.stat'), identities, processes });
  previous = at;
};
sample();
const timer = setInterval(sample, 100);
child.on('error', error => { clearInterval(timer); write({ kind: 'error', at: Date.now(), error: String(error) }); file.end(); process.exitCode = 1; });
child.on('exit', (code, signal) => { clearInterval(timer); sample(); write({ kind: 'exit', at: Date.now(), code, signal }); file.end(); process.exitCode = code ?? 1; });
