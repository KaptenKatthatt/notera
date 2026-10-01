// Measures what the theme effects cost while typing: Neon OMG (dark), effects on vs off.
//   xvfb-run -a node test/perf/effects-bench.mjs [theme] [mode] [rounds]
// Per run: types the same text at a steady pace, then sits idle, and reports
//   - renderer main-thread time (CDP Performance.getMetrics: TaskDuration, with script, style,
//     layout and paint-recording parts) per typed character and per idle second;
//   - CPU time of every Electron process (app.getAppMetrics), which includes raster and
//     compositing in the GPU process;
//   - input latency: Event Timing durations of the keydowns (input to next frame).
// Not part of npm run e2e; the numbers go into PR bodies.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [theme = 'neon-omg', mode = 'dark', rounds = '2'] = process.argv.slice(2);
// Ablation: BENCH_EFFECTS (JSON merged over the theme's notera.effects) and BENCH_CSS (extra CSS)
// run the "on" case in a user theme that extends the one measured.
const ablate = process.env.BENCH_EFFECTS || process.env.BENCH_CSS;
const onlyOn = !!process.env.BENCH_ONLY_ON;
const TEXT = 'Det här är en vanlig rad som skrivs i lugn takt, med några ord till. ';
const CHARS = 240;
const DELAY = 45; // ms between keys: about 22 characters a second
const IDLE_MS = 4000;

const body = Array.from({ length: 40 }, (_, i) => (i % 8 === 0 ? `## Rubrik ${i}` : `Rad ${i}: ${TEXT.repeat(2)}`)).join('\n\n');

async function run(effects) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-bench-'));
  const ud = path.join(tmp, 'ud');
  fs.mkdirSync(ud);
  const file = path.join(tmp, 'Bench.md');
  fs.writeFileSync(file, `# Mätning\n\n${body}\n`);
  let id = theme;
  if (ablate) {
    id = 'bench-variant';
    fs.mkdirSync(path.join(ud, 'themes', id), { recursive: true });
    fs.writeFileSync(path.join(ud, 'themes', id, 'theme.json'), JSON.stringify({
      name: 'Bench', extends: theme, ...(process.env.BENCH_CSS ? { style: 'style.css' } : {}),
      notera: { effects: JSON.parse(process.env.BENCH_EFFECTS || '{}') }
    }));
    if (process.env.BENCH_CSS) fs.writeFileSync(path.join(ud, 'themes', id, 'style.css'), process.env.BENCH_CSS);
  }
  fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({
    language: 'sv', checkUpdates: false, theme: id, mode, effects, autosave: false, viewMode: 'editor', windowBounds: { width: 1280, height: 800 }
  }));
  const app = await electron.launch({ args: [root, file], env: { ...process.env, NOTERA_USER_DATA: ud } });
  const win = await app.firstWindow();
  await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
  await win.evaluate(() => document.fonts.ready);
  await win.click('.cm-content');
  await win.keyboard.press('Control+End');
  await win.evaluate(() => {
    window.__lat = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'keydown') window.__lat.push(e.duration); })
      .observe({ type: 'event', durationThreshold: 16, buffered: false });
    window.__keys = 0;
    addEventListener('keydown', () => { window.__keys++; }, true);
  });
  await win.waitForTimeout(1500);
  const cdp = await win.context().newCDPSession(win);
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const cpu = async () => {
    const all = await app.evaluate(({ app: a }) => a.getAppMetrics().map((p) => ({ type: p.type, cpu: p.cpu.cumulativeCPUUsage })));
    const by = {};
    for (const p of all) by[p.type] = (by[p.type] || 0) + (p.cpu || 0);
    return by;
  };
  const diff = (a, b) => Object.fromEntries(Object.keys(b).map((k) => [k, (b[k] || 0) - (a[k] || 0)]));

  const m0 = await metrics(); const c0 = await cpu(); const t0 = Date.now();
  const text = TEXT.repeat(Math.ceil(CHARS / TEXT.length)).slice(0, CHARS);
  for (const ch of text) { await win.keyboard.type(ch); await win.waitForTimeout(DELAY); }
  const m1 = await metrics(); const c1 = await cpu(); const t1 = Date.now();
  await win.waitForTimeout(IDLE_MS);
  const m2 = await metrics(); const c2 = await cpu(); const t2 = Date.now();
  const lat = await win.evaluate(() => window.__lat);
  await win.evaluate(() => { for (const t of window.__notera.tabs) { t.dirty = false; t.savedDoc = t.state.doc; } });
  await app.close();
  const typing = diff(m0, m1), idle = diff(m1, m2);
  const ms = (s) => s * 1000;
  return {
    typingSec: (t1 - t0) / 1000,
    mainPerChar: ms(typing.TaskDuration) / CHARS,
    scriptPerChar: ms(typing.ScriptDuration) / CHARS,
    stylePerChar: ms(typing.RecalcStyleDuration) / CHARS,
    layoutPerChar: ms(typing.LayoutDuration) / CHARS,
    mainBusyTyping: typing.TaskDuration / ((t1 - t0) / 1000),
    mainBusyIdle: idle.TaskDuration / ((t2 - t1) / 1000),
    cpuTyping: diff(c0, c1), cpuIdle: diff(c1, c2),
    cpuTypingTotal: Object.values(diff(c0, c1)).reduce((a, b) => a + b, 0) / ((t1 - t0) / 1000),
    cpuIdleTotal: Object.values(diff(c1, c2)).reduce((a, b) => a + b, 0) / ((t2 - t1) / 1000),
    slowKeys: lat.length, worstKey: lat.length ? Math.max(...lat) : 0,
    p90Key: lat.length ? lat.sort((a, b) => a - b)[Math.floor(lat.length * 0.9)] : 0
  };
}

const f = (n, d = 2) => n.toFixed(d);
const results = { on: [], off: [] };
for (let i = 0; i < +rounds; i++) {
  if (!onlyOn) results.off.push(await run(false));
  results.on.push(await run(true));
}
const avg = (arr, k) => (arr.length ? arr.reduce((a, r) => a + r[k], 0) / arr.length : NaN);
const pct = (by, sec) => JSON.stringify(Object.fromEntries(Object.entries(by).filter(([, v]) => v > 0.005).map(([k, v]) => [k, Math.round((v / sec) * 100)])));
console.log(`theme ${theme} (${mode}), ${CHARS} chars at ${DELAY} ms, ${rounds} rounds, means`);
console.log('                           effects off   effects on');
for (const [k, label, d, mul] of [
  ['mainPerChar', 'main thread ms / char', 2, 1], ['scriptPerChar', '  script ms / char', 2, 1], ['stylePerChar', '  style ms / char', 2, 1],
  ['layoutPerChar', '  layout ms / char', 2, 1], ['mainBusyTyping', 'main busy % typing', 1, 100], ['mainBusyIdle', 'main busy % idle', 1, 100],
  ['cpuTypingTotal', 'CPU % all procs typing', 0, 100], ['cpuIdleTotal', 'CPU % all procs idle', 0, 100],
  ['slowKeys', 'keydowns > 16 ms', 0, 1], ['p90Key', 'p90 slow keydown ms', 0, 1], ['worstKey', 'worst keydown ms', 0, 1]
]) console.log(label.padEnd(27), f(avg(results.off, k) * mul, d).padStart(11), f(avg(results.on, k) * mul, d).padStart(12));
for (const [k, r] of Object.entries(results)) if (r[0]) console.log(`CPU % by process, ${k}: typing ${pct(r[0].cpuTyping, r[0].typingSec)}, idle ${pct(r[0].cpuIdle, IDLE_MS / 1000)}`);
