// Temporary PR #4 probe of the existing Playwright assertion. No added browser command, polling,
// wait or changed assertion result. npm ci restores the dependency on every normal install.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require=createRequire(import.meta.url);
const root=dirname(require.resolve('playwright-core/package.json'));
assert.equal(JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version,'1.61.1');
const file=join(root,'lib/coreBundle.js');
let bundle=readFileSync(file,'utf8');
function once(text:string,before:string,after:string){
  assert.equal(text.split(before).length,2,'Expected exactly one known Playwright source fragment');
  return text.replace(before,()=>after);
}
bundle=once(bundle,
  '          const elements = info2 ? injected2.querySelectorAll(info2.parsed, document) : [];',
  `          const probe = options2.expression === 'to.be.visible' && JSON.stringify(info2?.parsed).includes('固定正文')
            ? { timeOrigin: performance.timeOrigin, stages: [{ stage: 'entry', at: performance.now() }] } : undefined;
          const elements = info2 ? injected2.querySelectorAll(info2.parsed, document) : [];
          probe?.stages.push({ stage: 'query-done', at: performance.now(), count: elements.length });`);
bundle=once(bundle,
  '          return { log: log3, ...await injected2.expect(elements[0], options2, elements) };',
  `          probe?.stages.push({ stage: 'expect-start', at: performance.now() });
          const promise = injected2.expect(elements[0], options2, elements);
          probe?.stages.push({ stage: 'expect-promise-created', at: performance.now() });
          const result = await promise;
          probe?.stages.push({ stage: 'expect-resumed', at: performance.now() });
          return { log: log3, ...result, __navigationExpectTrace: probe };`);
writeFileSync(file,bundle);
console.log('Installed temporary assertion-stage probe for Playwright1.61.1');
