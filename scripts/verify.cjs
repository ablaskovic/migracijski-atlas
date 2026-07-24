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
  const cardRow = await page.evaluate(() => document.querySelector('#cardRow')?.textContent || '');
  ck('detail card year readout row (unut/vanj/prir/uk)',
    cardRow.includes('unut.') && cardRow.includes('vanj.') && cardRow.includes('prir.') && cardRow.includes('uk.'), cardRow.slice(0, 60));
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

  /* ── errors ── */
  ck('zero page/console errors', errors.length === 0, errors.join(' ; ').slice(0, 300));

  await browser.close();
  if (srv) srv.close();
  console.log(fails === 0 ? `\nALL ${n} CHECKS PASS` : `\n${fails}/${n} CHECKS FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('harness error:', e); process.exit(2); });
