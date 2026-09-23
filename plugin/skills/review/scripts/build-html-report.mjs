#!/usr/bin/env node
// Builds a self-contained HTML page from Claude's review: overall summary, then
// every diff (regressions and uncertain ones first) with its verdict, explanation
// and the expected / actual / diff close-ups embedded as data URIs.
//
// Usage: node build-html-report.mjs <manifest.json> [--open]
//   Reads the suggestions file referenced by the manifest (suggestionsPath) and
//   writes diffscope-review.html next to it. --open opens it in the browser.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const VERDICTS = {
  reject: { label: 'Needs changes', order: 0 },
  unsure: { label: 'Unsure', order: 1 },
  approve: { label: 'Approve', order: 2 },
};
const CATEGORIES = {
  intended: 'Intended change',
  regression: 'Likely regression',
  noise: 'Rendering noise',
  unknown: 'Unclear',
};

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function dataUri(file) {
  if (!file || !fs.existsSync(file)) return null;
  return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
}

function imageTriplet(images, caption) {
  const cells = ['expected', 'actual', 'diff'].map(kind => {
    const src = dataUri(images?.[kind]);
    return `<figure class="shot">
      <figcaption>${kind}</figcaption>
      ${src ? `<img src="${src}" alt="${kind}">` : '<div class="missing">not available</div>'}
    </figure>`;
  }).join('');
  return `<div class="region">${caption ? `<div class="region-caption">${esc(caption)}</div>` : ''}<div class="shots">${cells}</div></div>`;
}

function diffCard(diff, s) {
  const verdict = VERDICTS[s?.verdict] ? s.verdict : 'unsure';
  // Close-ups when the extractor found changed regions, full screenshots otherwise.
  const regions = diff.regions?.length
    ? diff.regions.map((r, i) => imageTriplet(r.images, diff.regions.length > 1 ? `Region ${i + 1}` : '')).join('')
    : imageTriplet(diff.images, '');
  const files = (s?.relatedFiles || []).map(f => `<code>${esc(f)}</code>`).join(' ');

  return `<article class="card ${verdict}" data-verdict="${verdict}">
    <header>
      <span class="verdict">${esc(VERDICTS[verdict].label)}</span>
      <h3>${esc(diff.snapshot)}</h3>
      <span class="chip">${esc(diff.viewport)}</span>
      ${diff.suite ? `<span class="chip">${esc(diff.suite)}</span>` : ''}
      ${s?.group ? `<span class="chip group">${esc(s.group)}</span>` : ''}
    </header>
    ${s ? `<p class="meta">${esc(CATEGORIES[s.category] || CATEGORIES.unknown)} · ${esc(s.confidence || 'low')} confidence${diff.changedPixels != null ? ` · ${diff.changedPixels.toLocaleString('en-US')} changed px` : ''}</p>` : '<p class="meta">No suggestion for this diff.</p>'}
    ${s?.summary ? `<p class="summary">${esc(s.summary)}</p>` : ''}
    ${s?.details ? `<p class="details">${esc(s.details)}</p>` : ''}
    ${files ? `<p class="files">${files}</p>` : ''}
    ${regions}
  </article>`;
}

