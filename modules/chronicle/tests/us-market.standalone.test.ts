import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { REPO_ROOT, config } from '@aihot/backend/config';
import { refreshUsMarket, usFreshRoot, type UpstreamFile } from '../backend/us-market.ts';

const sha256 = (body: Buffer) => createHash('sha256').update(body).digest('hex');
const shipped = (rel: string) => path.join(REPO_ROOT, 'historyofmarket/server/cache/api', rel);

test('美股数据集按上游 manifest 的哈希回源：未变的不下载、校验不过的不落盘', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'aihot-us-market-'));
  const before = config.dataDir;
  config.dataDir = dataDir;
  try {
    const current = readFileSync(shipped('aiae.json'));
    const fresh = Buffer.from(JSON.stringify({ mark: 'new' }));
    const manifest = {
      generated_at: '2026-10-31T10:47:22.543198+00:00',
      datasets: [
        { key: 'aiae', url: 'https://historyofmarket.com/api/aiae.json', sha256: sha256(current) },
        { key: 'consumer/definitions', url: 'https://historyofmarket.com/api/consumer/definitions.json', sha256: '0'.repeat(64) },
        { key: 'test/new', url: 'https://historyofmarket.com/api/test/new.json', sha256: sha256(fresh) },
      ],
    };
    const calls: string[] = [];
    const fetchJson = async (url: string): Promise<UpstreamFile> => {
      calls.push(url);
      if (url.endsWith('/api/_manifest.json')) return { status: 200, body: Buffer.from(JSON.stringify(manifest)), text: () => JSON.stringify(manifest) };
      if (url.endsWith('/api/test/new.json')) return { status: 200, body: fresh, text: () => fresh.toString('utf8') };
      if (url.endsWith('/api/consumer/definitions.json')) return { status: 200, body: Buffer.from('{}'), text: () => '{}' };
      return { status: 404, body: Buffer.alloc(0), text: () => '' };
    };

    const first = await refreshUsMarket(fetchJson);
    assert.equal(first.generatedAt, '2026-10-31T10:47:22.543198+00:00');
    assert.deepEqual(first.updated, ['test/new.json']);
    assert.equal(first.unchanged, 1); // aiae 的哈希没变，一次都没下载
    assert.ok(first.failed.includes('consumer/definitions.json'));
    assert.equal(JSON.parse(readFileSync(path.join(usFreshRoot(), 'api/test/new.json'), 'utf8')).mark, 'new');
    assert.equal(existsSync(path.join(usFreshRoot(), 'api/consumer/definitions.json')), false);
    assert.ok(existsSync(path.join(usFreshRoot(), 'api/_manifest.json')));
    const downloads = calls.filter((url) => url.endsWith('/api/test/new.json')).length;

    const second = await refreshUsMarket(fetchJson);
    assert.deepEqual(second.updated, []);
    assert.equal(calls.filter((url) => url.endsWith('/api/test/new.json')).length, downloads); // 已回源过的也不再下
    assert.ok(calls.every((url) => !url.endsWith('/api/aiae.json')));
  } finally {
    config.dataDir = before;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
