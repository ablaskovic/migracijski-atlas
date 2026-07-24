#!/usr/bin/env node
/* Verification protocol for the atlas (32 checks, hard numbers derived independently
   from the raw DZS/Pitoski sources — "looks fine" is not a result).
   Usage:
     node scripts/verify.cjs dist          # serve ./dist and check the production build
     node scripts/verify.cjs http://...    # check an already-running server (e.g. vite dev)
   Needs puppeteer: `npm i -D puppeteer` (not a default devDep to spare the Chrome download),
   or point PUPPETEER_PATH at an existing install. */
const path = require('path');
const fs = require('fs');
const http = require('http');

let puppeteer;
try { puppeteer = require('puppeteer'); }
catch {
  try { puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer'); }
  catch { console.error('puppeteer not found: npm i -D puppeteer  (or set PUPPETEER_PATH)'); process.exit(2); }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serve(dir) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(dir, p);
      fs.readFile(f, (err, data) => {
        if (err) { res.writeHead(404); res.end('nope'); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

const NBSP = s => s.replace(/\u00a0/g, ' ');
let fails = 0, n = 0;
function ck(name, cond, extra = '') {
  n++;
  if (cond) console.log('  ok  ' + name);
  else { fails++; console.log('FAIL  ' + name + (extra ? '  [' + extra + ']' : '')); }
}
const settle = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const arg = process.argv[2] || 'dist';
  let url = arg, srv = null;
  if (!/^https?:/.test(arg)) {
    const dir = path.resolve(arg);
    if (!fs.existsSync(path.join(dir, 'index.html'))) { console.error('no index.html in ' + dir + ' — run `npm run build` first'); process.exit(2); }
    ({ srv, url } = await serve(dir));
  }

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(url, { waitUntil: 'networkidle0' });
  await settle(500);
  const click = async sel => { await page.click(sel); await settle(80); };

  /* ── geometry (winding-bug guards) ── */
  const geo = await page.evaluate(() => {
    const svg = document.querySelector('#map');
    const W = svg.clientWidth, H = svg.clientHeight;
    const paths = [...document.querySelectorAll('.cnt')];
    let maxFrac = 0;
    const bb = {};
    for (const p of paths) {
      const b = p.getBBox();
      bb[p.dataset.iso] = b;
      maxFrac = Math.max(maxFrac, (b.width * b.height) / (W * H));
    }
    return { n: paths.length, maxFrac, istraRight: bb['HR-18'].x + bb['HR-18'].width, vukLeft: bb['HR-16'].x };
  });
  ck('21 county paths', geo.n === 21, String(geo.n));
  ck('max county bbox <= 5% of canvas (no winding blowup)', geo.maxFrac <= 0.05, geo.maxFrac.toFixed(4));
  ck('Istarska is west of Vukovarsko-srijemska', geo.istraRight < geo.vukLeft);

  const railTexts = () => page.evaluate(() =>
    [...document.querySelectorAll('#railList .rrow')].map(r => ({
      n: r.querySelector('.rname').textContent, v: r.querySelector('.rval').textContent })));

  /* ── default saldo rail, kum 2011–2024 ── */
  let rows = await railTexts();
  ck('saldo rail top = Grad Zagreb +41.986',
    rows[0].n === 'Grad Zagreb' && rows[0].v === '+41.986', rows[0].n + ' ' + rows[0].v);

  /* ── citizenship panel at year 2024 ── */
  await click('#citzHd');
  const citz = await page.evaluate(() => ({
    open: document.querySelector('#citz').classList.contains('open'),
    rects: document.querySelectorAll('#citzSvg rect').length,
    rows: document.querySelector('#citzRows').textContent,
    note: document.querySelector('#citzNote').textContent }));
  ck('citz panel opens', citz.open);
  ck('citz has stacked bars for 5 years x groups (>=40 rects)', citz.rects >= 40, String(citz.rects));
  ck('citz 2024 totals +70.391 / −38.997 / saldo +31.394',
    citz.rows.includes('+70.391') && citz.rows.includes('\u221238.997') && citz.rows.includes('+31.394'));
  ck('citz 2024 Azija +26.601', citz.rows.includes('+26.601'));
  ck('citz source note names STAN-2026-2-1', citz.note.includes('STAN-2026-2-1'));

  /* ── prirodno / ukupna promjena flows ── */
  await click('#segFlow button[data-v="nat"]');
  rows = await railTexts();
  ck('nat rail: best county Međimurska −1.782 (all counties negative)',
    rows[0].n === 'Međimurska' && rows[0].v === '\u22121.782', rows[0].n + ' ' + rows[0].v);
  ck('nat rail: worst = Primorsko-goranska −22.890',
    rows[20].n === 'Primorsko-goranska' && rows[20].v === '\u221222.890', rows[20].n + ' ' + rows[20].v);
  ck('nat rail: every value negative', rows.every(r => r.v.startsWith('\u2212')));
  const legNat = await page.evaluate(() => document.querySelector('#legend').textContent);
  ck('legend names prirodni prirast', legNat.includes('prirodni prirast'));

  await click('#segFlow button[data-v="all"]');
  rows = await railTexts();
  ck('all rail top-3 = GZ +27.521 / Istarska +11.531 / Zadarska +3.292',
    rows[0].n === 'Grad Zagreb' && rows[0].v === '+27.521' &&
    rows[1].n === 'Istarska' && rows[1].v === '+11.531' &&
    rows[2].n === 'Zadarska' && rows[2].v === '+3.292',
    rows.slice(0, 3).map(r => r.n + ' ' + r.v).join(' | '));
  ck('all rail bottom = Osječko-baranjska −48.271',
    rows[20].n === 'Osječko-baranjska' && rows[20].v === '\u221248.271', rows[20].n + ' ' + rows[20].v);

  /* tooltip decomposition rows (hover Istarska) */
  await page.hover('path[data-iso="HR-18"]');
  await settle(80);
  const tip = await page.evaluate(() => document.querySelector('#tip').textContent);
  ck('tooltip shows migracije +22.537 (Istarska kum)', NBSP(tip).includes('+22.537'), tip.slice(0, 60));
  ck('tooltip shows prirodni prirast −11.006', NBSP(tip).includes('\u221211.006'));
  ck('tooltip shows ukupna promjena +11.531', NBSP(tip).includes('+11.531'));
  await page.mouse.move(4, 4);
  await settle(60);

  /* detail card dashed nat line */
  await click('path[data-iso="HR-18"]');
  const dash = await page.evaluate(() =>
    !!document.querySelector('#cardSvg path[stroke-dasharray="3 3"]'));
  ck('detail card has dashed prirodni prirast line', dash);
  await click('#cardX');

  /* ── klas view counts ── */
  await click('#segFlow button[data-v="tot"]');
  await click('#segView button[data-v="klas"]');
  const klasLeg = await page.evaluate(() => document.querySelector('#legend').textContent);
  ck('klas counts 7 / 5 / 9 at thr 4.500',
    klasLeg.includes('pobjednice · 7') && klasLeg.includes('neutralne · 5') && klasLeg.includes('gubitnice · 9'), klasLeg);

  /* ── regije rail (kum 2011–2024) ── */
  await click('#segView button[data-v="reg"]');
  rows = await railTexts();
  const regExp = [['Zagrebačka regija', '+55.281'], ['Sjevernojadranska', '+26.987'], ['Dalmatinska', '+18.419'],
    ['Središnja Hrvatska', '\u221246.669'], ['Istočna', '\u221297.195']];
  ck('regije rail values match reference set',
    regExp.every((e, i) => rows[i].n === e[0] && rows[i].v === e[1]),
    rows.map(r => r.n + ' ' + r.v).join(' | '));

  /* ── tokovi 2018 godišnje, HR-21 odlasci ── */
  await click('#segMode button[data-v="yr"]');
  await click('#segView button[data-v="flow"]');
  const yr = await page.evaluate(() => document.querySelector('#bigYear').textContent);
  ck('flow view auto-jumps to 2018 in godišnje', yr === '2018.', yr);
  rows = await railTexts();
  ck('flow HR-21 odlasci top-3 = Zagrebačka 2.311 / Splitsko-dalm. 469 / Primorsko-gor. 447',
    rows[0].n === 'Zagrebačka' && rows[0].v === '2.311' &&
    rows[1].n === 'Splitsko-dalmatinska' && rows[1].v === '469' &&
    rows[2].n === 'Primorsko-goranska' && rows[2].v === '447',
    rows.slice(0, 3).map(r => r.n + ' ' + r.v).join(' | '));
  const badge = await page.evaluate(() => document.querySelector('#legend').textContent);
  ck('flow legend badge = izmjereno', badge.includes('Izmjereno'));

  /* ── JLS drill ── */
  await click('#jcardHd');
  let drill = await page.evaluate(() => ({
    title: document.querySelector('#jcardTitle').textContent,
    cap: document.querySelector('#jcardCap').textContent,
    first: document.querySelector('#jcardList .jrow')?.textContent || '' }));
  ck('drill open for Grad Zagreb, cap says 2018 izmjereno',
    drill.title.includes('Grad Zagreb') && drill.cap.includes('2018.') && drill.cap.includes('izmjereno'), drill.cap);
  ck('drill HR-21 top corridor = Grad Zagreb → Velika Gorica 426',
    drill.first.includes('Grad Zagreb') && drill.first.includes('Velika Gorica') && drill.first.includes('426'), drill.first);
  await click('#jlsTabs button[data-v="loc"]');
  const locEmpty = await page.evaluate(() => document.querySelector('#jcardList').textContent);
  ck('drill HR-21 unutar = empty-state note', locEmpty.includes('Jedna JLS'), locEmpty.slice(0, 50));
  await click('path[data-iso="HR-17"]');
  drill = await page.evaluate(() => document.querySelector('#jcardList .jrow')?.textContent || '');
  ck('drill HR-17 unutar top = Split → Solin 354',
    drill.includes('Split') && drill.includes('Solin') && drill.includes('354'), drill);
  await click('#segView button[data-v="saldo"]');
  const hidden = await page.evaluate(() => getComputedStyle(document.querySelector('#jcard')).display);
  ck('drill card hidden outside flow view', hidden === 'none', hidden);

  /* ── PNG export ── */
  const png = await page.evaluate(async () => {
    const r = await window.__exportPNG(false);
    const svg = document.querySelector('#map');
    return { ...r, expW: svg.clientWidth * 2, expH: (svg.clientHeight + 174) * 2 };
  });
  ck('exportPNG dims = 2x map + bands', png.w === png.expW && png.h === png.expH,
    png.w + 'x' + png.h + ' vs ' + png.expW + 'x' + png.expH);
  ck('exportPNG produces a real blob (>50 KB)', png.bytes > 50000, String(png.bytes));

  /* ── errors ── */
  ck('zero page/console errors', errors.length === 0, errors.join(' ; ').slice(0, 300));

  await browser.close();
  if (srv) srv.close();
  console.log(fails === 0 ? `\nALL ${n} CHECKS PASS` : `\n${fails}/${n} CHECKS FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('harness error:', e); process.exit(2); });