function render(manifest, suggestions) {
  const byId = new Map((suggestions.suggestions || []).map(s => [s.id, s]));
  const rows = manifest.diffs
    .map(diff => ({ diff, s: byId.get(diff.id) }))
    .sort((a, b) =>
      VERDICTS[a.s?.verdict ?? 'unsure'].order - VERDICTS[b.s?.verdict ?? 'unsure'].order
      || (a.s?.group ?? '').localeCompare(b.s?.group ?? '')
      || a.diff.snapshot.localeCompare(b.diff.snapshot));

  const counts = { reject: 0, unsure: 0, approve: 0 };
  for (const { s } of rows) counts[VERDICTS[s?.verdict] ? s.verdict : 'unsure']++;

  const filters = [['all', `All ${rows.length}`], ...Object.entries(VERDICTS).map(([v, { label }]) => [v, `${label} ${counts[v]}`])]
    .map(([v, label], i) => `<button type="button" class="filter ${v}${i === 0 ? ' active' : ''}" data-filter="${v}">${esc(label)}</button>`)
    .join('');

  const total = rows.length || 1;
  const tiles = Object.entries(VERDICTS).map(([v, { label }]) => `<div class="tile ${v}">
      <span class="tile-count">${counts[v]}</span>
      <span class="tile-label">${esc(label)}</span>
    </div>`).join('');
  const split = Object.keys(VERDICTS)
    .filter(v => counts[v] > 0)
    .map(v => `<span class="split-${v}" style="width:${(counts[v] / total) * 100}%"></span>`)
    .join('');

  const generatedAt = suggestions.generatedAt ? new Date(suggestions.generatedAt).toLocaleString('en-GB') : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diffscope review</title>
<style>
  :root {
    --bg: #f6f7f9; --panel: #ffffff; --text: #16181d; --muted: #5f6673; --border: #e2e5ea;
    --green: #15803d; --green-bg: #dcfce7; --red: #b91c1c; --red-bg: #fee2e2; --amber: #a16207; --amber-bg: #fef3c7;
    --accent: #6d28d9; --accent-bg: #f3eefe; --accent-border: #d9c8fb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d0e11; --panel: #16181d; --text: #e8eaee; --muted: #9aa1ad; --border: #2a2e36;
      --green: #4ade80; --green-bg: #0f2a1a; --red: #f87171; --red-bg: #2d1414; --amber: #fbbf24; --amber-bg: #2b2210;
      --accent: #c4b5fd; --accent-bg: #1c1530; --accent-border: #3b2d66;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1200px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 20px; word-break: break-all; }
  .overview { background: linear-gradient(135deg, var(--accent-bg), var(--panel) 70%); border: 1px solid var(--accent-border); border-radius: 14px; padding: 20px; margin-bottom: 20px; }
  .overview-label { color: var(--accent); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px; }
  .overview-text { font-size: 17px; line-height: 1.6; margin: 0 0 18px; }
  .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .tile { border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; background: var(--amber-bg); color: var(--amber); }
  .tile.reject { background: var(--red-bg); color: var(--red); }
  .tile.approve { background: var(--green-bg); color: var(--green); }
  .tile-count { font-size: 32px; font-weight: 800; line-height: 1.1; }
  .tile-label { font-size: 13px; font-weight: 600; }
  .split { display: flex; height: 8px; border-radius: 999px; overflow: hidden; margin-top: 14px; background: var(--border); }
  .split-reject { background: var(--red); }
  .split-unsure { background: var(--amber); }
  .split-approve { background: var(--green); }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; position: sticky; top: 0; padding: 10px 0; background: var(--bg); z-index: 1; }
  .filter { border: 1px solid var(--border); background: var(--panel); color: var(--text); border-radius: 999px; padding: 6px 14px; font: inherit; cursor: pointer; }
  .filter.active { border-color: var(--text); font-weight: 600; }
  .card { background: var(--panel); border: 1px solid var(--border); border-left: 4px solid var(--amber); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .card.reject { border-left-color: var(--red); }
  .card.approve { border-left-color: var(--green); }
  .card header { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .card h3 { margin: 0; font-size: 16px; }
  .verdict { font-size: 12px; font-weight: 700; border-radius: 6px; padding: 2px 8px; background: var(--amber-bg); color: var(--amber); }
  .reject .verdict { background: var(--red-bg); color: var(--red); }
  .approve .verdict { background: var(--green-bg); color: var(--green); }
  .chip { font-size: 12px; color: var(--muted); border: 1px solid var(--border); border-radius: 6px; padding: 1px 8px; }
  .chip.group { color: var(--text); }
  .meta { color: var(--muted); font-size: 13px; margin: 8px 0 4px; }
  .summary { font-weight: 600; margin: 4px 0; }
  .details { color: var(--muted); margin: 4px 0; }
  .files code { font-size: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; }
  .region { margin-top: 12px; }
  .region-caption { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  .shots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .shot { margin: 0; min-width: 0; }
  .shot figcaption { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-bottom: 4px; }
  .shot img { display: block; max-width: 100%; max-height: 420px; border: 1px solid var(--border); border-radius: 6px; cursor: zoom-in; }
  .missing { color: var(--muted); font-size: 12px; border: 1px dashed var(--border); border-radius: 6px; padding: 24px 8px; text-align: center; }
  .lightbox { position: fixed; inset: 0; background: rgba(0, 0, 0, .85); display: none; align-items: center; justify-content: center; padding: 16px; z-index: 10; cursor: zoom-out; }
  .lightbox.open { display: flex; }
  .lightbox img { max-width: 100%; max-height: 100%; background: #fff; }
  .hidden { display: none; }
  @media (max-width: 700px) {
    .shots { grid-template-columns: 1fr; }
    .overview-text { font-size: 15px; }
    .tile-count { font-size: 26px; }
  }
</style>
</head>
<body>
<main>
  <h1>Diffscope review</h1>
  <p class="sub">${esc(manifest.report)}${generatedAt ? ` · ${esc(generatedAt)}` : ''}</p>
  <section class="overview">
    <div class="overview-label">✦ Claude's review · ${rows.length} diff${rows.length === 1 ? '' : 's'}</div>
    ${suggestions.summary ? `<p class="overview-text">${esc(suggestions.summary)}</p>` : ''}
    <div class="tiles">${tiles}</div>
    <div class="split">${split}</div>
  </section>
  <nav class="filters">${filters}</nav>
  ${rows.map(({ diff, s }) => diffCard(diff, s)).join('\n')}
</main>
<div class="lightbox" id="lightbox"><img alt=""></div>
<script>
  const cards = document.querySelectorAll('.card');
  document.querySelectorAll('.filter').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach(b => b.classList.toggle('active', b === btn));
    cards.forEach(c => c.classList.toggle('hidden', btn.dataset.filter !== 'all' && c.dataset.verdict !== btn.dataset.filter));
  }));
  const box = document.getElementById('lightbox');
  document.querySelectorAll('.shot img').forEach(img => img.addEventListener('click', () => {
    box.querySelector('img').src = img.src;
    box.classList.add('open');
  }));
  box.addEventListener('click', () => box.classList.remove('open'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') box.classList.remove('open'); });
</script>
</body>
</html>
`;
}

function openInBrowser(file) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]]
    : process.platform === 'darwin' ? ['open', [file]]
    : ['xdg-open', [file]];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

function main() {
  const args = process.argv.slice(2);
  const manifestPath = args.find(a => !a.startsWith('--'));
  if (!manifestPath) {
    console.error('Usage: node build-html-report.mjs <manifest.json> [--open]');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!fs.existsSync(manifest.suggestionsPath)) {
    throw new Error(`Suggestions file not found: ${manifest.suggestionsPath}`);
  }
  const suggestions = JSON.parse(fs.readFileSync(manifest.suggestionsPath, 'utf8'));

  const out = path.join(path.dirname(manifest.suggestionsPath), 'diffscope-review.html');
  fs.writeFileSync(out, render(manifest, suggestions));
  console.log(out);
  if (args.includes('--open')) openInBrowser(out);
}

try {
  main();
} catch (err) {
  console.error(`build-html-report: ${err.message}`);
  process.exit(1);
}
