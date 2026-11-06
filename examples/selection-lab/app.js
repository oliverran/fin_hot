const $ = (id) => document.getElementById(id);
const panels = [...document.querySelectorAll('[data-panel]')];
const steps = [...document.querySelectorAll('[data-step]')];
const form = $('scores');
let current = 0;
let version = 0;
let sample;
function navigate(step) {
  current = step;
  panels.forEach((panel, index) => { panel.hidden = index !== step; });
  steps.forEach((button, index) => {
    if (index === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  $('previous').disabled = step === 0;
  $('next').disabled = step === panels.length - 1;
  $('progress').textContent = `${step + 1} / ${panels.length}`;
}
async function readJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('无法加载教程。请确认本地服务仍在运行，然后重试或刷新页面。');
  return response.json();
}
function showError(error) { $('error').textContent = error.message; $('error').hidden = false; }
async function update() {
  const request = ++version;
  $('first-value').value = form.elements.first.value;
  $('second-value').value = form.elements.second.value;
  $('decision').textContent = '正在计算…';
  $('equation').textContent = '';
  $('shown').textContent = '';
  $('result-note').textContent = '';
  try {
    const result = await readJson(`/api/evaluate?${new URLSearchParams(new FormData(form))}`);
    if (request !== version) return;
    $('error').hidden = true;
    $('decision').textContent = result.passesScoreGate ? '达到评分候选门槛' : '未达到评分候选门槛';
    $('equation').textContent = result.threshold === null ? '该分级不参与精选评分。' : result.sum === null ? '评分缺失或被拒绝，不计算候选资格。' : `${result.first} + ${result.second} = ${result.sum} ${result.passesScoreGate ? '≥' : '<'} 2 × ${result.threshold}`;
    $('shown').textContent = `页面展示分：${result.shownScore ?? '无'}（完整评分的平均值向下取整）`;
    $('result-note').textContent = result.note;
  } catch (error) {
    if (request !== version) return;
    $('decision').textContent = '未能计算';
    showError(error);
  }
}
steps.forEach((button) => button.addEventListener('click', () => navigate(Number(button.dataset.step))));
$('previous').addEventListener('click', () => navigate(Math.max(0, current - 1)));
$('next').addEventListener('click', () => navigate(Math.min(panels.length - 1, current + 1)));
form.addEventListener('submit', (event) => event.preventDefault());
form.addEventListener('input', update);
function apply(values) {
  for (const [key, value] of Object.entries(values)) form.elements[key].value = String(value);
  update();
}
const presets = {
  boundary: { tier: 'T1', first: 59, second: 61, status: 'complete' },
  below: { tier: 'T2', first: 75, second: 76, status: 'complete' },
  missing: { tier: 'T1', first: 100, second: 100, status: 'missing' },
};
document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => apply(presets[button.dataset.preset])));
$('reset').addEventListener('click', () => { if (!sample) return; navigate(0); apply(sample.defaults); });
$('download').disabled = true;
$('download').addEventListener('click', () => {
  if (!sample) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(sample, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'finhot-synthetic-example.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
(async () => {
  try {
    sample = await readJson('/api/example');
    for (const [id, value] of Object.entries({ title: sample.title, source: `${sample.source} · ${sample.date}`, 'source-url': sample.url, material: sample.material, grouping: sample.grouping, evidence: sample.evidence, 'brief-title': sample.title, 'brief-summary': sample.summary })) $(id).textContent = value;
    $('inputs').disabled = false;
    apply(sample.defaults);
    $('reset').disabled = false;
    $('download').disabled = false;
    document.querySelectorAll('[data-preset]').forEach((button) => { button.disabled = false; });
  } catch (error) {
    $('data-error').textContent = '样例未加载，评分实验暂不可用。请确认本地服务仍在运行，然后刷新页面。';
    $('data-error').hidden = false;
  }
})();
