// Temporary PR #4 probe of the existing Playwright assertion. No added browser command, polling,
// wait or changed assertion result. npm ci restores the dependency on every normal install.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
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
// Preserve the actionability result while returning timestamps through its existing protocol reply.
bundle=once(bundle,
  `          const result2 = await progress2.race(this.evaluateInUtility(async ([injected, node, { elementStates: elementStates2 }]) => {
            return await injected.checkElementStates(node, elementStates2);
          }, { elementStates }));`,
  `          const packet = await progress2.race(this.evaluateInUtility(async ([injected, node, { elementStates: elementStates2, stabilityProbe }]) => {
            const probe = stabilityProbe ? { timeOrigin: performance.timeOrigin, stages: [{ stage: 'entry', at: performance.now() }] } : undefined;
            const result = await injected.checkElementStates(node, elementStates2, probe);
            probe?.stages.push({ stage: 'outer-resumed', at: performance.now() });
            return probe ? { result, __navigationStabilityTrace: probe } : result;
          }, { elementStates, stabilityProbe: !!this._frame._page.__navigationStabilityProbe }));
          const result2 = packet && typeof packet === 'object' && '__navigationStabilityTrace' in packet ? packet.result : packet;`);
const match=bundle.match(/source4 = ('.*');\n/);
assert.ok(match,'Expected known injected-script string');
let injected=vm.runInNewContext(match[1]) as string;
const begin=injected.indexOf('  async checkElementStates(node, states) {');
const end=injected.indexOf('  _createAriaRefEngine()',begin);
assert.ok(begin>=0&&end>begin);
let methods=injected.slice(begin,end);
methods=once(methods,'async checkElementStates(node, states)', 'async checkElementStates(node, states, probe)');
methods=once(methods,'const stableResult = await this._checkElementIsStable(node);', `const stableResult = await this._checkElementIsStable(node, probe);
      probe?.stages.push({ stage: 'stable-resumed', at: this.utils.builtins.performance.now(), result: stableResult });`);
methods=once(methods,'        const result = this.elementState(node, state);', `        probe?.stages.push({ stage: 'state-start', at: this.utils.builtins.performance.now(), state });
        const result = this.elementState(node, state);
        probe?.stages.push({ stage: 'state-end', at: this.utils.builtins.performance.now(), state, matches: result.matches });`);
methods=once(methods,'async _checkElementIsStable(node)', 'async _checkElementIsStable(node, probe)');
methods=once(methods,'    const continuePolling = Symbol("continuePolling");', `    probe?.stages.push({ stage: 'stable-entry', at: this.utils.builtins.performance.now(), required: this._stableRafCount });
    const continuePolling = Symbol("continuePolling");`);
methods=once(methods,'      const clientRect = element.getBoundingClientRect();', `      probe?.stages.push({ stage: 'rect-start', at: this.utils.builtins.performance.now() });
      const clientRect = element.getBoundingClientRect();
      probe?.stages.push({ stage: 'rect-end', at: this.utils.builtins.performance.now(), rect: { x: clientRect.top, y: clientRect.left, width: clientRect.width, height: clientRect.height } });`);
methods=once(methods,'    const raf = () => {', `    const raf = (timestamp) => {
      probe?.stages.push({ stage: 'raf-entry', at: this.utils.builtins.performance.now(), timestamp });`);
methods=once(methods,'        const success = check();', `        const success = check();
        probe?.stages.push({ stage: 'raf-checked', at: this.utils.builtins.performance.now(), result: success === continuePolling ? 'continue' : success, counter: stableRafCounter });`);
methods=once(methods,'        else\n          this.utils.builtins.requestAnimationFrame(raf);', `        else {
          probe?.stages.push({ stage: 'raf-request', at: this.utils.builtins.performance.now() });
          this.utils.builtins.requestAnimationFrame(raf);
        }`);
methods=once(methods,'    this.utils.builtins.requestAnimationFrame(raf);\n    return result;', `    probe?.stages.push({ stage: 'raf-request', at: this.utils.builtins.performance.now() });
    this.utils.builtins.requestAnimationFrame(raf);
    return result;`);
injected=injected.slice(0,begin)+methods+injected.slice(end);
bundle=once(bundle,match[0],`source4 = ${JSON.stringify(injected)};\n`);
writeFileSync(file,bundle);
console.log('Installed temporary assertion-stage probe for Playwright1.61.1');
