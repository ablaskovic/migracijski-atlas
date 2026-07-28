#!/usr/bin/env node
/* Verification protocol for the atlas (hard numbers derived independently from
   the raw DZS/Pitoski sources — "looks fine" is not a result). The final line
   prints the executed check count; every feature addition extends this file.
   Usage:
     node scripts/verify.cjs dist          # serve ./dist and check the production build
     node scripts/verify.cjs http://...    # check an already-running server (e.g. vite dev)
   Needs puppeteer: `npm i -D puppeteer` (not a default devDep to spare the Chrome download),
   or point PUPPETEER_PATH at an existing install. */
const path = require('path');
const fs = require('fs');
const http = require('http');

/* PUPPETEER_PATH is a path to a puppeteer *package directory*; the old fallback
   was `require(process.env.PUPPETEER_PATH || 'puppeteer')`, i.e. it retried the
   exact require that had just failed and could never have helped. A pre-existing
   *Chrome* is puppeteer's own PUPPETEER_EXECUTABLE_PATH, honoured at launch. */
let puppeteer;
try { puppeteer = require('puppeteer'); }
catch {
  try {
    if (!process.env.PUPPETEER_PATH) throw new Error('no PUPPETEER_PATH');
    puppeteer = require(process.env.PUPPETEER_PATH);
  } catch {
    console.error('puppeteer not found: npm i -D puppeteer'
      + '\n  (or set PUPPETEER_PATH to a puppeteer package dir,'
      + '\n   and/or PUPPETEER_EXECUTABLE_PATH to an existing Chrome)');
    process.exit(2);
  }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serve(dir) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.resolve(dir, '.' + path.posix.normalize('/' + p));
      /* localhost-only and test-scoped, but `..%2f..%2f` still read outside dist */
      if (f !== dir && !f.startsWith(dir + path.sep)) { res.writeHead(403); res.end('no'); return; }
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
/* Kept in module scope so the exit path can always reach them. There was no
   try/finally: any throw \u2014 and most DOM regressions surface here as a throw,
   because `querySelector(...).textContent` throws rather than returning falsy \u2014
   went to the outer .catch and called process.exit(2) without closing either,
   orphaning a Chromium and leaking a listening socket on every failed run. */
let browser = null, srv = null;
/* pinned by the last check in the file; update deliberately, like the DOM contract */
const EXPECTED_CHECKS = 221;
async function finish(code) {
  try { if (browser) await browser.close(); } catch { /* already gone */ }
  try { if (srv) srv.close(); } catch { /* already gone */ }
  console.log(fails === 0 ? `\nALL ${n} CHECKS PASS` : `\n${fails}/${n} CHECKS FAILED`);
  /* exitCode rather than exit(): with 190+ log lines, process.exit truncates a
     pending stdout flush when the output is redirected to a file or a pipe */
  process.exitCode = code !== undefined ? code : (fails ? 1 : 0);
}
function ck(name, cond, extra = '') {
  n++;
  if (cond) console.log('  ok  ' + name);
  else { fails++; console.log('FAIL  ' + name + (extra ? '  [' + extra + ']' : '')); }
}
const settle = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const arg = process.argv[2] || 'dist';
  let url = arg;
  if (!/^https?:/.test(arg)) {
    const dir = path.resolve(arg);
    if (!fs.existsSync(path.join(dir, 'index.html'))) { console.error('no index.html in ' + dir + ' — run `npm run build` first'); process.exit(2); }
    ({ srv, url } = await serve(dir));
  }

  browser = await puppeteer.launch({ args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  /* index.html loads Oswald + IBM Plex from fonts.googleapis.com, and
     `waitUntil: 'networkidle0'` waited on it — so the suite depended on the
     network, and at least four checks are font-metric-dependent (header
     height, scrubber tick clipping, the exported-SVG title fit, PNG dims). A
     box with no egress silently measured the Arial Narrow fallback instead.
     Stub the host so every run measures the same fallback, deterministically. */
  await page.setRequestInterception(true);
  let fontReqs = 0;
  /* one handler only — a second `page.on('request')` makes both call continue()
     on the same request and puppeteer throws "Request is already handled" */
  let blockGeoChunk = false;
  page.on('request', r => {
    const u = r.url();
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) { fontReqs++; return r.respond({ status: 200, contentType: 'text/css', body: '' }); }
    if (blockGeoChunk && /geo_jls/.test(u)) return r.abort();
    return r.continue();
  });
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
  await click('#segDir button[data-v="out"]');   /* Smjer: Odlasci — no longer the default */
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

  /* ── SVG export (vector twin) ── */
  const svgDoc = await page.evaluate(() => window.__exportSVG(false));
  ck('exportSVG returns a document with 21 baked county paths',
    typeof svgDoc === 'string' && svgDoc.length > 20000 && (svgDoc.match(/class="cnt/g) || []).length === 21,
    String(svgDoc && svgDoc.length));
  ck('exportSVG carries title band + attribution', svgDoc.includes('MIGRACIJSKI ATLAS') && svgDoc.includes('geoBoundaries'));

  /* ── header budget (v4: 138 px, default view) ── */
  const hdH = await page.evaluate(() => Math.round(document.querySelector('.hd').getBoundingClientRect().height));
  ck('header height <= 145 px at 1440 (v4 budget 138)', hdH <= 145, String(hdH));

  /* ── rail a11y + legend hover mark + detail card readout ── */
  const nFocus = await page.evaluate(() => document.querySelectorAll('#railList .rrow[tabindex="0"]').length);
  ck('rail rows keyboard-focusable (21)', nFocus === 21, String(nFocus));
  await page.hover('path[data-iso="HR-18"]');
  await settle(80);
  const mark = await page.evaluate(() => !!document.querySelector('#legend .legend-mark'));
  ck('legend shows hover mark on gradient', mark);
  await click('path[data-iso="HR-18"]');
  const cardRow = await page.evaluate(() => ({
    row: document.querySelector('#cardRow')?.textContent || '',
    note: document.querySelector('#cardNote')?.textContent || '',
  }));
  ck('detail card year readout row (unut/vanj/prir/mig.+prir.)',
    cardRow.row.includes('unut.') && cardRow.row.includes('vanj.') && cardRow.row.includes('prir.')
    && cardRow.row.includes('mig.+prir.'), cardRow.row.slice(0, 60));
  /* "uk." reads as ukupna promjena broja stanovnika — the reading the tooltip,
     the legend and the glossary all deny. The card showed the sum without either
     the honest name or the caveat. */
  ck('detail card names the sum honestly and carries the mig+prirodno caveat',
    !/\buk\.\s/.test(cardRow.row) && cardRow.note.includes('nije ukupna promjena'), cardRow.note.slice(0, 60));
  await click('#cardX');
  await page.mouse.move(4, 4); await settle(60);

  /* ── county labels toggle ── */
  await click('#labBtn');
  let labN = await page.evaluate(() => document.querySelectorAll('#map .clab').length);
  ck('labels toggle draws >= 12 county labels', labN >= 12, String(labN));
  await click('#labBtn');
  labN = await page.evaluate(() => document.querySelectorAll('#map .clab').length);
  ck('labels toggle off removes labels', labN === 0, String(labN));

  /* ── scrubber last tick not clipped ── */
  const tick = await page.evaluate(() => {
    const svg = document.querySelector('#spark');
    const ts = [...svg.querySelectorAll('text')];
    const last = ts[ts.length - 1];
    const b = last.getBBox();
    const ctm = last.getScreenCTM();
    const r = svg.getBoundingClientRect();
    return { right: ctm.e + b.x + b.width, max: r.right };
  });
  ck('scrubber 2025 tick fully inside chart', tick.right <= tick.max + 0.5, tick.right + ' vs ' + tick.max);

  /* fresh boot helper: hash state is read at module init, so force a real reload */
  const fresh = async h => {
    await page.goto('about:blank');
    await page.goto(url + h, { waitUntil: 'networkidle0' });
    await settle(400);
    /* geo_jls.json (464 kB) loads via a dynamic import() fired from a useEffect,
       i.e. *after* networkidle0 can already have resolved — so every #v=jmap
       check was racing the chunk against a fixed 400 ms. Wait on the condition
       instead of on a stopwatch. */
    if (/v=jmap/.test(h)) {
      await page.waitForFunction(() => document.querySelectorAll('#map .jl').length === 556, { timeout: 15000 });
    }
  };

  /* ── first Tokovi entry lands on measured 2018 (even from default cum) ── */
  await fresh('');
  await click('#segView button[data-v="flow"]');
  const ent = await page.evaluate(() => ({
    yr: document.querySelector('#bigYear').textContent,
    mode: document.querySelector('#segMode button[aria-pressed="true"]').dataset.v,
    leg: document.querySelector('#legend').textContent }));
  ck('first flow entry = godišnje 2018 izmjereno', ent.yr === '2018.' && ent.mode === 'yr' && ent.leg.includes('Izmjereno'),
    ent.yr + ' ' + ent.mode);

  /* rail order is dir-dependent — pin Odlasci so the first row is Zagrebačka
     (the fresh('') reload above discards the earlier Smjer selection) */
  await click('#segDir button[data-v="out"]');

  /* ── corridor pair card via rail click (GZ ⇄ Zagrebačka, measured) ── */
  await click('#railList .rrow');
  const pair = await page.evaluate(() => ({
    name: document.querySelector('#pairName')?.textContent || '',
    row: document.querySelector('#pairRow')?.textContent || '' }));
  ck('pair card opens: Grad Zagreb ⇄ Zagrebačka', pair.name.includes('Grad Zagreb') && pair.name.includes('Zagrebačka'), pair.name);
  ck('pair card 2018 readout 2.311 / 1.977 / −334 izmjereno',
    pair.row.includes('2.311') && pair.row.includes('1.977') && pair.row.includes('−334') && pair.row.includes('izmjereno'), pair.row);

  /* ── arcs: measured year solid, IPF years dashed ── */
  let adash = await page.evaluate(() => [...document.querySelectorAll('.arc')].map(a => a.getAttribute('stroke-dasharray')));
  ck('2018 arcs solid (no dasharray)', adash.length > 0 && adash.every(d => d === null), String(adash.length));
  await page.keyboard.press('ArrowLeft');
  await settle(150);
  adash = await page.evaluate(() => [...document.querySelectorAll('.arc')].map(a => a.getAttribute('stroke-dasharray')));
  ck('2017 (IPF) arcs dashed', adash.length > 0 && adash.every(d => d === '7 4'), String(adash.length));

  /* ── Nalazi story preset 1: GZ ring, banner + state + permalink ── */
  await page.select('#story', '0');
  await settle(300);
  const story = await page.evaluate(() => ({
    cap: document.querySelector('#storyCap')?.textContent || '',
    dir: document.querySelector('#segDir button[aria-pressed="true"]').dataset.v,
    yr: document.querySelector('#bigYear').textContent,
    pair: !!document.querySelector('#pair'),
    hash: location.hash }));
  ck('story 1 applies flow/net/2018 with pair card', story.dir === 'net' && story.yr === '2018.' && story.pair,
    story.dir + ' ' + story.yr);
  ck('story 1 caption cites −334', story.cap.includes('−334'), story.cap.slice(0, 50));
  ck('story state lands in the permalink', story.hash.includes('st=1') && story.hash.includes('v=flow'), story.hash);

  /* ── permalink boot: shared link reproduces the exact view ── */
  await fresh('#v=flow&s=HR-17&c=0&y=2018&dir=in');
  const perma = await page.evaluate(() => ({
    lab: document.querySelector('#railLab').textContent,
    yr: document.querySelector('#bigYear').textContent,
    dir: document.querySelector('#segDir button[aria-pressed="true"]').dataset.v }));
  ck('permalink boots flow HR-17 dolasci 2018',
    perma.lab.includes('Splitsko-dalmatinska') && perma.yr === '2018.' && perma.dir === 'in',
    JSON.stringify(perma));

  /* ── Matrica view: full OD structure ── */
  await fresh('#v=mx&c=0&y=2018&dir=out');
  const mxN = await page.evaluate(() => document.querySelectorAll('.mxc').length);
  ck('matrix renders 420 directed cells', mxN === 420, String(mxN));
  await page.hover('.mxc[data-a="HR-21"][data-b="HR-01"]');
  await settle(120);
  const mxTip = await page.evaluate(() => document.querySelector('#tip').textContent);
  ck('matrix cell GZ↔Zagrebačka tip = 2.311 / 1.977 / −334 izmjereno',
    mxTip.includes('2.311') && mxTip.includes('1.977') && mxTip.includes('−334') && mxTip.includes('izmjereno'),
    mxTip.slice(0, 80));
  const mxRail = await page.evaluate(() => {
    const r = document.querySelector('#railList .rrow');
    return { n: r.querySelector('.rname').textContent, v: r.querySelector('.rval').textContent };
  });
  ck('matrix rail top corridor = Grad Zagreb → Zagrebačka 2.311',
    mxRail.n.includes('Grad Zagreb') && mxRail.n.includes('Zagrebačka') && mxRail.v === '2.311',
    mxRail.n + ' ' + mxRail.v);
  const mxLeg = await page.evaluate(() => document.querySelector('#legend').textContent);
  ck('matrix legend labels izmjereno + diagonal note', mxLeg.includes('Izmjereno') && mxLeg.includes('Dijagonala'));

  /* ── Dob i spol panel (STAN I T3 / II T2, national 2025) ── */
  await fresh('#ag=1');
  const age = await page.evaluate(() => ({
    open: document.querySelector('#agec').classList.contains('open'),
    rects: document.querySelectorAll('#ageSvg rect').length,
    rows: document.querySelector('#ageRows').textContent,
    note: document.querySelector('#ageNote').textContent }));
  ck('age panel opens with 16×2 pyramid bars', age.open && age.rects === 32, String(age.rects));
  ck('age panel vanjska 2025: +56.665 / −37.485, 66 % muškarci, vrh 25–29',
    age.rows.includes('+56.665') && age.rows.includes('−37.485') && age.rows.includes('66 %') && age.rows.includes('25–29'), age.rows);
  ck('age panel cites STAN-2026-2-1 and 2025-only scope', age.note.includes('STAN-2026-2-1') && age.note.includes('2025.'));
  await click('#ageTabs button[data-v="int"]');
  const ageI = await page.evaluate(() => ({
    rects: document.querySelectorAll('#ageSvg rect').length,
    rows: document.querySelector('#ageRows').textContent }));
  ck('age panel unutarnja 2025: 73.838 preseljenih, 54 % žene',
    ageI.rects === 16 && ageI.rows.includes('73.838') && ageI.rows.includes('54 % žene'), ageI.rows);

  /* ── citizenship panel zemlje tab (STAN I T4) ── */
  await fresh('#cz=2');
  const zem = await page.evaluate(() => {
    const first = document.querySelector('#zemList .jrow');
    return { first: first ? first.textContent : '', all: document.querySelector('#zemList').textContent };
  });
  ck('zemlje tab top = Njemačka +9.628 / −6.238',
    zem.first.includes('Njemačka') && zem.first.includes('+9.628') && zem.first.includes('−6.238'), zem.first);
  ck('zemlje tab lists Nepal +6.264 and totals +56.665',
    zem.all.includes('Nepal') && zem.all.includes('+6.264') && zem.all.includes('+56.665'), '');

  /* ── JLS 2018 map (556 measured polygons; the only municipal migration map) ── */
  await fresh('#v=jmap&dir=net');
  const jmap = await page.evaluate(() => ({
    n: document.querySelectorAll('#map .jl').length,
    inert: document.querySelector('#scrubBox').classList.contains('inert'),
    yr: document.querySelector('#bigYear').textContent,
    leg: document.querySelector('#legend').textContent }));
  ck('jmap renders 556 JLS polygons, scrubber inert at 2018', jmap.n === 556 && jmap.inert && jmap.yr === '2018.',
    jmap.n + ' ' + jmap.yr);
  ck('jmap legend: izmjereno, √ skala, Pitoski/OSM provenance',
    jmap.leg.includes('Izmjereno') && jmap.leg.includes('√') && jmap.leg.includes('Pitoski') && jmap.leg.includes('OSM'), jmap.leg);
  const jgeo = await page.evaluate(() => {
    const svg = document.querySelector('#map');
    const W = svg.clientWidth, H = svg.clientHeight;
    let maxFrac = 0;
    for (const p of document.querySelectorAll('#map .jl')) {
      const b = p.getBBox();
      maxFrac = Math.max(maxFrac, (b.width * b.height) / (W * H));
    }
    return maxFrac;
  });
  ck('jmap max JLS bbox <= 5% of canvas (no winding blowup)', jgeo <= 0.05, jgeo.toFixed(4));
  rows = await railTexts();
  ck('jmap net rail: top Grad Zagreb +3.413, bottom Split −691',
    rows[0].n.includes('Grad Zagreb') && rows[0].v === '+3.413' &&
    rows[rows.length - 1].n.includes('Split') && rows[rows.length - 1].v === '−691',
    rows[0].n + ' ' + rows[0].v + ' | ' + rows[rows.length - 1].n + ' ' + rows[rows.length - 1].v);
  await page.hover('#map .jl[data-j="451"]');
  await settle(120);
  const jtip = await page.evaluate(() => document.querySelector('#tip').textContent);
  ck('jmap Split tooltip: +1.693 / −2.384 / neto −691 izmjereno',
    jtip.includes('Split') && jtip.includes('+1.693') && jtip.includes('−2.384') && jtip.includes('−691') && jtip.includes('izmjereno'),
    jtip.slice(0, 80));

  /* ── relative klas threshold: 1,5 % popisa 2011 → 7 / 3 / 11 ── */
  await fresh('#v=klas');
  await click('#thrMode button[data-v="rel"]');
  const relLeg = await page.evaluate(() => document.querySelector('#legend').textContent);
  ck('klas rel threshold 1,5 % → 7 / 3 / 11',
    relLeg.includes('pobjednice · 7') && relLeg.includes('neutralne · 3') && relLeg.includes('gubitnice · 11'), relLeg);
  ck('klas rel legend states % prag', relLeg.includes('1,5 % popisa 2011.'), relLeg);

  /* ══════════ UX / a11y remediation checks ══════════ */

  /* ── landmark + live region ── */
  await fresh('');
  const land = await page.evaluate(() => ({
    main: document.querySelectorAll('main.main').length,
    live: document.querySelector('#srLive')?.getAttribute('aria-live') || '',
    txt: document.querySelector('#srLive')?.textContent || '' }));
  ck('main landmark present', land.main === 1, String(land.main));
  ck('aria-live status announces year + view', land.live === 'polite' && land.txt.includes('2024.') && land.txt.includes('saldo'), land.txt);

  /* ── default legend now carries a plain-language colour key ── */
  const defLeg = await page.evaluate(() => document.querySelector('#legend').textContent);
  ck('default legend states blue=gain / red=loss',
    defLeg.includes('dobiva stanovnike') && defLeg.includes('gubi ih'), defLeg.slice(0, 80));

  /* ── Space on a focused button activates it, not the play loop ── */
  const spaceKey = await page.evaluate(() => {
    const b = document.querySelector('#segView button[data-v="reg"]');
    b.focus();
    return document.activeElement === b;
  });
  ck('segment button can hold focus', spaceKey);
  await page.keyboard.press(' ');
  await settle(150);
  const afterSpace = await page.evaluate(() => ({
    view: document.querySelector('#segView button[aria-pressed="true"]').dataset.v,
    playing: document.querySelector('#play').getAttribute('aria-pressed') }));
  ck('Space activates the focused segment and does not start playback',
    afterSpace.view === 'reg' && afterSpace.playing === 'false', JSON.stringify(afterSpace));

  /* ── Space with nothing focused still toggles playback ── */
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press(' ');
  await settle(120);
  const playOn = await page.evaluate(() => document.querySelector('#play').getAttribute('aria-pressed'));
  ck('Space on the page body still toggles playback', playOn === 'true', String(playOn));
  await page.keyboard.press(' ');
  await settle(120);

  /* ── off segments are truly disabled, and say why ── */
  await fresh('#v=klas');
  const offSeg = await page.evaluate(() => {
    const seg = document.querySelector('#segFlow');
    return { off: seg.classList.contains('off'), title: seg.getAttribute('title') || '',
      disabled: [...seg.querySelectorAll('button')].every(b => b.disabled) };
  });
  ck('inapplicable segment is disabled (not just dimmed) and titled',
    offSeg.off && offSeg.disabled && offSeg.title.includes('Nije primjenjivo'), JSON.stringify(offSeg));

  /* ── per-view year memory: Saldo's cumulative window survives a detour ── */
  await fresh('');
  await click('#segView button[data-v="flow"]');
  await click('#segView button[data-v="saldo"]');
  const back = await page.evaluate(() => ({
    yr: document.querySelector('#bigYear').textContent,
    mode: document.querySelector('#segMode button[aria-pressed="true"]').dataset.v }));
  ck('returning to Saldo restores its own year + mode (kum 2024)',
    back.yr === '2024.' && back.mode === 'cum', JSON.stringify(back));

  /* ── story clears on divergence, and stops poisoning the permalink ── */
  await fresh('');
  await page.select('#story', '1');           /* saldo / all / kum 2024 */
  await settle(250);
  const stOn = await page.evaluate(() => ({
    cap: !!document.querySelector('#storyCap'), hash: location.hash }));
  ck('story 2 shows its banner and lands in the permalink',
    stOn.cap && stOn.hash.includes('st=2'), stOn.hash);
  await click('#segFlow button[data-v="int"]');   /* diverge from the preset */
  const stOff = await page.evaluate(() => ({
    cap: !!document.querySelector('#storyCap'), hash: location.hash }));
  ck('changing a control clears the stale caption and drops st= from the hash',
    !stOff.cap && !stOff.hash.includes('st='), stOff.hash);

  /* ── reset returns to the boot view ── */
  await click('#resetBtn');
  await settle(150);
  const rst = await page.evaluate(() => ({
    view: document.querySelector('#segView button[aria-pressed="true"]').dataset.v,
    flow: document.querySelector('#segFlow button[aria-pressed="true"]').dataset.v,
    yr: document.querySelector('#bigYear').textContent }));
  ck('reset restores saldo / migracije / 2024', rst.view === 'saldo' && rst.flow === 'tot' && rst.yr === '2024.',
    JSON.stringify(rst));

  /* ── measured vs estimated are visually distinct, not just differently worded ── */
  await fresh('#v=flow&s=HR-21&c=0&y=2018&dir=out');
  /* HR-18, not HR-01: Zagrebačka is a ring around Grad Zagreb, so its bbox
     centre — where page.hover aims — lands on the hub, whose tip has no badge */
  await page.hover('path[data-iso="HR-18"]');
  await settle(120);
  const measTag = await page.evaluate(() => {
    const t = document.querySelector('#tip .cls-tag');
    return { cls: t.className, txt: t.textContent, border: getComputedStyle(t).borderStyle };
  });
  ck('2018 tooltip badge is the solid "measured" variant',
    measTag.cls.includes('meas') && measTag.txt === 'izmjereno' && measTag.border === 'solid', JSON.stringify(measTag));
  await page.keyboard.press('ArrowLeft');
  await settle(150);
  /* HR-18, not HR-01: Zagrebačka is a ring around Grad Zagreb, so its bbox
     centre — where page.hover aims — lands on the hub, whose tip has no badge */
  await page.hover('path[data-iso="HR-18"]');
  await settle(120);
  const estTag = await page.evaluate(() => {
    const t = document.querySelector('#tip .cls-tag');
    return { cls: t.className, txt: t.textContent, border: getComputedStyle(t).borderStyle };
  });
  ck('2017 tooltip badge is the dashed "estimate" variant',
    estTag.cls.includes('est') && estTag.txt.includes('procjena') && estTag.border === 'dashed', JSON.stringify(estTag));

  /* ── arcs carry direction, not just colour ── */
  const heads = await page.evaluate(() => ({
    arcs: document.querySelectorAll('.arc').length, heads: document.querySelectorAll('.arch').length }));
  ck('every flow arc has an arrowhead', heads.arcs > 0 && heads.heads === heads.arcs,
    heads.arcs + ' arcs / ' + heads.heads + ' heads');

  /* ── tooltip percentage names its denominator ── */
  await fresh('');
  await page.hover('path[data-iso="HR-18"]');
  await settle(120);
  const pctTip = await page.evaluate(() => document.querySelector('#tip').textContent);
  ck('tooltip percentage states % popisa 2011.', NBSP(pctTip).includes('% pop. 2011.'), pctTip.slice(0, 90));
  ck('tooltip renames "ukupna promjena" to the honest sum label',
    pctTip.includes('mig. + prirodno') && !pctTip.includes('ukupna promjena'), pctTip.slice(0, 90));

  /* ── matrix: measured-year ring, keyboard grid, diagonal, trace bands ── */
  await fresh('#v=mx&c=0&y=2018&dir=out');
  const mxRing = await page.evaluate(() =>
    getComputedStyle(document.querySelector('#realMark')).display);
  ck('Matrica shows the measured-2018 ring on the timeline', mxRing !== 'none', mxRing);
  const roving = await page.evaluate(() => ({
    zero: document.querySelectorAll('.mxc[tabindex="0"]').length,
    minus: document.querySelectorAll('.mxc[tabindex="-1"]').length,
    lab: document.querySelector('.mxc[tabindex="0"]').getAttribute('aria-label') || '' }));
  ck('matrix uses one roving tab stop over 420 cells',
    roving.zero === 1 && roving.minus === 419, roving.zero + ' / ' + roving.minus);
  ck('matrix cell exposes its corridor + value to AT',
    /→.+:\s*[\d.]+/.test(roving.lab), roving.lab);
  await page.evaluate(() => document.querySelector('.mxc[tabindex="0"]').focus());
  await page.keyboard.press('ArrowRight');
  await settle(120);
  const moved = await page.evaluate(() => {
    const c = document.querySelector('.mxc[tabindex="0"]');
    return { b: c.dataset.b, focused: document.activeElement === c, yr: document.querySelector('#bigYear').textContent };
  });
  ck('arrow key moves the matrix focus and does not also step the year',
    moved.focused && moved.b === 'HR-02' && moved.yr === '2018.', JSON.stringify(moved));
  const band = await page.evaluate(() => document.querySelectorAll('.mxband rect').length);
  ck('focused cell draws row + column trace bands', band === 2, String(band));
  await page.hover('.mxc[data-a="HR-21"][data-b="HR-01"]');
  await settle(100);
  await page.hover('.mxd[data-a="HR-01"][data-b="HR-01"]');
  await settle(120);
  const diagTip = await page.evaluate(() => document.querySelector('#tip').textContent);
  ck('matrix diagonal explains itself instead of staying silent',
    diagTip.includes('unutar iste županije') && diagTip.includes('dijagonala'), diagTip.slice(0, 80));

  /* ── matrix clears an open chip panel instead of hiding cells under it ── */
  await fresh('#v=mx&c=0&y=2018&dir=out&cz=1');
  await settle(300);
  const clear = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.mxc')].map(c => c.getBoundingClientRect());
    const g = { left: Math.min(...cells.map(r => r.left)), right: Math.max(...cells.map(r => r.right)),
      top: Math.min(...cells.map(r => r.top)), bottom: Math.max(...cells.map(r => r.bottom)) };
    const p = document.querySelector('#citz').getBoundingClientRect();
    /* real rectangle intersection — the grid may clear the panel on either axis */
    const ov = Math.max(0, Math.min(g.right, p.right) - Math.max(g.left, p.left))
      * Math.max(0, Math.min(g.bottom, p.bottom) - Math.max(g.top, p.top));
    return { ov: Math.round(ov), open: document.querySelector('#citz').classList.contains('open'),
      cell: Math.round(cells[0].width) };
  });
  ck('open panel does not overlap the matrix grid, and cells stay usable',
    clear.open && clear.ov === 0 && clear.cell >= 12,
    'overlap ' + clear.ov + ' px², cell ' + clear.cell);

  /* ── JLS map is reachable without a pointer ── */
  await fresh('#v=jmap&dir=net');
  const jkey = await page.evaluate(() => ({
    zero: document.querySelectorAll('.jl[tabindex="0"]').length,
    lab: document.querySelector('.jl[tabindex="0"]').getAttribute('aria-label') || '',
    role: document.querySelector('#map').getAttribute('role') }));
  ck('JLS map exposes one roving tab stop', jkey.zero === 1, String(jkey.zero));
  ck('JLS feature carries name, county and values in its label',
    jkey.lab.includes('doseljeno') && jkey.lab.includes('neto'), jkey.lab.slice(0, 70));
  ck('interactive maps are not role=img (children stay exposed)', jkey.role === 'group', String(jkey.role));

  /* ── zoom reset stays reachable with a corridor card open ── */
  await fresh('#v=flow&s=HR-21&pp=HR-01&c=0&y=2018&dir=net');
  await page.evaluate(() => {
    const svg = document.querySelector('#map');
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
  });
  await settle(200);
  /* every map-anchored overlay measured against every other one, both widths */
  const overlaps = () => page.evaluate(() => {
    const ids = ['#labBtn', '#helpBtn', '#zoomRst', '#pair', '#jcard', '#card', '#legend'];
    /* `position === 'absolute'` used to be part of this filter, which meant a
       refactor to static or fixed shrank `els` to nothing and the check passed
       having compared no pairs at all — and it silently excluded every `fixed`
       overlay, which is what .helpcard becomes below 900 px. Take everything
       visible and out of flow; the caller asserts the count so an empty sweep
       can no longer read as a pass. */
    const els = ids.map(s => [s, document.querySelector(s)])
      .filter(([, e]) => e && e.getBoundingClientRect().width > 0
        && getComputedStyle(e).display !== 'none'
        && getComputedStyle(e).position !== 'static');
    const bad = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i][1].getBoundingClientRect(), b = els[j][1].getBoundingClientRect();
      const ov = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
        * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (ov > 1) bad.push(els[i][0] + '×' + els[j][0] + '=' + Math.round(ov));
    }
    return { bad, n: els.length };
  });
  const zr = await overlaps();
  const zrHas = await page.evaluate(() => !!document.querySelector('#zoomRst'));
  ck('zoom reset is mounted while zoomed and clears the corridor card',
    zrHas && zr.bad.length === 0, zr.bad.join(' | ') + ' (' + zr.n + ' overlays)');
  /* the sweep above is only meaningful if it actually compared something */
  ck('the overlay sweep compared a real set of overlays', zr.n >= 4, String(zr.n));

  /* ── help panel: the one stable glossary ── */
  await fresh('');
  await click('#helpBtn');
  const help = await page.evaluate(() => document.querySelector('#helpCard')?.textContent || '');
  ck('help panel defines saldo, IPF and JLS in one place',
    help.includes('saldo') && help.includes('iterativno') && help.includes('gradovi i općine'), help.slice(0, 60));
  ck('help panel states the mig+prirodno caveat',
    help.includes('nije jednako ukupnoj promjeni'), '');

  /* the glossary shares the top-left corner with the detail card — it must cover
     it outright, not leave its header and close button peeking out above */
  await fresh('#s=HR-18');
  await click('#helpBtn');
  const cover = await page.evaluate(() => {
    const c = document.querySelector('#card').getBoundingClientRect();
    const h = document.querySelector('#helpCard').getBoundingClientRect();
    return { covers: h.top <= c.top + 0.5 && h.left <= c.left + 0.5 && h.right >= c.right - 0.5,
      peek: Math.round(h.top - c.top) };
  });
  ck('help panel fully covers the detail card it overlays', cover.covers, 'peek ' + cover.peek + ' px');

  /* the glossary's own first section explains the colour scale, so it must not
     be sitting on the colour scale — 164 px of reserve is the tallest legend
     (klas + relative threshold, 136 px off the map's bottom edge) plus a gap */
  await fresh('#v=klas&c=1&y=2024&tr=1&tp=1.5');
  await click('#helpBtn');
  const helpLeg = await page.evaluate(() => {
    const h = document.querySelector('#helpCard').getBoundingClientRect();
    const l = document.querySelector('#legend').getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(h.right, l.right) - Math.max(h.left, l.left))
      * Math.max(0, Math.min(h.bottom, l.bottom) - Math.max(h.top, l.top)));
  });
  ck('open glossary does not cover the legend', helpLeg === 0, helpLeg + ' px²');

  /* ══════════ permalink honesty: a caption may never outlive its numbers ══════ */
  /* The guard used to seed its comparison from the preset itself, so every key
     the URL omitted compared against its own value and passed vacuously. This
     link boots flow='tot' (BASE) while the caption cites the flow='all' figure. */
  await fresh('#v=saldo&c=1&y=2024&st=2');
  const stBad = await page.evaluate(() => ({
    cap: document.querySelector('#storyCap')?.textContent || null,
    flow: document.querySelector('#segFlow button[aria-pressed="true"]').dataset.v,
    top: document.querySelector('#railList .rrow .rval').textContent }));
  ck('truncated story link is rejected, not rendered with a false caption',
    stBad.cap === null && stBad.flow === 'tot' && NBSP(stBad.top) === '+41.986', JSON.stringify(stBad));
  await fresh('#v=saldo&f=all&c=1&y=2024&st=2');
  const stGood = await page.evaluate(() => ({
    cap: document.querySelector('#storyCap')?.textContent || '',
    top: document.querySelector('#railList .rrow .rval').textContent }));
  ck('the complete story-2 link still boots its banner over +27.521',
    stGood.cap.includes('27.521') && NBSP(stGood.top) === '+27.521', JSON.stringify(stGood));

  /* every preset must survive a round trip through its own permalink, or the
     stricter guard would silently stop shipping captions at all */
  const trip = [];
  for (let i = 0; i < 7; i++) {
    await fresh('');
    await page.select('#story', String(i));
    await settle(260);
    const h = await page.evaluate(() => location.hash);
    await fresh(h);
    const kept = await page.evaluate(() => !!document.querySelector('#storyCap'));
    if (!kept) trip.push((i + 1) + ':' + h);
  }
  ck('all 7 Nalazi round-trip through their own permalink', trip.length === 0, trip.join(' | '));

  /* Nalaz 4's claim is about the Državljanstvo panel, so closing it must kill
     the caption — the app used to emit `…&st=4` with `cz=1` already dropped */
  await fresh('');
  await page.select('#story', '3');
  await settle(260);
  const p4 = await page.evaluate(() => ({ cap: !!document.querySelector('#storyCap'),
    open: !!document.querySelector('#citz.open'), hash: location.hash }));
  await click('#citzHd');
  const p4off = await page.evaluate(() => ({ cap: !!document.querySelector('#storyCap'), hash: location.hash }));
  ck('closing the panel a Nalaz asserts clears its caption and its st=',
    p4.cap && p4.open && p4.hash.includes('st=4') && !p4off.cap && !p4off.hash.includes('st='),
    JSON.stringify(p4) + ' → ' + JSON.stringify(p4off));
  /* …while a preset that says nothing about panels survives one being opened */
  await fresh('');
  await page.select('#story', '1');
  await settle(260);
  await click('#citzHd');
  const p2keep = await page.evaluate(() => ({ cap: !!document.querySelector('#storyCap'),
    open: !!document.querySelector('#citz.open') }));
  ck('a Nalaz that never mentions a panel survives one being opened',
    p2keep.cap && p2keep.open, JSON.stringify(p2keep));

  /* ══════════ overlays: rect overlap is not the same as reachable ══════════ */
  /* elementFromPoint, not bounding boxes: the banner covered the Dob i spol chip
     at every width from 1200 to 1600 and a click on it did nothing. */
  const reach = [];
  for (const w of [1600, 1440, 1280, 1100, 1000, 960]) {
    await page.setViewport({ width: w, height: 900 });
    for (const h of ['#v=saldo&f=ext&c=0&y=2025&cz=1&st=4', '#v=reg&c=1&y=2024&st=6',
      '#v=saldo&c=1&y=2024&s=HR-18&ag=1', '#v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0&jl=1']) {
      await fresh(h);
      const bad = await page.evaluate(() => {
        const out = [];
        for (const sel of ['#ageHd', '#citzHd', '#jcardHd', '#cardX', '#helpBtn']) {
          const e = document.querySelector(sel);
          if (!e || !e.offsetParent) continue;
          const r = e.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (hit && !e.contains(hit) && hit !== e) out.push(sel + '<' + (hit.id || hit.className));
        }
        return out;
      });
      if (bad.length) reach.push(w + ' ' + h.slice(0, 22) + ' ' + bad.join(','));
    }
  }
  ck('every chip header and close button is actually clickable, 960–1600 px',
    reach.length === 0, reach.slice(0, 4).join(' | '));

  /* the same overlap sweep the zoom test runs, but over the full overlay set and
     across the widths between the two viewports the suite otherwise pins */
  const allOv = () => page.evaluate(() => {
    const ids = ['#labBtn', '#helpBtn', '#zoomRst', '#pair', '#jcard', '#card', '#legend', '#chipdock', '#storyBar'];
    const els = ids.map(s => [s, s === '#chipdock' ? document.querySelector('.chipdock') : document.querySelector(s)])
      .filter(([, e]) => e && e.getBoundingClientRect().width > 0
        && getComputedStyle(e).display !== 'none'
        && getComputedStyle(e).position !== 'static');
    const bad = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i][1].getBoundingClientRect(), b = els[j][1].getBoundingClientRect();
      const ov = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
        * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (ov > 1) bad.push(els[i][0] + '×' + els[j][0] + '=' + Math.round(ov));
    }
    return { bad, n: els.length };
  });
  const midOv = [];
  let midMin = 99;
  for (const w of [1600, 1440, 1200, 1100, 1000, 960]) {
    await page.setViewport({ width: w, height: 900 });
    /* the matrix with the *taller* age panel open is the placement search's
       worst case and was never in this sweep */
    for (const h of ['#v=saldo&c=1&y=2024&s=HR-18&ag=1', '#v=saldo&f=ext&c=0&y=2025&cz=1&st=4',
      '#v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0&jl=1', '#v=mx&y=2018&c=0&dir=net&ag=1']) {
      await fresh(h);
      const r = await allOv();
      midMin = Math.min(midMin, r.n);
      if (r.bad.length) midOv.push(w + ':' + r.bad.join(','));
    }
  }
  ck('no map overlay overlaps another at 960–1600 px either', midOv.length === 0, midOv.slice(0, 4).join(' | '));
  ck('the 960–1600 sweep compared overlays at every width', midMin >= 3, String(midMin));
  await page.setViewport({ width: 1440, height: 900 });

  /* ── .paircard is static below 960 px ──
     The invariant was documented and never asserted — and the sweeps above
     *exclude* static elements, so a regression to floating would have been
     caught only if it happened to overlap something. Assert the position
     directly, on both sides of the breakpoint. */
  await page.setViewport({ width: 900, height: 900 });
  await fresh('#v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0');
  const pcNarrow = await page.evaluate(() => getComputedStyle(document.querySelector('.paircard')).position);
  await page.setViewport({ width: 1200, height: 900 });
  await fresh('#v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0');
  const pcWide = await page.evaluate(() => getComputedStyle(document.querySelector('.paircard')).position);
  ck('.paircard drops to static below 960 px and floats above it',
    pcNarrow === 'static' && pcWide === 'absolute', pcNarrow + ' / ' + pcWide);
  await page.setViewport({ width: 1440, height: 900 });

  /* ══════════ keyboard: nothing dimmed-but-focusable, nothing dead ══════════ */
  await fresh('#v=jmap');
  const inertPlay = await page.evaluate(() => {
    const p = document.querySelector('#play');
    p.focus();
    return { disabled: p.disabled, focused: document.activeElement === p };
  });
  ck('play is disabled (not just dimmed) in the single-year JLS view',
    inertPlay.disabled && !inertPlay.focused, JSON.stringify(inertPlay));

  /* rows with nothing to open must not claim role=button — but stay focusable,
     since focus is the only pointer-free way to reach the map highlight */
  await fresh('#v=reg');
  const regRow = await page.evaluate(async () => {
    const r = document.querySelector('#railList .rrow');
    r.focus();
    await new Promise(x => setTimeout(x, 160));
    return { role: r.getAttribute('role'), tab: r.getAttribute('tabindex'),
      lab: r.getAttribute('aria-label') || '', lit: document.querySelectorAll('.cnt.rhl').length };
  });
  /* `img` rather than no role at all: an aria-label on a *generic* element is a
     placement ARIA does not guarantee AT will expose, and these rows are tab
     stops. `img` is valid, apt (name + bar + number is one small graphic) and
     collapses the row to exactly the string we want announced. Still not
     `button` — activating them does nothing. */
  ck('inert region rows drop role=button but keep focus, a name and the map highlight',
    regRow.role === 'img' && regRow.tab === '0' && regRow.lit === 2
    && regRow.lab.includes('Zagrebačka regija'), JSON.stringify(regRow));
  await fresh('#v=jmap');
  const jRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#railList .rrow')];
    /* the visible row shows the county in a .jc tag whenever the municipality is
       not the county itself (Grad Zagreb is both, so it carries none) — the label
       has to make the same distinction, since two JLS can share a name */
    const tagged = rows.find(r => r.querySelector('.jc'));
    return { roles: [...new Set(rows.map(r => r.getAttribute('role')))],
      name: tagged?.querySelector('.rname').textContent || '',
      county: tagged?.querySelector('.jc').textContent.trim() || '',
      lab: tagged?.getAttribute('aria-label') || '' };
  });
  ck('inert JLS rows drop role=button too, and name their county',
    jRow.roles.length === 1 && jRow.roles[0] === 'img'
    && !!jRow.county && jRow.lab.includes(jRow.county), JSON.stringify(jRow));
  await fresh('');
  const cRow = await page.evaluate(() => document.querySelector('#railList .rrow').getAttribute('role'));
  ck('rows that do open something keep role=button', cRow === 'button', String(cRow));

  /* role=slider owes the whole pattern, not just the arrows */
  await fresh('#v=saldo&c=1&y=2024');
  const slid = await page.evaluate(async () => {
    const s = document.querySelector('#spark');
    s.focus();
    const step = async key => {
      s.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      await new Promise(r => setTimeout(r, 130));
      return document.querySelector('#bigYear').textContent;
    };
    return { home: await step('Home'), end: await step('End'), pgdn: await step('PageDown') };
  });
  ck('slider implements Home / End / PageDown, not only the arrows',
    slid.home === '2011.' && slid.end === '2025.' && slid.pgdn === '2020.', JSON.stringify(slid));

  /* Escape reaches every dismissible surface, not just two of six */
  await fresh('');
  await click('#citzHd');
  await page.keyboard.press('Escape'); await settle(140);
  const escCitz = await page.evaluate(() => ({ open: !!document.querySelector('#citz.open'),
    focus: document.activeElement.id }));
  ck('Escape closes the citizenship panel and returns focus to its chip',
    !escCitz.open && escCitz.focus === 'citzHd', JSON.stringify(escCitz));
  await fresh('#s=HR-18');
  await page.keyboard.press('Escape'); await settle(140);
  const escCard = await page.evaluate(() => ({ open: !!document.querySelector('#card.show'),
    focus: document.activeElement.getAttribute('data-iso') }));
  ck('Escape closes the detail card and returns focus to its county',
    !escCard.open && escCard.focus === 'HR-18', JSON.stringify(escCard));

  /* closing a card used to drop focus to <body>, restarting Tab from the top */
  await fresh('');
  await click('#helpBtn');
  await click('#helpX');
  const helpFocus = await page.evaluate(() => document.activeElement.id);
  ck('closing the glossary hands focus back to the ? button', helpFocus === 'helpBtn', helpFocus);
  await fresh('#s=HR-18');
  await click('#cardX');
  const cardFocus = await page.evaluate(() => document.activeElement.getAttribute('data-iso'));
  ck('closing the detail card hands focus back to its county', cardFocus === 'HR-18', String(cardFocus));
  await fresh('#v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0');
  await click('#pairX');
  const pairFocus = await page.evaluate(() => ({ iso: document.activeElement.getAttribute('data-iso'),
    cls: document.activeElement.className }));
  ck('closing the corridor card hands focus back to its partner row',
    pairFocus.iso === 'HR-01' && pairFocus.cls.includes('rrow'), JSON.stringify(pairFocus));

  /* ══════════ the map speaks its own values ══════════ */
  await fresh('');
  const cLab = await page.evaluate(() => document.querySelector('.cnt[data-iso="HR-18"]').getAttribute('aria-label'));
  ck('county label carries the value, like the JLS map already did',
    cLab.includes('Istarska') && cLab.includes('migracijski saldo') && /[+−]\d/.test(NBSP(cLab)), cLab);
  const tipHidden = await page.evaluate(() => document.querySelector('#tip').getAttribute('aria-hidden'));
  ck('the cursor tooltip is hidden from AT (its numbers are on the features)', tipHidden === 'true', String(tipHidden));

  /* ══════════ Matrica: rail, cell and tooltip agree on one sign ══════════ */
  await fresh('#v=mx&y=2018&c=0&dir=net');
  /* a real pointer move: React derives onPointerEnter from pointerover, so a
     synthesised `pointerenter` never reaches the handler */
  const rowPt = await page.$eval('#railList .rrow', r => {
    const b = r.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(rowPt.x - 60, rowPt.y);
  await page.mouse.move(rowPt.x, rowPt.y);
  await settle(240);
  const netAgree = await page.evaluate(() => {
    const row = document.querySelector('#railList .rrow');
    return { val: row.querySelector('.rval').textContent, nm: row.querySelector('.rname').textContent,
      tip: document.querySelector('#tip').textContent,
      mark: document.querySelector('.legend-mark')?.style.left || '' };
  });
  const netNum = NBSP(netAgree.val).replace(/[+−]/, '');
  ck('matrix neto row and the tooltip it drives report the same sign',
    netAgree.val.startsWith('+') && netAgree.tip.includes('+' + netNum)
      && !netAgree.tip.includes('−' + netNum), JSON.stringify(netAgree).slice(0, 150));
  ck('matrix neto row lights the gaining half of the scale',
    parseFloat(netAgree.mark) >= 50, netAgree.mark);
  /* out/in produce the same 20 corridors by construction, so the title must not
     promise a direction the list cannot show */
  await fresh('#v=mx&y=2018&c=0&dir=out');
  const tOut = await page.evaluate(() => document.querySelector('#railYear').textContent);
  await fresh('#v=mx&y=2018&c=0&dir=in');
  const tIn = await page.evaluate(() => document.querySelector('#railYear').textContent);
  ck('matrix rail title is direction-neutral for odlasci/dolasci',
    tOut === tIn && tOut.startsWith('koridori'), tOut + ' / ' + tIn);

  /* ══════════ export bakes everything the stylesheet was providing ══════════ */
  await fresh('#v=mx&y=2018&c=0&dir=net');
  const baked = await page.evaluate(async () => {
    document.querySelector('.mxc[data-a="HR-21"][data-b="HR-01"]').focus();
    await new Promise(r => setTimeout(r, 260));
    const s = window.__exportSVG(false);
    const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
    /* nothing that paints may rely on a stylesheet this document does not ship */
    const naked = [...doc.querySelectorAll('rect,path,circle,line')]
      .filter(e => !e.closest('defs') && !e.hasAttribute('fill') && !e.hasAttribute('stroke'))
      .map(e => e.tagName + '.' + (e.parentElement?.getAttribute('class') || '?'));
    /* and prove it by rasterising: the band used to render solid black */
    const img = new Image();
    await new Promise(r => { img.onload = r; img.onerror = r; img.src = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' })); });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const b = document.querySelector('.mxband rect');
    const px = Math.round(+b.getAttribute('x') + +b.getAttribute('width') * 0.5);
    const py = Math.round(+b.getAttribute('y') + +b.getAttribute('height') / 2) + 86;   /* TOP band */
    const d = ctx.getImageData(px, py, 1, 1).data;
    return { naked, band: [d[0], d[1], d[2]] };
  });
  ck('exported document is self-contained (no CSS-only fill/stroke left)',
    baked.naked.length === 0, baked.naked.slice(0, 5).join(','));
  ck('matrix trace band does not export as a solid black bar',
    baked.band[0] > 60 || baked.band[1] > 60 || baked.band[2] > 60, 'rgb(' + baked.band.join(',') + ')');

  /* ══════════ reset means reset, including the zoom ══════════ */
  await fresh('');
  await page.evaluate(() => {
    const svg = document.querySelector('#map');
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -600, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
  });
  await settle(200);
  const zBefore = await page.evaluate(() => !!document.querySelector('#zoomRst'));
  await click('#resetBtn');
  await settle(160);
  const zAfter = await page.evaluate(() => ({ btn: !!document.querySelector('#zoomRst'),
    tf: document.querySelector('#map g').getAttribute('transform') }));
  ck('reset also returns the map to 1× (zoom lives outside S)',
    zBefore && !zAfter.btn && /scale\(1\)/.test(zAfter.tf), JSON.stringify(zAfter));

  /* Back is an undo for the view, not for the glossary sitting over it */
  await fresh('');
  await click('#helpBtn');
  await click('#segView button[data-v="klas"]');
  await page.goBack(); await settle(260);
  const helpBack = await page.evaluate(() => ({ open: !!document.querySelector('#helpCard'), hash: location.hash }));
  ck('Back restores the view without closing the glossary',
    helpBack.open && helpBack.hash.includes('v=saldo'), JSON.stringify(helpBack));

  /* ══════════ 390 px pass (house rule 1: geometry at 1440 AND 390) ══════════ */
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await fresh('');
  const m390 = await page.evaluate(() => {
    const de = document.documentElement;
    const segBad = [];
    for (const seg of document.querySelectorAll('.ctrls .seg')) {
      if (!seg.offsetParent) continue;   /* .only groups hidden in this view */
      const sr = seg.getBoundingClientRect();
      for (const b of seg.querySelectorAll('button')) {
        const br = b.getBoundingClientRect();
        if (br.right > sr.right + 0.5 || br.width < 24) segBad.push((b.dataset.v || b.id) + ':' + Math.round(br.width));
      }
    }
    return {
      overflow: de.scrollWidth - de.clientWidth,
      segBad,
      coarse: matchMedia('(pointer:coarse)').matches,
      viewBtns: document.querySelectorAll('#segView button').length,
    };
  });
  ck('390: page never scrolls sideways', m390.overflow <= 0, String(m390.overflow));
  ck('390: emulated device reports a coarse pointer', m390.coarse);
  ck('390: every segment button stays inside its group and is not clipped',
    m390.segBad.length === 0 && m390.viewBtns === 6, m390.segBad.join(' | '));

  const tap390 = await page.evaluate(() => {
    const r = {};
    const hd = document.querySelector('#citzHd').getBoundingClientRect();
    r.chipHd = Math.round(hd.height);
    const sv = document.querySelector('#segView button').getBoundingClientRect();
    r.segBtn = Math.round(sv.height);
    const rr = document.querySelector('#railList .rrow').getBoundingClientRect();
    r.railRow = Math.round(rr.height);
    return r;
  });
  ck('390: chip header, segment button and rail row all clear 44 px',
    tap390.chipHd >= 44 && tap390.segBtn >= 44 && tap390.railRow >= 44, JSON.stringify(tap390));

  await click('#citzHd');
  const x390 = await page.evaluate(() => {
    const x = document.querySelector('#citz .card-x, #citz .chip-hd');
    const de = document.documentElement;
    return { overflow: de.scrollWidth - de.clientWidth, h: Math.round(x.getBoundingClientRect().height) };
  });
  ck('390: opening a panel does not create horizontal overflow', x390.overflow <= 0, String(x390.overflow));

  /* the matrix is the densest surface — check it fits and stays legible */
  await fresh('#v=mx&c=0&y=2018&dir=out');
  const mx390 = await page.evaluate(() => {
    const de = document.documentElement;
    const lab = document.querySelector('#map text');
    return {
      overflow: de.scrollWidth - de.clientWidth,
      cells: document.querySelectorAll('.mxc').length,
      fs: parseFloat(getComputedStyle(lab).fontSize),
      hit: document.querySelectorAll('.mxhit').length,
    };
  });
  ck('390: matrix renders all 420 cells without sideways scroll',
    mx390.cells === 420 && mx390.overflow <= 0, mx390.cells + ' / ' + mx390.overflow);
  ck('390: matrix axis labels stay at or above the 6.5 px floor', mx390.fs >= 6.5, String(mx390.fs));
  ck('390: matrix gets the coarse-pointer tap overlay', mx390.hit === 1, String(mx390.hit));

  const hint390 = await page.evaluate(() => {
    const h = document.querySelector('.rail-hint');
    return h ? getComputedStyle(h).display : 'absent';
  });
  ck('390: the rail hint that explains touch navigation is visible', hint390 !== 'none' && hint390 !== 'absent', hint390);

  /* same overlay geometry, narrow: labels toggle drops out and the rest shift in */
  await fresh('#v=flow&s=HR-21&pp=HR-01&c=0&y=2018&dir=net');
  const ov390 = await overlaps();
  ck('390: map overlays do not overlap each other', ov390.bad.length === 0, ov390.bad.join(' | '));

  await page.setViewport({ width: 1440, height: 900 });

  /* ══════════════════════════════════════════════════════════════════════════
     v2.0.4 — review pass 2. Every block below pins a defect the 134 checks
     above could not see; the comment says what each one measured.
     ══════════════════════════════════════════════════════════════════════════ */

  /* ── P1: an invariant repair must test the state the link BOOTS ──
     encodeHash omits any field still at BASE, so a link with a pre-2011 year and
     no `c=` decoded `cum: undefined` — falsy — while BASE.cum is true. The clamp
     never fired and the atlas booted cumulative at 2005, where val() returns 0:
     all 21 counties, the rail and every aria-label read 0 while the tooltip
     (which clamps to ≥2011) reported 2011's real numbers under "2011.–2005.".
     encodeHash then rewrote the URL into a complete, shareable link to it. */
  for (const [h, why] of [['#v=saldo&y=2005', 'saldo'], ['#v=saldo&f=nat&y=2003', 'nat'], ['#v=reg&y=2000', 'reg']]) {
    await fresh(h);
    const boot = await page.evaluate(() => ({
      hash: location.hash,
      vals: [...document.querySelectorAll('#railList .rrow .rval')].map(v => v.textContent.trim()),
      sub: document.querySelector('#bigYearSub').textContent,
    }));
    const allZero = boot.vals.length > 0 && boot.vals.every(v => v === '0');
    ck(`truncated pre-2011 link (${why}) is repaired, not booted into an all-zero atlas`,
      !allZero && /y=2011/.test(boot.hash) && !/2011\.–20(0|10)/.test(boot.sub),
      boot.hash + ' · ' + boot.sub + ' · ' + boot.vals.slice(0, 3).join(','));
  }
  /* and the map/tooltip divergence that made it invisible cannot recur */
  await fresh('#v=saldo&y=2005');
  await page.hover('.cnt[data-iso="HR-21"]');
  await settle(220);
  const agree = await page.evaluate(() => ({
    rail: [...document.querySelectorAll('#railList .rrow')]
      .find(r => r.dataset.iso === 'HR-21')?.querySelector('.rval').textContent.trim() || '',
    tip: document.querySelector('#tip').textContent,
  }));
  ck('map, rail and tooltip cannot disagree about a repaired year',
    agree.rail !== '0' && NBSP(agree.tip).includes(NBSP(agree.rail).replace(/^\+/, '')),
    JSON.stringify(agree).slice(0, 160));

  /* ── P2: a cell label must state the direction of its own number ──
     mxCell flips with Smjer; a fixed "a → b" told AT the opposite of the truth in
     Dolasci (that cell holds b → a) and read a net balance as a directed flow.
     #tip is aria-hidden, so this string is all a screen reader gets. */
  await fresh('#v=mx&c=0&y=2018&dir=out');
  const aOut = await page.evaluate(() => document.querySelector('.mxc[data-a="HR-21"][data-b="HR-01"]').getAttribute('aria-label'));
  await fresh('#v=mx&c=0&y=2018&dir=in');
  const aIn = await page.evaluate(() => document.querySelector('.mxc[data-a="HR-21"][data-b="HR-01"]').getAttribute('aria-label'));
  await fresh('#v=mx&c=0&y=2018&dir=net');
  const aNet = await page.evaluate(() => document.querySelector('.mxc[data-a="HR-21"][data-b="HR-01"]').getAttribute('aria-label'));
  ck('matrix cell label states Odlasci as Grad Zagreb → Zagrebačka 2.311',
    NBSP(aOut) === 'Grad Zagreb → Zagrebačka: 2.311', aOut);
  ck('matrix cell label flips direction for Dolasci (1.977 is Zagrebačka → Grad Zagreb)',
    NBSP(aIn) === 'Zagrebačka → Grad Zagreb: 1.977', aIn);
  ck('matrix cell label calls a net balance a net, not a directed flow',
    aNet.includes('↔') && aNet.includes('neto') && NBSP(aNet).includes('−334'), aNet);
  /* the hatched diagonal's explanation was pointer-only: the roving tabindex
     steps over it by design, so it needs a name to be reachable in browse mode */
  const diagLab = await page.evaluate(() => {
    const d = document.querySelector('.mxd[data-a="HR-01"][data-b="HR-01"]');
    return { role: d.getAttribute('role'), lab: d.getAttribute('aria-label') || '', tab: d.getAttribute('tabindex') };
  });
  ck('matrix diagonal is a named gridcell without becoming a tab stop',
    diagLab.role === 'gridcell' && diagLab.tab === '-1' && diagLab.lab.includes('unutar iste županije'),
    JSON.stringify(diagLab));
  /* the rail's colour must come from the grid's domain — the legend beside it
     describes the grid, and the #1 row used to paint itself the extreme of the
     ramp while the cell it lit sat at ~60 % of the same scale */
  await fresh('#v=mx&c=0&y=2018&dir=out');
  const railVsGrid = await page.evaluate(() => {
    const bar = getComputedStyle(document.querySelector('#railList .rrow .rbar')).backgroundColor;
    const cell = document.querySelector('.mxc[data-a="HR-21"][data-b="HR-01"]').getAttribute('fill');
    const norm = s => s.replace(/\s/g, '');
    return { bar: norm(bar), cell: norm(cell), same: norm(bar) === norm(cell) };
  });
  ck('matrix rail paints a corridor the same colour the grid does',
    railVsGrid.same, JSON.stringify(railVsGrid));

  /* ── P2: honesty labels have to survive the export ──
     the badge said "procjena (IPF)" under a title saying "KUMULATIVNA PROCJENA",
     and "Neto parova je strukturna procjena" reached neither format. */
  for (const h of ['#v=flow&s=HR-21&dir=net&c=1&y=2024', '#v=mx&dir=net&c=1&y=2024']) {
    await fresh(h);
    const ex = await page.evaluate(() => {
      const doc = window.__exportSVG(false);
      const p = new DOMParser().parseFromString(doc, 'image/svg+xml');
      const ts = [...p.querySelectorAll('svg > text')].map(t => t.textContent);
      return { badge: ts.find(t => /^·\s/.test(t)) || '', structural: /strukturna procjena/.test(doc) };
    });
    ck('export badge says "kumulativna procjena", matching its own title  ' + h,
      ex.badge.includes('kumulativna procjena'), ex.badge);
    ck('export carries the structural-estimate note the screen carries  ' + h,
      ex.structural, String(ex.structural));
  }
  /* the PNG shrinks its title to clear the period; the SVG twin used a fixed 21 px
     and at a 732 px map (a 1024 px window) ran 73 px through "2011.–2024." */
  await page.setViewport({ width: 1024, height: 800 });
  await fresh('#v=flow&s=HR-08&dir=net&c=1&y=2024');
  const fit = await page.evaluate(() => {
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-9999px;top:0';
    holder.innerHTML = window.__exportSVG(false);
    document.body.appendChild(holder);
    const ts = [...holder.querySelector('svg').querySelectorAll(':scope > text')]
      .filter(t => +t.getAttribute('font-size') > 11);
    const tb = ts.find(t => t.getAttribute('text-anchor') !== 'end').getBBox();
    const pb = ts.find(t => t.getAttribute('text-anchor') === 'end').getBBox();
    const r = { overrun: Math.round(tb.x + tb.width - pb.x), fs: ts[0].getAttribute('font-size') };
    holder.remove();
    return r;
  });
  ck('exported SVG title shrinks to clear the period, like the PNG already did',
    fit.overrun < 0, 'overrun ' + fit.overrun + ' px at font-size ' + fit.fs);
  await page.setViewport({ width: 1440, height: 900 });

  /* ── P2: a focused county keeps its ring when the pointer wanders ──
     .hl is shared with hover and is a single value, so hovering any other county
     overwrote it and the following pointerleave cleared it — leaving the still
     focused county at plain #fff 0.8 px with no indicator at all. */
  await fresh('');
  await page.evaluate(() => document.querySelector('.cnt[data-iso="HR-18"]').focus());
  await settle(200);
  await page.hover('.cnt[data-iso="HR-14"]');
  await settle(160);
  await page.mouse.move(3, 3);
  await settle(260);
  const ring = await page.evaluate(() => {
    const a = document.querySelector('.cnt[data-iso="HR-18"]');
    const cs = getComputedStyle(a);
    return { focused: document.activeElement === a, w: parseFloat(cs.strokeWidth),
      dash: cs.strokeDasharray, stroke: cs.stroke };
  });
  ck('a focused county keeps a focus ring after the pointer visits another county',
    ring.focused && ring.w >= 2 && /\d/.test(ring.dash) && ring.dash !== 'none',
    JSON.stringify(ring));

  /* ── P2: highlights are scoped to the view that produced them ──
     `hl` survived a view change and the tip's visibility test was view-agnostic,
     so a county focused in Saldo carried its saldo tooltip onto the JLS map.
     Reached by keyboard alone — a focused county never gets a pointerleave. */
  await fresh('');
  const leak = await page.evaluate(async () => {
    document.querySelector('.cnt[data-iso="HR-18"]').focus();
    await new Promise(r => setTimeout(r, 220));
    const before = document.querySelector('#tip').classList.contains('show');
    document.querySelector('#segView button[data-v="jmap"]').click();
    await new Promise(r => setTimeout(r, 700));
    const tip = document.querySelector('#tip');
    return { before, after: tip.classList.contains('show'), text: tip.textContent.slice(0, 40) };
  });
  ck('a county tooltip does not survive the switch to the JLS map',
    leak.before && !leak.after, JSON.stringify(leak));

  /* ── P2: every segment group has a programmatic name ──
     seven groups of pressed/not-pressed buttons, and the visible "Prikaz" /
     "Sastavnica" labels beside them were decoration to a screen reader. */
  await fresh('#v=klas&c=1&y=2024');
  const named = await page.evaluate(() => {
    const nameOf = s => {
      if (s.getAttribute('aria-label')) return s.getAttribute('aria-label');
      const id = s.getAttribute('aria-labelledby');
      return id ? id.split(/\s+/).map(i => document.getElementById(i)?.textContent || '').join(' ').trim() : '';
    };
    return [...document.querySelectorAll('.seg')].map(s => ({
      id: s.id || '(none)', role: s.getAttribute('role'), name: nameOf(s) }));
  });
  ck('every segment group is a named role=group',
    named.length >= 7 && named.every(g => g.role === 'group' && g.name.length > 2),
    JSON.stringify(named.filter(g => g.role !== 'group' || !g.name)).slice(0, 160));
  const railNamed = await page.evaluate(() => {
    const l = document.querySelector('#railList');
    const id = l.getAttribute('aria-labelledby') || '';
    return { role: l.getAttribute('role'),
      name: id.split(/\s+/).map(i => document.getElementById(i)?.textContent || '').join(' ').trim() };
  });
  ck('the rail list is named by the two lines that describe it',
    railNamed.role === 'group' && railNamed.name.includes('županija') && /\d{4}/.test(railNamed.name),
    JSON.stringify(railNamed));

  /* ── P3: nothing dimmed is left looking operable ──
     opacity + pointer-events:none is the banned pattern; it escaped the letter of
     the invariant here only because #spark was already tabIndex −1, while AT still
     met a role=slider with aria-valuenow and no way to work it. */
  await fresh('#v=jmap');
  const sparkInert = await page.evaluate(() => {
    const s = document.querySelector('#spark');
    return { disabled: s.getAttribute('aria-disabled'), tab: s.getAttribute('tabindex'),
      pe: getComputedStyle(s.parentElement).pointerEvents,
      opacity: getComputedStyle(s.parentElement).opacity };
  });
  ck('the inert scrubber says aria-disabled instead of only looking dead',
    sparkInert.disabled === 'true' && sparkInert.tab === '-1' && sparkInert.pe !== 'none',
    JSON.stringify(sparkInert));

  /* ── P3: no panel flag without a panel behind it ──
     the JLS chip only exists in Tokovi. Carried elsewhere it still set
     body.panel-open — which hides the legend outright below 900 px — and still
     swallowed an Escape press, dropping focus to <body>. */
  await fresh('#v=saldo&c=1&y=2024&jl=1');
  const deadFlag = await page.evaluate(() => ({
    hash: location.hash, panelOpen: document.body.classList.contains('panel-open') }));
  ck('a JLS chip flag outside Tokovi is dropped, not carried as a dead panel',
    !/jl=/.test(deadFlag.hash) && !deadFlag.panelOpen, JSON.stringify(deadFlag));
  /* and the same, reached through the UI rather than a URL */
  await fresh('#v=flow&s=HR-21&c=0&y=2018');
  const uiFlag = await page.evaluate(async () => {
    document.querySelector('#jcardHd').click();
    await new Promise(r => setTimeout(r, 250));
    const opened = document.body.classList.contains('panel-open');
    document.querySelector('#segView button[data-v="saldo"]').click();
    await new Promise(r => setTimeout(r, 350));
    return { opened, after: document.body.classList.contains('panel-open'), hash: location.hash };
  });
  ck('leaving Tokovi closes the JLS chip instead of leaving the flag set',
    uiFlag.opened && !uiFlag.after && !/jl=/.test(uiFlag.hash), JSON.stringify(uiFlag));
  /* focusSoon must not aim at a hidden element and drop focus on the floor */
  await fresh('#v=saldo&c=1&y=2024&s=HR-18&cz=1');
  const escFocus = await page.evaluate(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return { active: document.activeElement.id || document.activeElement.tagName };
  });
  ck('Escape never parks focus on <body>', escFocus.active !== 'BODY', escFocus.active);

  /* ── P3: Space on a rail row that cannot be activated does nothing ──
     inert rows carry no button role, which sent Space through to the global
     handler: tabbing onto "Zagrebačka regija" and pressing Space started the film. */
  await fresh('#v=reg&c=1&y=2024');
  await page.evaluate(() => document.querySelector('#railList .rrow').focus());
  await settle(120);
  await page.keyboard.press(' ');
  await settle(400);
  const spaceRow = await page.evaluate(() => document.querySelector('#play').getAttribute('aria-pressed'));
  ck('Space on an inert rail row does not start playback', spaceRow === 'false', String(spaceRow));

  /* ── P3: a Nalaz dies only when its own claim stops holding ──
     invalidation ran over the preset's *patch* keys, so a defensive `age: false`
     enrolled a caption that never mentions a panel. Measured: opening "Dob i
     spol" killed Nalaz 7 alone, out of seven. */
  const survive = [];
  for (const i of [1, 2, 3, 5, 6, 7]) {
    await fresh('');
    survive.push(await page.evaluate(async (ix) => {
      const sel = document.querySelector('#story');
      sel.value = String(ix - 1);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const on = !!document.querySelector('#storyCap');
      document.querySelector('#ageHd').click();
      await new Promise(r => setTimeout(r, 400));
      return { ix, on, still: !!document.querySelector('#storyCap') };
    }, i));
  }
  ck('a Nalaz that never mentions a panel survives one being opened — all six of them',
    survive.every(s => s.on && s.still), JSON.stringify(survive.filter(s => !s.still)));
  /* while the one whose claim IS a panel still dies with it (covered above for
     citz; this pins that the new `asserts` list is what does it) */
  await fresh('');
  const n4 = await page.evaluate(async () => {
    const sel = document.querySelector('#story');
    sel.value = '3';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const on = !!document.querySelector('#storyCap');
    document.querySelector('#citzHd').click();
    await new Promise(r => setTimeout(r, 400));
    return { on, still: !!document.querySelector('#storyCap'), hash: location.hash };
  });
  ck('Nalaz 4 still dies when the panel it asserts is closed',
    n4.on && !n4.still && !/st=/.test(n4.hash), JSON.stringify(n4));

  /* ── P3: the map can be zoomed without a pointer ──
     wheel/pinch/drag only, so the whole feature — and the county-label rule tied
     to it, which only reveals a small county once zoomed — failed WCAG 2.1.1. */
  await fresh('');
  const kbZoom = await page.evaluate(async () => {
    const tr = () => document.querySelector('#map g').getAttribute('transform');
    const before = tr();
    for (let i = 0; i < 2; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const zoomed = tr();
    const rst = !!document.querySelector('#zoomRst');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return { before, zoomed, rst, after: tr() };
  });
  ck('+ zooms the map from the keyboard and 0 returns it to 1×',
    kbZoom.zoomed !== kbZoom.before && kbZoom.rst && kbZoom.after === kbZoom.before,
    JSON.stringify(kbZoom));
  const gloss = await page.evaluate(async () => {
    document.querySelector('#helpBtn').click();
    await new Promise(r => setTimeout(r, 250));
    const t = document.querySelector('#helpCard').textContent;
    document.querySelector('#helpX').click();
    /* `t.includes('0')` was a tautology — the glossary text also contains
       "2021.–2025.", "−4.500", "1.4". Match the key as its own word instead. */
    return { zoom: t.includes('zumiraju'), zero: /\b0\b/.test(t),
      pan: t.includes('Shift'), grid: t.includes('PageUp') };
  });
  ck('the glossary documents the zoom keys it now has',
    gloss.zoom && gloss.zero, JSON.stringify(gloss));
  ck('the glossary documents the pan and grid-jump keys too',
    gloss.pan && gloss.grid, JSON.stringify(gloss));

  /* ── the two big geometry payloads are no longer on the critical path ── */
  const chunks = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(r => /\.js$/.test(r.name)).map(r => r.name.split('/').pop()));
  ck('geo_jls and geo_regions5 ship as their own chunks, not in the entry',
    chunks.some(c => /^geo_jls/.test(c)) && chunks.some(c => /^geo_regions5/.test(c))
    && chunks.filter(c => /^index-/.test(c)).length === 1, chunks.join(','));
  const entryKB = fs.existsSync(path.resolve(arg, 'assets'))
    ? Math.round(fs.readdirSync(path.resolve(arg, 'assets'))
      .filter(f => /^index-.*\.js$/.test(f))
      .reduce((a, f) => a + fs.statSync(path.join(path.resolve(arg, 'assets'), f)).size, 0) / 1024)
    : 0;
  ck('entry chunk stays under 600 KB (was 995 KB with both payloads inlined)',
    entryKB > 0 && entryKB < 600, entryKB + ' KB');

  /* ── P2: the glossary does not cover the play button on a phone ──
     .helpcard was anchored inside .map-box with max-height:70vh, so at 390×844 it
     ran to y 1152 and over the fixed scrubber (46.002 px², elementFromPoint on
     #play returned the glossary). */
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await fresh('');
  await page.evaluate(() => document.querySelector('#helpBtn').click());
  await settle(400);
  const mobHelp = await page.evaluate(() => {
    const box = s => { const e = document.querySelector(s); const b = e.getBoundingClientRect();
      return { t: b.top, b: b.bottom, l: b.left, r: b.right }; };
    const a = box('#helpCard'), s = box('#scrubBox');
    const ov = Math.max(0, Math.min(a.b, s.b) - Math.max(a.t, s.t)) * Math.max(0, Math.min(a.r, s.r) - Math.max(a.l, s.l));
    const p = document.querySelector('#play').getBoundingClientRect();
    const hit = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2);
    return { ov: Math.round(ov), onPlay: !!(hit && hit.closest('#play')),
      offscreen: Math.round(a.b - innerHeight), hitId: hit ? (hit.id || hit.className) : null };
  });
  ck('390: the open glossary does not overlap the fixed scrubber',
    mobHelp.ov === 0 && mobHelp.offscreen <= 0, JSON.stringify(mobHelp));
  ck('390: the play button is still clickable with the glossary open',
    mobHelp.onPlay, String(mobHelp.hitId));
  await page.setViewport({ width: 1440, height: 900 });

  /* ── errors ── */
  ck('zero page/console errors', errors.length === 0, errors.join(' ; ').slice(0, 300));

  /* ══════════════════ v2.0.5 — review pass 3 ══════════════════ */
  await page.setViewport({ width: 1440, height: 900 });

  /* ── P1: Space on a focused county selects it, it does not start the film ── */
  await fresh('');
  const cntSpace = await page.evaluate(async () => {
    const c = document.querySelector('.cnt[data-iso="HR-18"]');
    c.focus();
    c.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return { card: !!document.querySelector('#cardName'),
      playing: document.querySelector('#play').getAttribute('aria-pressed'),
      role: c.getAttribute('role'), exp: c.getAttribute('aria-expanded') };
  });
  ck('Space on a focused county opens its card and does not start playback',
    cntSpace.card && cntSpace.playing === 'false', JSON.stringify(cntSpace));
  ck('county paths claim role=button and report their own expanded state',
    cntSpace.role === 'button' && cntSpace.exp === 'true', JSON.stringify(cntSpace));

  /* ── P1: modifier chords are not bare-key shortcuts ──
     Alt+← is the browser's Back, which this app makes an undo; stepping the
     year on it corrupted the history entry the user was leaving. */
  await fresh('#v=saldo&c=1&y=2020');
  const alt = await page.evaluate(async () => {
    const yr = () => document.querySelector('#bigYear').textContent;
    const before = yr();
    for (const k of ['ArrowRight', 'ArrowLeft']) {
      for (const mod of ['altKey', 'ctrlKey', 'metaKey']) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, [mod]: true }));
      }
    }
    await new Promise(r => setTimeout(r, 300));
    const held = yr();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    return { before, held, bare: yr() };
  });
  ck('Alt/Ctrl/Meta + arrows do not step the year, bare arrows still do',
    alt.held === alt.before && alt.bare !== alt.before, JSON.stringify(alt));

  /* ── P1: a stale `sel` no longer paints a county card over the matrix/JLS ── */
  const selCarry = await page.evaluate(async () => {
    const out = {};
    document.querySelector('.cnt[data-iso="HR-18"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    out.saldo = !!document.querySelector('#cardName');
    document.querySelector('#segView button[data-v="mx"]').click();
    await new Promise(r => setTimeout(r, 450));
    out.mx = !!document.querySelector('#cardName');
    out.hash = location.hash;
    return out;
  });
  ck('a county selected in Saldo does not keep its card over the Matrica grid',
    selCarry.saldo && !selCarry.mx && !/[?&]s=/.test(selCarry.hash), JSON.stringify(selCarry));

  /* the permalink half of the same repair */
  await fresh('#v=mx&y=2018&c=0&dir=net&s=HR-18');
  ck('a permalink cannot carry a county selection into Matrica',
    await page.evaluate(() => !document.querySelector('#cardName') && !/[?&]s=/.test(location.hash)));

  /* ── P2: a dead `pp=` no longer swallows an Escape outside Tokovi ── */
  await fresh('#v=reg&c=1&y=2024&pp=HR-01&cz=1');
  const deadPair = await page.evaluate(async () => {
    const open = document.querySelector('#citz').classList.contains('open');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return { open, closed: !document.querySelector('#citz').classList.contains('open'),
      hash: location.hash, body: document.activeElement === document.body };
  });
  ck('a stale pp= is dropped on decode, so the first Escape reaches the open panel',
    deadPair.open && deadPair.closed && !/pp=/.test(deadPair.hash), JSON.stringify(deadPair));

  /* ── P2: re-hubbing in Tokovi closes the corridor card (finding 27) ── */
  await fresh('#v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0');
  const rehub = await page.evaluate(async () => {
    const was = !!document.querySelector('#pairName');
    document.querySelector('.cnt[data-iso="HR-19"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return { was, still: !!document.querySelector('#pairName'), hash: location.hash };
  });
  ck('re-hubbing the map closes the corridor card instead of re-pointing it',
    rehub.was && !rehub.still && !/pp=/.test(rehub.hash), JSON.stringify(rehub));

  /* ── P2: the two-tone focus ring, and it must not reach the export ── */
  await fresh('');
  const ring2 = await page.evaluate(async () => {
    document.querySelector('.cnt[data-iso="HR-18"]').focus();
    await new Promise(r => setTimeout(r, 250));
    const g = document.querySelector('.focusring');
    if (!g) return { has: false };
    const halo = getComputedStyle(g.querySelector('.fr-halo'));
    const ink = getComputedStyle(g.querySelector('.fr-ink'));
    const svg = window.__exportSVG(false) || '';
    return { has: true, halo: halo.stroke, haloW: parseFloat(halo.strokeWidth),
      ink: ink.stroke, dash: ink.strokeDasharray, inExport: svg.includes('focusring') };
  });
  ck('a focused county draws a two-tone ring (white halo under an ink dash)',
    ring2.has && ring2.halo === 'rgb(255, 255, 255)' && ring2.haloW >= 4
    && ring2.ink === 'rgb(32, 38, 43)' && /\d/.test(ring2.dash), JSON.stringify(ring2));
  ck('the focus ring is UI state and never reaches the exported document',
    ring2.has && ring2.inExport === false, JSON.stringify(ring2));

  /* ── P2: the in-cell halo is baked, not left to a stylesheet the export lacks ──
     numbers only render at cell >= 22 px, which 1440 does not reach (19 px) */
  await page.setViewport({ width: 1920, height: 1200 });
  await fresh('#v=mx&y=2018&c=0&dir=in');
  const halo = await page.evaluate(() => {
    const svg = window.__exportSVG(false) || '';
    const live = document.querySelector('.mxnum');
    return { livePaint: live ? getComputedStyle(live).paintOrder : null,
      baked: /class="mxnum"[^>]*paint-order="stroke"/.test(svg) || /paint-order="stroke"/.test(svg),
      whiteStroke: /paint-order="stroke"[^>]*stroke="#fff"|stroke="#fff"[^>]*paint-order="stroke"/.test(svg) };
  });
  ck('matrix numbers carry a white halo on screen and baked into the export',
    halo.livePaint === 'stroke' && halo.baked && halo.whiteStroke, JSON.stringify(halo));
  await page.setViewport({ width: 1440, height: 900 });

  /* ── P2: the JLS export attributes OSM/ODbL, not geoBoundaries ── */
  await fresh('#v=jmap&dir=net');
  const attrib = await page.evaluate(() => {
    const j = window.__exportSVG(false) || '';
    return { jls: j, hasOdbl: j.includes('ODbL'), hasOsm: j.includes('OpenStreetMap'),
      wrongGeoB: j.includes('geoBoundaries') };
  });
  ck('a JLS export credits OpenStreetMap under ODbL and not geoBoundaries',
    attrib.hasOdbl && attrib.hasOsm && !attrib.wrongGeoB,
    JSON.stringify({ odbl: attrib.hasOdbl, osm: attrib.hasOsm, geoB: attrib.wrongGeoB }));
  await fresh('');
  ck('a county export still credits geoBoundaries, and now names ODbL',
    await page.evaluate(() => {
      const s = window.__exportSVG(false) || '';
      return s.includes('geoBoundaries') && s.includes('ODbL');
    }));

  /* ── P2: the glossary no longer covers live tab stops ── */
  await fresh('#v=saldo&c=1&y=2024&s=HR-18');
  const inert = await page.evaluate(async () => {
    document.querySelector('#helpBtn').click();
    await new Promise(r => setTimeout(r, 300));
    const card = document.querySelector('#card');
    const x = document.querySelector('#cardX');
    x.focus();
    return { cardInert: card.hasAttribute('inert'),
      focusable: document.activeElement === x,
      inDialog: document.activeElement === document.querySelector('#helpCard') };
  });
  ck('the open glossary makes the covered detail card inert, not merely hidden',
    inert.cardInert && !inert.focusable, JSON.stringify(inert));
  ck('opening the glossary moves focus into the dialog it declares',
    inert.inDialog, JSON.stringify(inert));

  /* ── P2: activations that unmount their own control hand focus on ── */
  await fresh('#v=mx&y=2018&c=0&dir=net');
  const drillFocus = await page.evaluate(async () => {
    const c = document.querySelector('.mxc[tabindex="0"]');
    c.focus();
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    return { view: location.hash, body: document.activeElement === document.body,
      id: document.activeElement ? document.activeElement.id : null };
  });
  ck('drilling from a matrix cell does not drop focus to <body>',
    /v=flow/.test(drillFocus.view) && !drillFocus.body, JSON.stringify(drillFocus));

  /* ── P2: keyboard pan, and the year keeps the bare arrows ── */
  await fresh('');
  const pan = await page.evaluate(async () => {
    const tr = () => document.querySelector('#map g').getAttribute('transform');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const zoomed = tr();
    const yr = document.querySelector('#bigYear').textContent;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, shiftKey: true }));
    await new Promise(r => setTimeout(r, 300));
    return { zoomed, panned: tr(), yr, yrAfter: document.querySelector('#bigYear').textContent };
  });
  ck('Shift + arrow pans the zoomed map and does not step the year',
    pan.panned !== pan.zoomed && pan.yrAfter === pan.yr, JSON.stringify(pan));

  /* ── P2: the grid and the JLS list have jump keys ── */
  await fresh('#v=mx&y=2018&c=0&dir=net');
  const gridJump = await page.evaluate(async () => {
    const first = document.querySelector('.mxc[tabindex="0"]');
    first.focus();
    const a0 = first.dataset.a;
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const now = document.querySelector('.mxc[tabindex="0"]');
    return { a0, a1: now.dataset.a, b1: now.dataset.b, focused: document.activeElement === now };
  });
  /* ARIA 1.2 requires a grid to own rows; 441 gridcells hanging off the svg meant
     NVDA/JAWS table navigation never engaged and no cell had positional context */
  const gridRows = await page.evaluate(() => {
    const g = document.querySelector('#map[role="grid"]');
    const rows = g.querySelectorAll(':scope > g > g[role="row"], :scope > g[role="row"]');
    const cellsOutside = [...g.querySelectorAll('[role="gridcell"]')]
      .filter(c => !c.closest('[role="row"]')).length;
    const first = rows[0];
    return { rows: rows.length, cellsOutside,
      rowIdx: first ? first.getAttribute('aria-rowindex') : null,
      rowName: first ? first.getAttribute('aria-label') : null,
      colIdx: first ? (first.querySelector('[role="gridcell"]') || {}).getAttribute?.('aria-colindex') : null,
      rowCount: g.getAttribute('aria-rowcount'), colCount: g.getAttribute('aria-colcount') };
  });
  ck('the matrix grid owns 21 named rows, with no gridcell outside a row',
    gridRows.rows === 21 && gridRows.cellsOutside === 0 && !!gridRows.rowName,
    JSON.stringify(gridRows));
  ck('grid declares its row/column counts and indices',
    gridRows.rowCount === '21' && gridRows.colCount === '21'
    && gridRows.rowIdx === '1' && gridRows.colIdx === '1', JSON.stringify(gridRows));

  ck('End jumps the matrix roving cell instead of doing nothing',
    gridJump.b1 !== undefined && gridJump.focused && JSON.stringify(gridJump) !== '{}'
    && (gridJump.a1 !== gridJump.a0 || gridJump.b1 !== '1'), JSON.stringify(gridJump));

  await fresh('#v=jmap&dir=net');
  const jJump = await page.evaluate(async () => {
    const f = document.querySelector('.jl[tabindex="0"]');
    f.focus();
    const j0 = f.dataset.j;
    f.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const now = document.querySelector('.jl[tabindex="0"]');
    return { j0, j1: now.dataset.j, one: document.querySelectorAll('.jl[tabindex="0"]').length,
      role: now.getAttribute('role') };
  });
  ck('End jumps the JLS roving stop across the 556-feature list',
    jJump.j1 !== jJump.j0 && jJump.one === 1, JSON.stringify(jJump));
  ck('JLS features claim role=img — a named readout, not a fake button',
    jJump.role === 'img', String(jJump.role));

  /* ── P2: Escape dismisses the tooltip without moving focus (1.4.13) ── */
  await fresh('');
  const tipEsc = await page.evaluate(async () => {
    const c = document.querySelector('.cnt[data-iso="HR-18"]');
    c.focus();
    await new Promise(r => setTimeout(r, 250));
    const shown = getComputedStyle(document.querySelector('#tip')).display !== 'none';
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return { shown, gone: getComputedStyle(document.querySelector('#tip')).display === 'none',
      stillFocused: document.activeElement === c };
  });
  ck('Escape dismisses the tooltip and leaves focus where it was',
    tipEsc.shown && tipEsc.gone && tipEsc.stillFocused, JSON.stringify(tipEsc));

  /* ── P3: structure a screen reader can navigate ── */
  await fresh('#v=saldo&c=1&y=2024&s=HR-18');
  const struct = await page.evaluate(() => ({
    h1: document.querySelectorAll('h1').length,
    h2: document.querySelectorAll('h2').length,
    h3: 0,
    skip: !!document.querySelector('a.skip[href="#map"]'),
    railNamed: !!document.querySelector('aside.rail[aria-labelledby="railLab"]'),
    cardSvg: document.querySelector('#cardSvg').getAttribute('role'),
    arrHidden: [...document.querySelectorAll('.chip-arr')].every(a => a.getAttribute('aria-hidden') === 'true'),
  }));
  ck('the page has a real heading outline, not styled divs',
    struct.h1 === 1 && struct.h2 >= 2, JSON.stringify(struct));
  ck('a skip link bypasses the header controls', struct.skip, JSON.stringify(struct));
  ck('the rail landmark is named and the card chart is a labelled figure',
    struct.railNamed && struct.cardSvg === 'img', JSON.stringify(struct));
  ck('decorative chip arrows are hidden from assistive tech', struct.arrHidden);

  /* ── P3: the threshold slider says what the readout says ── */
  await fresh('#v=klas&c=1&y=2024&tr=1&tp=1.5');
  const thrVt = await page.evaluate(() => ({
    vt: document.querySelector('#thr').getAttribute('aria-valuetext'),
    seen: document.querySelector('#thrVal').textContent,
  }));
  ck('the % threshold slider carries an aria-valuetext matching its readout',
    !!thrVt.vt && thrVt.vt.includes('1,5') && thrVt.vt.includes('−'), JSON.stringify(thrVt));

  /* ── P3: the citizenship clamp is a live status, not silent text ── */
  await fresh('#cz=1&y=2015&v=saldo&c=0');
  ck('the out-of-range citizenship note is announced, not just drawn',
    await page.evaluate(() => {
      const c = document.querySelector('#citzClamp');
      return !!c && c.getAttribute('role') === 'status';
    }));

  /* ── P3: the corridor card encodes its two series with shape, not hue ── */
  await fresh('#v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0');
  const pairShape = await page.evaluate(() => {
    const paths = [...document.querySelectorAll('#pairSvg path')].filter(p => p.getAttribute('stroke'));
    const ins = paths.find(p => p.getAttribute('stroke') === '#1D4E89');
    const outs = paths.find(p => p.getAttribute('stroke') === '#B5341F');
    return { ins: ins && ins.getAttribute('stroke-dasharray'), outs: outs && outs.getAttribute('stroke-dasharray'),
      cap: document.querySelector('#pair .card-sub').textContent };
  });
  ck('corridor series differ by dash, and the caption names shape not colour',
    !!pairShape.ins && !pairShape.outs && /crtkano/.test(pairShape.cap)
    && !/crvena/.test(pairShape.cap), JSON.stringify(pairShape));

  /* ── P3: `den` — a whole segment group that had zero coverage ── */
  for (const [d, label] of [['rel11', '% popisa 2011.'], ['relest', '% tek. procjene']]) {
    await fresh('#v=saldo&c=1&y=2024&d=' + d);
    const rel = await page.evaluate(() => {
      const v = document.querySelector('#railList .rrow .rval');
      return { val: v ? v.textContent : '', lab: document.querySelector('#legend').textContent,
        aria: document.querySelector('.cnt[data-iso="HR-21"]').getAttribute('aria-label') };
    });
    ck(`den=${d} renders % values in the rail, legend and county labels`,
      /%/.test(rel.val) && rel.lab.includes(label) && /%/.test(rel.aria),
      JSON.stringify({ v: rel.val, a: rel.aria.slice(0, 50) }));
  }

  /* ── P3: the decodeHash repair that was never reached from a URL ── */
  await fresh('#v=flow&dir=net&y=2018&c=0');
  const hubRepair = await page.evaluate(() => ({
    hash: location.hash, rail: document.querySelector('#railLab').textContent,
    arcs: document.querySelectorAll('.arc').length,
  }));
  ck('#v=flow with no hub repairs to HR-21 instead of rendering nothing',
    /s=HR-21/.test(hubRepair.hash) && hubRepair.arcs > 0, JSON.stringify(hubRepair));

  /* ── P3: the play loop actually advances, stops, and kills the caption ── */
  await fresh('');
  const played = await page.evaluate(async () => {
    const sel = document.querySelector('#story');
    sel.value = '1';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    const cap = !!document.querySelector('#storyCap');
    const y0 = document.querySelector('#bigYear').textContent;
    document.querySelector('#play').click();
    await new Promise(r => setTimeout(r, 1500));
    const y1 = document.querySelector('#bigYear').textContent;
    document.querySelector('#play').click();
    return { cap, y0, y1, capAfter: !!document.querySelector('#storyCap') };
  });
  ck('the play loop really advances the year and clears the Nalaz caption',
    played.cap && played.y1 !== played.y0 && !played.capAfter, JSON.stringify(played));

  /* ── P3: reduced motion is honoured, and it is a live preference ── */
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await fresh('');
  ck('prefers-reduced-motion lands body.reduced and suppresses the transitions',
    await page.evaluate(() => document.body.classList.contains('reduced')
      && getComputedStyle(document.querySelector('.cnt')).transitionDuration === '0s'));
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await fresh('');
  ck('and it comes back off without a reload',
    await page.evaluate(() => !document.body.classList.contains('reduced')));

  /* ── P3: the JLS chunk can fail, and the view says so and offers a retry ── */
  blockGeoChunk = true;
  await page.goto('about:blank');
  await page.goto(url + '#v=jmap&dir=net', { waitUntil: 'domcontentloaded' });
  await settle(2500);
  const geoFail = await page.evaluate(() => {
    const st = document.querySelector('#jstatus');
    return { err: !!document.querySelector('#jerror'), retry: !!document.querySelector('#jretry'),
      stillLoading: !!document.querySelector('#jloading'),
      live: st ? st.getAttribute('role') : null };
  });
  ck('a failed geometry chunk reports an error instead of an eternal spinner',
    geoFail.err && geoFail.retry && !geoFail.stillLoading, JSON.stringify(geoFail));
  ck('and it says so through a live region, not silent SVG text',
    geoFail.live === 'status', String(geoFail.live));
  blockGeoChunk = false;
  /* The retry reloads, because a failed module fetch is cached in the browser's
     module map and a second import() of the same specifier never hits the
     network (measured: 0 of 556 with the promise slot cleared). */
  await page.click('#jretry');
  await page.waitForFunction(() => document.querySelectorAll('#map .jl').length === 556, { timeout: 15000 })
    .catch(() => {});
  const retried = await page.evaluate(() => document.querySelectorAll('#map .jl').length);
  ck('the retry genuinely re-fetches the chunk it failed on', retried === 556, String(retried));
  /* the aborted request above is a deliberate console error — drop exactly it,
     so the error check that follows still means something */
  for (let i = errors.length - 1; i >= 0; i--) if (/ERR_FAILED|net::/.test(errors[i])) errors.splice(i, 1);
  ck('the font host was stubbed, so no check depended on the network',
    fontReqs > 0, String(fontReqs));

  /* ══════════ v2.0.6 — the companion study is unpublished ══════════
     The paper this atlas is a companion to is not published yet, so three
     things have to hold at once and they are cheap to break one at a time:
     nothing identifies it, every surface says the reference is *pending*
     rather than implying one exists, and the atlas states it is unaffiliated.
     Same shape as the izmjereno/procjena rules — a bare "iz rada" with nothing
     a reader can look up is an unlabelled claim. src/lib/credits.ts is the one
     switch; these checks are what stops half a publication from shipping. */
  await fresh('');
  /* The names must not be in the *bundle*, not merely off-screen: a comment, an
     aria-label or a dead string would all ship. Fetched from the page so this
     works against a served dist and against a URL alike, and the scanned count
     is asserted so a fetch failure cannot pass as "no hits". */
  const bundleScan = await page.evaluate(async () => {
    /* same-origin only: the font stylesheet is stubbed, and fetching it logs a
       CORS error that the zero-console-errors check would then blame on the app */
    const urls = [location.href,
      ...[...document.querySelectorAll('script[src]')].map(s => s.src),
      ...[...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href)]
      .filter(u => new URL(u, location.href).origin === location.origin);
    const hits = [];
    let scanned = 0;
    for (const u of urls) {
      const t = await fetch(u).then(r => r.text()).catch(() => null);
      if (t == null) continue;
      scanned++;
      const m = t.match(/maras|vinovr/i);
      if (m) hits.push(u.split('/').pop() + ':' + m[0]);
    }
    return { scanned, hits };
  });
  ck('no identifying detail of the unpublished study ships in the built app',
    bundleScan.scanned >= 2 && bundleScan.hits.length === 0, JSON.stringify(bundleScan));

  const attr = await page.evaluate(() => ({
    sub: document.querySelector('.hd-sub').textContent.trim(),
    ft: document.querySelector('.ft').textContent.trim(),
    ns: document.querySelector('noscript').textContent.trim(),
    ftH: Math.round(document.querySelector('.ft').getBoundingClientRect().height),
    boxH: Math.round(document.querySelector('.map-box').getBoundingClientRect().height),
  }));
  /* State-agnostic: the invariant is that the surfaces AGREE, not that any one
     of them says "unpublished" today. index.html's <noscript> is static markup
     that cannot import credits.ts, and the pinned check below is a third copy —
     so publication that stops halfway fails here instead of shipping a page
     that cites the paper in the footer and calls it unpublished in the header. */
  const pending = {
    hd: /neobjavljen/.test(attr.sub),
    ft: /nije javno objavljen/.test(attr.ft),
    ns: /nije javno objavljen/.test(attr.ns),
  };
  ck('header, footer and <noscript> agree on whether the study is published',
    attr.sub.length > 60 && attr.ft.length > 40 && attr.ns.length > 40
    && pending.hd === pending.ft && pending.ft === pending.ns,
    JSON.stringify(pending));
  ck('the footer always carries a reference clause and the non-affiliation statement',
    /nije javno objavljen|preuzeti su iz rada:/.test(attr.ft) && /nije povezan/.test(attr.ft),
    attr.ft.slice(-220));
  /* The one deliberately state-dependent check in the block: today the paper is
     unpublished, and that is a fact about this vintage of the atlas the same way
     the ground-truth table is a fact about this vintage of the DZS series.
     Publication updates credits.ts, index.html's <noscript> and this line — in
     one commit, per CLAUDE.md. */
  ck('as of this build the study is unpublished, and the subtitle cites no year',
    pending.hd && pending.ft && !/\(\d{4}\.\)/.test(attr.sub), attr.sub);
  /* the disclosure is always visible, and it cost the map 11 px — pin both, so
     neither the footer nor the map can drift on the next copy edit */
  ck('the always-visible disclosure stays inside its lane at 1440',
    attr.ftH <= 72 && attr.boxH >= 560, JSON.stringify({ ftH: attr.ftH, boxH: attr.boxH }));

  /* the legend and the rail say "iz rada" in three places; the glossary is the
     only surface that can tell a reader what "rad" refers to */
  await fresh('#v=klas');
  const attrGloss = await page.evaluate(async () => {
    document.querySelector('#helpBtn').click();
    await new Promise(r => setTimeout(r, 300));
    const c = document.querySelector('#helpCard');
    const dts = [...c.querySelectorAll('.help-dl dt')];
    const i = dts.findIndex(d => d.textContent.trim() === 'rad');
    return {
      legend: document.querySelector('.legend-title').textContent,
      section: [...c.querySelectorAll('.help-h')].some(h => h.textContent.trim() === 'Rad i atribucija'),
      term: i >= 0 ? c.querySelectorAll('.help-dl dd')[i].textContent.trim() : null,
      body: c.textContent,
    };
  });
  ck('the glossary defines the "iz rada" shorthand the legend uses',
    /iz rada/.test(attrGloss.legend) && attrGloss.term != null
    && /Rad i atribucija/.test(attrGloss.term)
    && /nije javno objavljen/.test(attrGloss.term) === pending.ft,
    JSON.stringify({ legend: attrGloss.legend, term: attrGloss.term }));
  ck('and states independence, non-endorsement and what is not taken from the study',
    attrGloss.section && /nije povezan/.test(attrGloss.body) && /nisu pregledali/.test(attrGloss.body)
    && /Nijedna brojka nije preuzeta iz rada/.test(attrGloss.body),
    JSON.stringify({ section: attrGloss.section }));

  /* The export is the artifact that leaves the app, and Klasifikacija reproduces
     the study's threshold while Regije reproduces its grouping. Both formats,
     both views — and the four views that take nothing from it stay quiet. */
  const expNote = async h => {
    await fresh(h);
    return page.evaluate(() => {
      const s = window.__exportSVG(false);
      return { svg: s,
        has: /neobjavljenom znanstvenom radu|Klasifikacija i regije prema:/.test(s) && /nije povezan/.test(s) };
    });
  };
  const eKlas = await expNote('#v=klas');
  const eReg = await expNote('#v=reg&c=1&y=2024');
  const eSaldo = await expNote('');
  ck('exported klasifikacija and regije carry the pending reference and the disclaimer',
    eKlas.has && eReg.has, JSON.stringify({ klas: eKlas.has, reg: eReg.has }));
  ck('and the views that take nothing from the study claim nothing about it',
    !/nije povezan|neobjavljen/.test(eSaldo.svg), 'saldo');
  /* its own line, not glued onto the source credit: that line already runs
     ~950 px at 8,5 px mono, so an appended disclaimer is the half that gets
     clipped by the canvas edge */
  const noteRows = [...eKlas.svg.matchAll(/<text x="20" y="(\d+(?:\.\d+)?)"[^>]*font-size="8\.5"/g)]
    .map(m => +m[1]).sort((a, b) => a - b);
  const swatch = +(eKlas.svg.match(/<rect x="20" y="(\d+(?:\.\d+)?)" width="11"/) || [0, 0])[1];
  ck('the exported disclaimer is a line of its own, clear of the legend and the credit',
    noteRows.length === 2 && noteRows[1] - noteRows[0] === 14 && noteRows[0] - swatch >= 12,
    JSON.stringify({ noteRows, swatch }));

  /* ── errors, again, after the v2.0.5 block ── */
  await fresh('');
  ck('still zero page/console errors after the pass-3 surfaces',
    errors.length === 0, errors.join(' ; ').slice(0, 300));

  /* The suite is a fixed protocol, so its size is itself an invariant: three
     documents once claimed three different check counts and none was right.
     A deleted ck() is now a failure, not a quieter green run. */
  ck('the suite ran its full documented check count', n + 1 === EXPECTED_CHECKS, `${n + 1} vs ${EXPECTED_CHECKS}`);
})().then(
  () => finish(),
  e => { console.error('harness error:', e); return finish(2); },
);
