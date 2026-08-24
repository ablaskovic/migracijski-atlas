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

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.map': 'application/json', '.xml': 'application/xml' };
/* Vercel serves these two from its own platform layer, so they exist on the
   deployed site and not in dist/. Unstubbed, every page load 404s twice and both
   "zero page/console errors" checks fail — which is what has happened on every
   run since the analytics commit, because the suite was not re-run with them.
   Stubbing keeps those two checks meaningful (a *new* 404 still fails them) and
   costs nothing else: the paths are same-origin, so the no-third-party-origin
   check is measuring the same thing it was. Recorded, and asserted below to have
   actually been requested — a stub nothing asks for would mean the analytics
   never loaded at all. */
const VERCEL_STUB = ['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js'];
const stubHits = new Set();
const notFound = [];

/* The deployed header policy, read from the file that deploys it and applied by
   the local server below — so the whole run happens under the real
   Content-Security-Policy instead of asserting that one exists. A policy that
   breaks the app then fails checks rather than passing them: Chrome logs every
   violation to the console, and this suite asserts zero console errors twice.
   Matching is by prefix, which is all the four sources in vercel.json need. */
const HEADERS = (() => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8'));
    return (cfg.headers || []).map(h => ({
      /* "/(.*)" → every path; "/assets/(.*)" → that prefix; "/(index.html)?" → the root */
      test: h.source === '/(.*)' ? () => true
        : h.source === '/(index.html)?' ? p => p === '/' || p === '/index.html'
          : p => p.startsWith(h.source.replace(/\(\.\*\)$/, '')),
      set: Object.fromEntries(h.headers.map(x => [x.key, x.value])),
    }));
  } catch { return []; }
})();
function policyFor(p) {
  const out = {};
  for (const h of HEADERS) if (h.test(p)) Object.assign(out, h.set);
  return out;
}

/* The deploy's catch-all rewrite, read from the file that deploys it and applied
   by the server below — the same treatment the header policy already gets, for
   the same reason. The check guarding this rule used to grep the *source string*
   for two substrings; it never read `destination`, never issued a request, and
   this server implemented no rewrite at all — it 404'd every sub-path. So the
   destination could be changed to `/index`, a file that does not exist and would
   leave every deep link dead on the deployed site, and the check still passed.
   Vercel anchors a rewrite source against the whole path, hence the ^…$. */
const REWRITE = (() => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8'));
    const r = (cfg.rewrites || [])[0];
    return r ? { re: new RegExp('^' + r.source + '$'), to: r.destination } : null;
  } catch { return null; }
})();
/* paths this run asks for on purpose expecting a 404 — kept out of the
   end-of-run "the only paths dist cannot answer are the two platform routes" */
const probe404 = new Set();

function serve(dir) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (VERCEL_STUB.includes(p)) {
        stubHits.add(p);
        res.writeHead(200, { 'content-type': 'text/javascript', ...policyFor(p) });
        res.end('/* Vercel platform route, stubbed by scripts/verify.cjs */');
        return;
      }
      if (p.endsWith('/')) p += 'index.html';
      const f = path.resolve(dir, '.' + path.posix.normalize('/' + p));
      /* localhost-only and test-scoped, but `..%2f..%2f` still read outside dist */
      if (f !== dir && !f.startsWith(dir + path.sep)) { res.writeHead(403); res.end('no'); return; }
      fs.readFile(f, (err, data) => {
        if (err) {
          /* the deploy answers an unknown path with the app itself, so the
             harness does — and only for the paths the real rule matches, so a
             missing asset or font still 404s here exactly as it would there */
          if (REWRITE && REWRITE.re.test(p)) {
            const idx = path.resolve(dir, '.' + REWRITE.to);
            fs.readFile(idx, (e2, d2) => {
              if (e2) { notFound.push(p + ' → ' + REWRITE.to); res.writeHead(404); res.end('nope'); return; }
              res.writeHead(200, { 'content-type': 'text/html', ...policyFor(p) });
              res.end(d2);
            });
            return;
          }
          notFound.push(p); res.writeHead(404); res.end('nope'); return;
        }
        res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', ...policyFor(p) });
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
const EXPECTED_CHECKS = 428;
async function finish(code) {
  try { if (browser) await browser.close(); } catch { /* already gone */ }
  try { if (srv) srv.close(); } catch { /* already gone */ }
  /* The banner used to be chosen from `fails` alone and never consulted `code`
     or how many checks had actually run. Most DOM regressions surface here as a
     *throw* — `querySelector(...).textContent` throws rather than returning
     falsy — and a throw unwinds to the outer handler, which calls finish(2). At
     that point fails is 0, so a run that died at check 31 printed
     "ALL 30 CHECKS PASS" as its last line: success-shaped output for a run that
     never reached check 32. The invariant meant to catch exactly that is the
     LAST ck() in the file, i.e. the one thing an abort is guaranteed to skip.
     The banner reads both now, so an incomplete run cannot end on a green line. */
  const short = n < EXPECTED_CHECKS;
  console.log(fails ? `\n${fails}/${n} CHECKS FAILED`
    : (code || short) ? `\nABORTED after ${n}/${EXPECTED_CHECKS} CHECKS`
      : `\nALL ${n} CHECKS PASS`);
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
  /* URL mode was guaranteed red against every possible host, with failures that
     indicted the app rather than the harness: it skipped serve(), so the two
     /_vercel platform routes were never stubbed and `stubHits.size === 2` could
     not hold, and `entryKB` resolved the URL as a local directory and measured 0.
     Both are harness facts, not app facts, so both are scoped to the mode that
     can answer them — and in URL mode the platform routes are stubbed through
     request interception instead of through the server. */
  const URLMODE = /^https?:/.test(arg);
  if (!URLMODE) {
    const dir = path.resolve(arg);
    if (!fs.existsSync(path.join(dir, 'index.html'))) { console.error('no index.html in ' + dir + ' — run `npm run build` first'); process.exit(2); }
    ({ srv, url } = await serve(dir));
  }

  /* --lang pins the UI language of the browser itself; the override below pins
     what the app actually reads. Both, because they are different things and
     only the second is what `detectLang()` consults.
     Without this the whole suite silently flipped: headless Chrome reports
     en-US, so the atlas booted in ENGLISH and every check matching Croatian
     text — around fifty of them — failed at once. Pinning it here keeps the
     existing checks meaning what they meant, and the English surface gets its
     own block at the end rather than being tested by accident. */
  browser = await puppeteer.launch({ args: ['--no-sandbox', '--force-device-scale-factor=1', '--lang=hr-HR'] });
  const page = await browser.newPage();
  /* A real visitor's tab is focused; a headless one is not, and nothing in the
     suite noticed until a check pressed Tab. Tab past the last stop of a modal
     hands focus to the browser UI — and in headless there is no way back: from
     that press on `document.hasFocus()` stayed false *across navigations*, and
     a focused document is what makes `el.focus()` fire a focus event at all.
     Measured: after a 60-press walk, `.cnt[data-iso="HR-18"].focus()` on a
     freshly loaded page fired no focus handler, set no highlight and matched no
     :focus-visible — so the tooltip check three blocks later failed while the
     app was innocent. Every keyboard check in the file rests on this, and every
     one of them was one Tab press away from measuring nothing. */
  await (await page.createCDPSession()).send('Emulation.setFocusEmulationEnabled', { enabled: true });
  /* No HTTP cache. The deployed policy this suite now serves marks
     /assets/* immutable for a year, and a memory-cached response is never a
     request — so the checks that abort a chunk to test its failure UI silently
     stopped seeing one, and passed the bug. A harness that repeats the same
     navigation dozens of times wants every load to be a real load anyway. */
  await page.setCacheEnabled(false);
  const pinHr = pg => pg.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'languages', { get: () => ['hr-HR', 'hr'], configurable: true });
    Object.defineProperty(navigator, 'language', { get: () => 'hr-HR', configurable: true });
    /* a stored choice outranks the browser, so it has to be cleared too or a
       previous run's toggle would decide this one */
    try { localStorage.removeItem('atlas-lang'); } catch { /* private mode */ }
  });
  await pinHr(page);
  /* The default language now reads a region signal as well as a language one,
     and the machine running this suite has a timezone of its own. Pinned so the
     rest of the file measures one fixed reader rather than whoever ran it —
     Zagreb, which agrees with the hr-HR pin above. */
  await page.emulateTimezone('Europe/Zagreb');
  await page.setViewport({ width: 1440, height: 900 });
  /* index.html used to load Oswald + IBM Plex from fonts.googleapis.com, and
     `waitUntil: 'networkidle0'` waited on it — so the suite depended on the
     network, and at least four checks are font-metric-dependent (header
     height, scrubber tick clipping, the exported-SVG title fit, PNG dims). A
     box with no egress silently measured the Arial Narrow fallback instead,
     and stubbing the host made every run measure that fallback deterministically
     — deterministic, but not what a visitor sees.
     The fonts are self-hosted now (src/fonts, faces in src/index.css), so those
     four checks measure the real faces and the interception has the opposite
     job: prove the page reaches **no** third-party origin at all. Anything
     off-origin is recorded and the run asserts the list is empty. */
  const thirdParty = [];
  const ORIGIN = new URL(url).origin;
  /* Recording was attached to the main page only, and the invariant was asserted
     once, mid-run: everything after that point — every English boot, all the
     v2.0.6–v2.3.x blocks — could reach off-origin and never be looked at, and the
     sixteen bootLang pages and the two font-swap pages recorded nothing at all.
     Every page the suite opens goes through here now, and the assertion is
     repeated at end-of-run beside the second zero-errors check. */
  const watch = async (pg, abortIf) => {
    await pg.setCacheEnabled(false);
    await pg.setRequestInterception(true);
    /* ONE handler per page: a second `page.on('request')` makes both call
       continue() on the same request and puppeteer throws "Request is already
       handled", so a page that needs to block something passes a predicate
       rather than installing its own. */
    pg.on('request', r => {
      const u = r.url();
      if (/^https?:/.test(u) && new URL(u).origin !== ORIGIN) thirdParty.push(u);
      if (abortIf && abortIf(u)) return r.abort();
      return r.continue();
    });
    return pg;
  };
  await page.setRequestInterception(true);
  /* one handler only — a second `page.on('request')` makes both call continue()
     on the same request and puppeteer throws "Request is already handled" */
  let blockGeoChunk = false, blockEntry = false;
  page.on('request', r => {
    const u = r.url();
    if (/^https?:/.test(u) && new URL(u).origin !== ORIGIN) thirdParty.push(u);
    /* URL mode has no local server to stub the two Vercel platform routes, so
       they are stubbed here instead — same effect, same recorded hits */
    if (URLMODE && VERCEL_STUB.some(v => new URL(u).pathname === v)) {
      stubHits.add(new URL(u).pathname);
      return r.respond({ status: 200, contentType: 'text/javascript',
        body: '/* Vercel platform route, stubbed by scripts/verify.cjs */' });
    }
    /* `blockGeoChunk` names which payload to drop: the JLS chunk by default, and
       'reg' for the region outlines, whose failure UI had no importers at all. */
    if (blockGeoChunk && new RegExp(blockGeoChunk === 'reg' ? 'geo_regions5' : 'geo_jls').test(u)) return r.abort();
    /* a purged hashed chunk against a cached index.html — the ordinary way the
       first-paint placeholder is left with nothing to replace it */
    if (blockEntry && /\/assets\/index-[\w-]+\.js$/.test(u)) return r.abort();
    return r.continue();
  });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  /* the URL as well as the text: Chrome's "Failed to load resource" message does
     not name what failed, and the deliberate-abort scrub below has to be able to
     drop exactly the one it caused and nothing else */
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const at = (m.location() || {}).url || '';
    errors.push('console: ' + m.text() + (at ? ' @ ' + at : ''));
  });

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
  /* +26.601 is Asia's DOSELJENI, not its net — the net is +21.675. The three
     figures either side of it on this row are d / o / net, which is what made
     the bare number read as a fourth net. */
  ck('citz 2024 Azija doseljeni +26.601', citz.rows.includes('+26.601'));
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
  /* The band heights are computed from measured text now (the credit rows wrap,
     and the title wraps rather than running through the period), so pinning a
     constant here would pin one viewport width. The real invariant is that the
     two formats are twins: the PNG is exactly 2× the SVG the same state emits. */
  const png = await page.evaluate(async () => {
    const r = await window.__exportPNG(false);
    const svg = document.querySelector('#map');
    const doc = window.__exportSVG(false);
    const m = /<svg[^>]*width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/.exec(doc);
    return { ...r, expW: svg.clientWidth * 2, expH: (+m[2]) * 2, svgW: +m[1] };
  });
  ck('exportPNG dims = 2x the SVG twin, width = 2x map', png.w === png.expW && png.h === png.expH,
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
  /* By content, not by DOM order. The year ticks are rendered before the EU
     marker label, so `ts[ts.length - 1]` was always the "EU" text at x(2013)+3 —
     538 px of slack against the chart's right edge, while the real 2025 tick sits
     6 px from it. Dropping `textAnchor={t === YEND ? 'end' : 'middle'}` from
     Scrubber hangs the 2025 label ~19 px past the edge and clips it, and this
     printed ok. The `found === 1` floor keeps a selector miss a failure rather
     than a silent pass, and both edges are checked because the name says "fully
     inside". English renders the year without the Croatian ordinal dot. */
  const tick = await page.evaluate(() => {
    const svg = document.querySelector('#spark');
    const ts = [...svg.querySelectorAll('text')].filter(t => /^2025\.?$/.test(t.textContent.trim()));
    const found = ts.length;
    if (found !== 1) return { found };
    const b = ts[0].getBBox();
    const ctm = ts[0].getScreenCTM();
    const r = svg.getBoundingClientRect();
    return { found, left: ctm.e + b.x, right: ctm.e + b.x + b.width, min: r.left, max: r.right };
  });
  ck('scrubber 2025 tick fully inside chart',
    tick.found === 1 && tick.right <= tick.max + 0.5 && tick.left >= tick.min - 0.5,
    JSON.stringify(tick));

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
      /* `.catch`, like every other jmap wait in this file. Without it a loaded
         box that misses 15 s on the 464 kB chunk rejected here, which killed the
         whole run from inside a helper — a hard abort where a normal FAIL on the
         checks that follow is both truer and readable. */
      await page.waitForFunction(() => document.querySelectorAll('#map .jl').length === 556, { timeout: 15000 })
        .catch(() => {});
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

  /* ── reset must not desync the language ──
     `resetAll` used to call setS directly, bypassing `up` — the only writer that
     moves the module language mirror. BASE.lang is resolved once at module init,
     so after EN → ⟲ the state said Croatian, the page went on rendering English,
     #segLang reported HR pressed, pressing HR was a no-op (up()'s guard saw no
     change), and the permalink dropped `l=` so a link copied from a visibly
     English page opened Croatian for its recipient. Run in the hr-pinned browser
     with no stored choice, which is exactly the reader who hits it. */
  await fresh('#v=saldo&c=1&y=2024');
  const langReset = await page.evaluate(async () => {
    const snap = () => ({
      html: document.documentElement.lang,
      h1: document.querySelector('.hd-title').textContent.trim(),
      pressed: document.querySelector('#segLang button[aria-pressed="true"]').dataset.l,
      hash: location.hash,
      val: document.querySelector('#railList .rrow .rval').textContent,
    });
    document.querySelector('#segLang button[data-l="en"]').click();
    await new Promise(r => setTimeout(r, 300));
    const en = snap();
    document.querySelector('#resetBtn').click();
    await new Promise(r => setTimeout(r, 300));
    const after = snap();
    /* and the switch is still a live control in both directions */
    document.querySelector('#segLang button[data-l="hr"]').click();
    await new Promise(r => setTimeout(r, 300));
    return { en, after, back: snap() };
  });
  ck('reset keeps the language it was pressed in, and says so in the link',
    langReset.after.html === 'en' && langReset.after.pressed === 'en'
    && /l=en/.test(langReset.after.hash) && /,/.test(NBSP(langReset.after.val)),
    JSON.stringify(langReset.after));
  ck('and the language switch still works in both directions after a reset',
    langReset.back.html === 'hr' && langReset.back.pressed === 'hr'
    && !/l=/.test(langReset.back.hash) && /\./.test(NBSP(langReset.back.val)),
    JSON.stringify(langReset.back));
  await fresh('');

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
    /* a named feature, not whichever one holds the roving stop: j=451 is Split,
       already the fixture the tooltip check above hovers */
    split: (document.querySelector('.jl[data-j="451"]') || {}).getAttribute?.('aria-label') || '',
    role: document.querySelector('#map').getAttribute('role') }));
  ck('JLS map exposes one roving tab stop', jkey.zero === 1, String(jkey.zero));
  /* The message names three things and the assertion tested two substrings, both
     of them value words. Drop the `${p.n}, ${SHORTN[…]}: ` prefix from MapView's
     label — an ordinary edit when refactoring the builder — and all 556
     municipalities announce themselves as an anonymous "doseljeno 12, odseljeno
     18, neto −6", which makes the municipal map unusable without sight; this was
     the only check guarding that label, and it still printed ok. Anchor the whole
     shape on a named feature so the name and the county are pinned too. */
  ck('JLS feature carries name, county and values in its label',
    /^Split, Splitsko-dalm\.: doseljeno [\d.]+, odseljeno [\d.]+, neto [+−]?[\d.]+$/.test(jkey.split),
    jkey.split);
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
      /* "is it positioned" was never the right question. `.storybar` computes to
         `static`, so #storyBar was filtered out of this sweep at every width in
         every state — the element the sweep was written for could not be seen by
         it. "Does it have a box" is the question: an in-flow element can be
         overlapped by an absolutely positioned one just as easily. */
      .filter(([, e]) => e && e.getBoundingClientRect().width > 0
        && e.getBoundingClientRect().height > 0
        && getComputedStyle(e).display !== 'none'
        && getComputedStyle(e).visibility !== 'hidden');
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
  /* Four edges, and a height sweep, because the failure is height-driven: the
     bottom edge was simply not tested, and at the suite's single 1440×900
     viewport the card is short enough that it would have passed anyway.
     Measured at 1440×620 before the .card cap landed: the glossary ended at
     y=268 and the card ran to 413,3, leaving 145,3 px of it in plain sight under
     the panel — `covers` true, `peek` reported as 0. */
  for (const [vw, vh] of [[1440, 900], [1440, 768], [1440, 620], [1280, 700]]) {
    await page.setViewport({ width: vw, height: vh });
    await fresh('#s=HR-18');
    await click('#helpBtn');
    const cov = await page.evaluate(() => {
      const c = document.querySelector('#card').getBoundingClientRect();
      const h = document.querySelector('#helpCard').getBoundingClientRect();
      return { covers: h.top <= c.top + 0.5 && h.left <= c.left + 0.5
          && h.right >= c.right - 0.5 && h.bottom >= c.bottom - 0.5,
      peek: Math.round(Math.max(h.top - c.top, c.bottom - h.bottom)) };
    });
    ck(`help panel fully covers the detail card it overlays (${vw}x${vh})`,
      cov.covers, 'peek ' + cov.peek + ' px');
  }
  await page.setViewport({ width: 1440, height: 900 });

  /* the glossary's own first section explains the colour scale, so it must not
     be sitting on the colour scale — 176 px of reserve is the tallest legend
     plus a gap. The tallest legend is the ENGLISH klas one, at 148,4 px off the
     map's bottom edge against Croatian's 137,4: the reserve was measured in one
     language and checked in one language, which left 15,6 px of clearance rather
     than the ~26 px the number was chosen for. Both languages now. */
  for (const [lang, pre] of [['hr', '#'], ['en', '#l=en&']]) {
    await fresh(pre + 'v=klas&c=1&y=2024&tr=1&tp=1.5');
    await click('#helpBtn');
    const helpLeg = await page.evaluate(() => {
      const h = document.querySelector('#helpCard').getBoundingClientRect();
      const g = document.querySelector('#legend').getBoundingClientRect();
      const box = document.querySelector('.map-box').getBoundingClientRect();
      return { over: Math.round(Math.max(0, Math.min(h.right, g.right) - Math.max(h.left, g.left))
        * Math.max(0, Math.min(h.bottom, g.bottom) - Math.max(h.top, g.top))),
      lane: +(box.bottom - g.top).toFixed(1), gap: +(g.top - h.bottom).toFixed(1) };
    });
    ck(`open glossary does not cover the legend, and clears it (${lang})`,
      helpLeg.over === 0 && helpLeg.lane < 176 && helpLeg.gap >= 8, JSON.stringify(helpLeg));
  }

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
  for (let i = 0; i < 15; i++) {
    await fresh('');
    await page.select('#story', String(i));
    await settle(260);
    const h = await page.evaluate(() => location.hash);
    await fresh(h);
    const kept = await page.evaluate(() => !!document.querySelector('#storyCap'));
    if (!kept) trip.push((i + 1) + ':' + h);
  }
  ck('all 15 Nalazi round-trip through their own permalink', trip.length === 0, trip.join(' | '));

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

  /* ── the picker is a third route into a view and owes the same clamps ──
     `applyStory` used to write the preset's patch straight into state, running
     neither `setView`'s transition nor `decodeHash`'s repairs. Four legs, all
     reproduced through the in-app picker. */
  await fresh('#v=flow&s=HR-21&c=0&y=2018&jl=1');
  const st1 = await page.evaluate(async () => {
    const sel = document.querySelector('#story');
    sel.value = '4';                                   /* Nalaz 5 — Klasifikacija */
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    return { hash: location.hash, panelOpen: document.body.classList.contains('panel-open'),
      jcard: !!document.querySelector('#jcard.show') };
  });
  ck('picking a Nalaz out of Tokovi drops the JLS chip instead of shipping a dead flag',
    !/jl=/.test(st1.hash) && !st1.panelOpen && !st1.jcard, JSON.stringify(st1));

  await fresh('#v=flow&s=HR-21&pp=HR-01&dir=net&c=0&y=2018');
  const st2 = await page.evaluate(async () => {
    const sel = document.querySelector('#story');
    sel.value = '5';                                   /* Nalaz 6 — Regije */
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    return { hash: location.hash, pair: !!document.querySelector('#pair') };
  });
  ck('and it drops the corridor instead of carrying half of one into Regije',
    !/pp=/.test(st2.hash) && !/s=HR/.test(st2.hash) && !st2.pair, JSON.stringify(st2));

  /* the per-view year memory: the identical navigation via the segments
     restores godišnje 2015, so the picker has to as well */
  await fresh('#v=saldo&c=0&y=2015');
  const st3 = await page.evaluate(async () => {
    const sel = document.querySelector('#story');
    sel.value = '5';                                   /* Nalaz 6 — Regije, kum 2024 */
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    document.querySelector('#segView button[data-v="saldo"]').click();
    await new Promise(r => setTimeout(r, 350));
    return { yr: document.querySelector('#bigYear').textContent, hash: location.hash };
  });
  ck('a Nalaz records the year window it leaves, so going back restores it',
    /2015/.test(st3.yr) && /c=0/.test(st3.hash), JSON.stringify(st3));

  /* flowSeen: the Matrica preset is an entry into a flow-ish view, so a later
     press of Tokovi must not re-fire the first-entry jump to 2018 */
  await fresh('');
  const st4 = await page.evaluate(async () => {
    const sel = document.querySelector('#story');
    sel.value = '14';                                  /* Nalaz 15 — Matrica 2018 */
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    document.querySelector('#segMode button[data-v="cum"]').click();
    await new Promise(r => setTimeout(r, 250));
    const sp = document.querySelector('#spark');
    sp.focus();
    sp.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    const built = location.hash;
    document.querySelector('#segView button[data-v="flow"]').click();
    await new Promise(r => setTimeout(r, 350));
    return { built, yr: document.querySelector('#bigYear').textContent, hash: location.hash };
  });
  ck('and entering Matrica through the picker retires the first-entry jump',
    /c=1&y=2025/.test(st4.built) && /c=1/.test(st4.hash) && /y=2025/.test(st4.hash),
    JSON.stringify(st4));

  /* ══════════ overlays: rect overlap is not the same as reachable ══════════ */
  /* elementFromPoint, not bounding boxes: the banner covered the Dob i spol chip
     at every width from 1200 to 1600 and a click on it did nothing. */
  const reach = [], probedAll = new Set();
  for (const w of [1600, 1440, 1280, 1100, 1000, 960]) {
    await page.setViewport({ width: w, height: 900 });
    for (const h of ['#v=saldo&f=ext&c=0&y=2025&cz=1&st=4', '#v=reg&c=1&y=2024&st=6',
      '#v=saldo&c=1&y=2024&s=HR-18&ag=1', '#v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0&jl=1']) {
      await fresh(h);
      const bad = await page.evaluate(() => {
        const out = [];
        window.probed = window.probed || new Set();
        const probed = window.probed;
        /* #storyX was missing from this list, and it is the one control the sweep
           would have caught: the chip dock covered 323 of its 323 px² at four of
           six desktop widths and the click opened a panel instead. */
        for (const sel of ['#ageHd', '#citzHd', '#jcardHd', '#cardX', '#helpBtn', '#storyX', '#pairX']) {
          const e = document.querySelector(sel);
          if (!e || !e.offsetParent) continue;
          const r = e.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (hit && !e.contains(hit) && hit !== e) out.push(sel + '<' + (hit.id || hit.className));
          probed.add(sel);
        }
        return out;
      });
      if (bad.length) reach.push(w + ' ' + h.slice(0, 22) + ' ' + bad.join(','));
      (await page.evaluate(() => [...(window.probed || [])])).forEach(x => probedAll.add(x));
    }
  }
  ck('every chip header and close button is actually clickable, 960–1600 px',
    reach.length === 0, reach.slice(0, 4).join(' | '));
  /* A sweep that probes nothing passes. Name the floor so it cannot: every
     selector above has to have been reachable in at least one of the states. */
  ck('and the reachability sweep actually probed all seven controls',
    probedAll.size === 7, [...probedAll].join(','));

  /* the same overlap sweep the zoom test runs, but over the full overlay set and
     across the widths between the two viewports the suite otherwise pins */
  const allOv = () => page.evaluate(() => {
    const ids = ['#labBtn', '#helpBtn', '#zoomRst', '#pair', '#jcard', '#card', '#legend', '#chipdock', '#storyBar'];
    /* The dock's own border box stopped being what it covers. Its open panel
       body is a positioned descendant anchored ABOVE the header stack, so it
       falls outside that box entirely (index.css .chipdock) — measuring the
       rect alone would have quietly stopped testing the open panel here, which
       is the state this sweep exists for. The union is what a reader sees. */
    const box = e => {
      if (!e.classList.contains('chipdock')) return e.getBoundingClientRect();
      const bs = [...e.querySelectorAll('.chipcard, .chipcard.open .chip-body')]
        .filter(c => c.getClientRects().length).map(c => c.getBoundingClientRect());
      if (!bs.length) return e.getBoundingClientRect();
      return { left: Math.min(...bs.map(b => b.left)), right: Math.max(...bs.map(b => b.right)),
        top: Math.min(...bs.map(b => b.top)), bottom: Math.max(...bs.map(b => b.bottom)) };
    };
    /* No `position !== 'static'` filter. It looked like "only compare things that
       float", and what it actually did was delete the Nalazi banner from every
       comparison this sweep has ever made: .storybar declares no position, so it
       computes to static and was dropped at all six widths in all four states —
       560x52 px of visible, opaque banner, invisible to the check. #pair is
       static below 961 too, so the 960 column lost the corridor card as well.
       The predicate is the one the zoom sweep was already corrected to: a
       non-zero box that is actually displayed. Overlap is about boxes; how a box
       got where it is does not change what it covers. */
    const els = ids.map(s => [s, s === '#chipdock' ? document.querySelector('.chipdock') : document.querySelector(s)])
      .filter(([, e]) => e && e.getBoundingClientRect().width > 0
        && getComputedStyle(e).display !== 'none'
        && getComputedStyle(e).visibility !== 'hidden')
      .map(([s, e]) => [s, box(e)]);
    const bad = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i][1], b = els[j][1];
      const ov = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
        * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (ov > 1) bad.push(els[i][0] + '×' + els[j][0] + '=' + Math.round(ov));
    }
    return { bad, n: els.length, ids: els.map(e => e[0]) };
  });
  const midOv = [], midSeen = new Set();
  let midMin = 99;
  /* Height is a swept dimension here, not a constant. Every sweep in this file
     pinned height at 900 and the one height sweep below loads a single flow
     state whose element set is #pair against .chipdock — so #card and #legend
     appeared in neither, and the plane where they collide was never visited with
     them in it. Measured on the shipped build before the .card cap: at 1440×900
     the legend sits at 610–698 and the card at 154–413, no overlap; at 1280×700
     in the *same* state the legend moves to 410–498 while the card stays at
     208–467 and wins on z-index — 16.118 px² of overlap, and elementFromPoint at
     five points across the legend's mid-line returns the card at all five. The
     colour ramp, the ±44.383 ticks and the caption — the only key to the
     choropleth — 100 % hidden. Also 998 px² at 1600×700 and 718 px² at 1024×768. */
  for (const [w, hv] of [[1600, 900], [1600, 700], [1440, 900], [1280, 900], [1280, 700],
    [1200, 720], [1100, 900], [1024, 768], [1000, 700], [960, 900], [960, 700]]) {
    await page.setViewport({ width: w, height: hv });
    /* the matrix with the *taller* age panel open is the placement search's
       worst case and was never in this sweep */
    for (const h of ['#v=saldo&c=1&y=2024&s=HR-18&ag=1', '#v=saldo&f=ext&c=0&y=2025&cz=1&st=4',
      '#v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0&jl=1', '#v=mx&y=2018&c=0&dir=net&ag=1']) {
      await fresh(h);
      const r = await allOv();
      midMin = Math.min(midMin, r.n);
      r.ids.forEach(i => midSeen.add(i));
      if (r.bad.length) midOv.push(w + 'x' + hv + ':' + r.bad.join(','));
    }
  }
  ck('no map overlay overlaps another, 960–1600 px wide and 700–900 px tall',
    midOv.length === 0, midOv.slice(0, 4).join(' | '));
  /* A count floor cannot see an element that was never admitted: `n` is computed
     from the same filtered list, so an id the filter drops can neither raise
     `bad` nor lower `n`, and the sweep reported a healthy 3–6 while comparing
     the banner against nothing. Name the ids instead. #zoomRst is the one id in
     the list no state here produces (it needs k > 1), so eight is the whole set;
     #storyBar and #pair are named outright because they are the two the old
     filter removed. */
  ck('the overlay sweep compared every overlay it lists, the static ones included',
    midMin >= 3 && midSeen.size >= 8 && midSeen.has('#storyBar') && midSeen.has('#pair'),
    JSON.stringify({ midMin, seen: [...midSeen].sort() }));
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

  /* ── a phone held sideways is not a desktop ──
     The scrolling layout used to be gated on width alone, and the pinned
     one-viewport column above it gives .map-box `flex:1;min-height:0` with no
     desktop floor. A flagship phone in landscape (iPhone 15 Pro Max 932×430,
     Galaxy S23 Ultra 915×412) clears 900 px by a handful of pixels: measured at
     901×430, #map came out 609×**0** — the choropleth, the whole page, gone —
     the rail list got 4 px for 21 rows, and .ft started at y=439 inside a 430 px
     viewport under `overflow:hidden`, unreachable by wheel or touch. */
  const landsc = [];
  for (const [vw, vh] of [[901, 430], [932, 430], [915, 412]]) {
    await page.setViewport({ width: vw, height: vh });
    await fresh('');
    const r = await page.evaluate(() => {
      const b = document.querySelector('.map-box').getBoundingClientRect();
      const f = document.querySelector('.ft').getBoundingClientRect();
      return { map: Math.round(b.height),
        scrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
        reach: f.top < document.documentElement.scrollHeight };
    });
    if (r.map < 240 || !r.scrolls || !r.reach) landsc.push(vw + 'x' + vh + ' ' + JSON.stringify(r));
  }
  ck('a landscape phone gets the scrolling layout and a map with height in it',
    landsc.length === 0, landsc.join(' | '));

  /* ── a reserve that resolves to nothing is not a reserve ──
     Every floating panel is capped by a subtraction against the map stage, and a
     negative calc() is clamped to 0 at used-value time — so on a short stage the
     panel did not shrink, it disappeared. Measured before the floors: at
     1024×600 with a coarse pointer the glossary rendered 330×22, padding and
     borders and none of its 1.463 px of text, while #helpBtn reported
     aria-pressed="true"; the citizenship body computed 0px of max-height against
     362 px of content. Assert the *resolved* height of each panel instead of the
     expression that produced it. */
  const sliver = [];
  for (const [vw, vh] of [[1024, 600], [1440, 600], [1366, 600], [1024, 700], [901, 700], [1280, 620]]) {
    await page.setViewport({ width: vw, height: vh });
    for (const [h, sel] of [['#s=HR-18', '#helpCard'], ['#cz=1', '#citz .chip-body'],
      ['#v=flow&s=HR-17&pp=HR-21&y=2018&c=0', '.paircard'],
      ['#v=flow&s=HR-21&jl=1', '.jcard']]) {
      await fresh(h);
      if (sel === '#helpCard') await click('#helpBtn');
      const box = await page.evaluate(s => {
        const e = document.querySelector(s);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { h: Math.round(r.height), scroll: e.scrollHeight, vis: getComputedStyle(e).display !== 'none' };
      }, sel);
      /* one row of content, not merely non-zero: a 22 px box is the empty case */
      if (box && box.vis && box.h < 60) sliver.push(vw + 'x' + vh + ' ' + sel + ' ' + JSON.stringify(box));
    }
  }
  ck('no floating panel collapses to an empty sliver on a short stage',
    sliver.length === 0, sliver.slice(0, 3).join(' | '));
  await page.setViewport({ width: 1440, height: 900 });

  /* ── the same two boxes, swept by HEIGHT ──
     Every sweep above varies the width at a fixed height of 900, and this
     collision is driven by height: the corridor card (top:44, z-index 5) and the
     chip dock (bottom:12, z-index 4) share the map stage's right edge, so when
     the stage is short the card's bottom lands past the dock's top and wins.
     Measured before the fix with real mouse clicks at 1024×768 with a coarse
     pointer: elementFromPoint at the centre of #ageHd returned #pairSvg and at
     #citzHd .pair-note — both headers dead, and a header is those panels' only
     pointer affordance. Clean at 900 px tall, broken at 768 and 700, which is
     the single most common desktop viewport and every touchscreen up to 900. */
  const shortStage = [];
  for (const [w, h, touch] of [[1024, 768, true], [1024, 768, false], [1280, 700, false],
    [1366, 768, false], [1440, 900, false], [1600, 1000, false]]) {
    await page.setViewport({ width: w, height: h, isMobile: touch, hasTouch: touch });
    await fresh('#v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0');
    const bad = await page.evaluate(() => {
      const out = [];
      const card = document.querySelector('#pair').getBoundingClientRect();
      const dock = document.querySelector('.chipdock').getBoundingClientRect();
      if (card.bottom > dock.top) out.push('card' + Math.round(card.bottom) + '>dock' + Math.round(dock.top));
      /* the whole face, not the centre alone: a header half-covered is a header
         whose visible half is a lie about where the control is */
      for (const id of ['#ageHd', '#citzHd', '#pairX']) {
        const e = document.querySelector(id);
        if (!e) { out.push(id + ':absent'); continue; }
        const b = e.getBoundingClientRect();
        for (const [fx, fy] of [[0.1, 0.5], [0.3, 0.5], [0.5, 0.5], [0.7, 0.5], [0.9, 0.5]]) {
          const hit = document.elementFromPoint(b.left + b.width * fx, b.top + b.height * fy);
          if (!(hit && (hit === e || e.contains(hit)))) {
            out.push(id + '@' + fx + '<' + (hit ? (hit.id || hit.className) : 'null'));
          }
        }
      }
      return out;
    });
    if (bad.length) shortStage.push(`${w}x${h}${touch ? ' touch' : ''} ${bad.join(',')}`);
  }
  ck('the corridor card clears the chip dock at every stage height, not only at 900 px',
    shortStage.length === 0, shortStage.slice(0, 3).join(' | '));

  /* ── 901–960 px: the band the width sweeps stop just short of ──
     The sweep above bottoms out at 960, and this band is where .paircard has
     just gone static: in the pinned desktop column its ~215 px came off the map,
     which measured 14 px tall at 901x700 and 80 at 941x700. A stage that short
     cannot hold the top strip and the bottom-anchored dock at once, and the two
     shared z-index 4 — so DOM order decided, the dock is the later sibling, and
     it took the "Aa oznake" button's clicks: 0 of 9 face points reachable at
     941x700 and a real click at the centre opening the Dob i spol panel (ag=1)
     instead. Pressing one control and activating another is the failure class
     commit 988c913 already fixed once for the Nalazi banner.
     Driven with a real mouse, and the two chip headers are probed in the same
     pass: raising the button above the dock without giving the stage its height
     back would only have swapped which control is dead (measured, #ageHd went
     4/5 → 2/5 that way). */
  const labBand = [];
  for (const [w, h] of [[901, 700], [921, 700], [941, 700], [960, 700], [901, 768], [941, 820]]) {
    await page.setViewport({ width: w, height: h });
    await fresh('#v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0');
    const reach = await page.evaluate(() => {
      const out = {};
      for (const id of ['#labBtn', '#ageHd', '#citzHd']) {
        const e = document.querySelector(id);
        if (!e) { out[id] = 'absent'; continue; }
        const b = e.getBoundingClientRect();
        out[id] = [[0.1, 0.5], [0.3, 0.5], [0.5, 0.5], [0.7, 0.5], [0.9, 0.5]].filter(([fx, fy]) => {
          const hit = document.elementFromPoint(b.left + b.width * fx, b.top + b.height * fy);
          return hit && (hit === e || e.contains(hit));
        }).length;
      }
      const b = document.querySelector('#labBtn').getBoundingClientRect();
      out.at = [b.left + b.width / 2, b.top + b.height / 2];
      return out;
    });
    await page.mouse.click(reach.at[0], reach.at[1]);
    await settle(280);
    const after = await page.evaluate(() => ({ hash: location.hash,
      lb: document.querySelector('#labBtn').getAttribute('aria-pressed') }));
    if (reach['#labBtn'] !== 5 || reach['#ageHd'] !== 5 || reach['#citzHd'] !== 5
      || after.lb !== 'true' || !/lb=1/.test(after.hash) || /[&#](ag|cz)=/.test(after.hash)) {
      labBand.push(`${w}x${h} lab${reach['#labBtn']} age${reach['#ageHd']} citz${reach['#citzHd']} → ${after.hash}`);
    }
  }
  ck('at 901–960 px the labels toggle takes its own click, and the chip headers keep theirs',
    labBand.length === 0, labBand.slice(0, 3).join(' | '));
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

  /* ── Tokovi: the county label states the direction of each of its numbers ──
     The same contract the matrix cells are held to at :1211, on the surface that
     had it inverted: `iz {hub}` is the hub → county flow and `u {hub}` the
     county → hub one. Pinned against the ground-truth pair (GZ → Zagrebačka
     2.311, Zagrebačka → GZ 1.977) and run at all three Smjer settings, because
     the label is direction-independent by construction and a regression that
     made it direction-dependent would be the same class of defect. #tip is
     aria-hidden, so this string is the only copy of these numbers for AT. */
  for (const dir of ['out', 'in', 'net']) {
    await fresh('#v=flow&s=HR-21&dir=' + dir + '&c=0&y=2018');
    const fLab = await page.evaluate(() => document.querySelector('.cnt[data-iso="HR-01"]').getAttribute('aria-label'));
    ck(`Tokovi county label reads 2.311 from the hub and 1.977 to it (dir=${dir})`,
      NBSP(fLab) === 'Zagrebačka: iz Grad Zagreb 2.311, u Grad Zagreb 1.977, neto (Grad Zagreb) −334 · 2018.', fLab);
  }

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
    m390.segBad.length === 0 && m390.viewBtns === 7, m390.segBad.join(' | '));

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
  /* dist mode measures the file; URL mode has no directory to measure, so it
       reads the served entry chunk's own transfer size instead of reporting 0 */
  const entryKB = URLMODE
    ? Math.round((await page.evaluate(() => {
      const e = performance.getEntriesByType('resource').find(r => /\/assets\/index-.*\.js$/.test(r.name));
      return e ? (e.decodedBodySize || e.transferSize || 0) : 0;
    })) / 1024)
    : fs.existsSync(path.resolve(arg, 'assets'))
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
      offscreen: Math.round(a.b - innerHeight), hitId: hit ? (hit.id || hit.className) : null,
      inertBar: !!document.querySelector('#scrubBox').closest('[inert]') };
  });
  ck('390: the open glossary does not overlap the fixed scrubber',
    mobHelp.ov === 0 && mobHelp.offscreen <= 0, JSON.stringify(mobHelp));
  /* This used to assert the play button was still *clickable* under an open
     glossary. Below 900 px the glossary is a near-fullscreen overlay and is
     modal now, so the scrubber is deliberately inert while it is open — the
     property that has to hold is that the bar is not covered (above) and that
     closing the dialog hands it straight back. */
  await page.evaluate(() => document.querySelector('#helpX').click());
  await settle(300);
  const mobBack = await page.evaluate(() => {
    const p = document.querySelector('#play').getBoundingClientRect();
    const hit = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2);
    return { onPlay: !!(hit && hit.closest('#play')),
      inertBar: !!document.querySelector('#scrubBox').closest('[inert]'),
      hitId: hit ? (hit.id || hit.className) : null };
  });
  ck('390: the glossary hands the play button straight back when it closes',
    mobHelp.inertBar && !mobBack.inertBar && mobBack.onPlay,
    JSON.stringify({ open: mobHelp.inertBar, closed: mobBack.inertBar, hit: mobBack.hitId }));

  /* ── 390: the fixed bar must not sit on the focus ring (2.4.11) ──
     The check above is the only one that measured anything against #scrubBox,
     and it measures exactly one element — #helpCard — for which index.css
     reserves a dedicated lane. Nothing measured the elements that actually
     RECEIVE focus. Measured before the fix, tabbing the map and the 21-row
     county rail at 390x844: 25 of 79 focused stops were 100 % behind the bar,
     ten of them whole rail rows ("Zadarska +9.649" through "Vukovarsko-
     srijemska −28.292"), because an element under a position:fixed overlay is
     still inside the scrollport and scroll-into-view therefore does nothing.
     Both bar states, because they reserve different heights (136 / 78 px), and
     the walk's own floor is that focus moved at all. */
  const barWalk = async (steps) => {
    const stops = [];
    for (let i = 0; i < steps; i++) {
      await page.keyboard.press('Tab');
      stops.push(await page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return { body: true, who: 'BODY' };
        const bar = document.querySelector('#scrubBox');
        const b = bar.getBoundingClientRect(), r = a.getBoundingClientRect();
        const ov = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left))
          * Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
        const area = r.width * r.height;
        /* the bar's own play button and timeline are inside it by construction */
        return { hidden: !bar.contains(a) && area > 0 && ov / area >= 0.999,
          who: a.id || a.getAttribute('data-iso') || String(a.getAttribute('class') || a.tagName) };
      }));
    }
    return { moved: stops.filter((s, i) => i && s.who !== stops[i - 1].who).length,
      hidden: stops.filter(s => s.hidden).length,
      who: [...new Set(stops.filter(s => s.hidden).map(s => s.who))].slice(0, 4) };
  };
  await fresh('#v=saldo&c=1&y=2024');
  const barOpen = await barWalk(60);
  ck('390: Tab never lands on a row the fixed scrubber covers',
    barOpen.hidden === 0 && barOpen.moved >= 10, JSON.stringify(barOpen));
  await page.evaluate(() => document.querySelector('.scrub-tog').click());
  await settle(300);
  const barShut = await barWalk(60);
  barShut.pad = await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom);
  ck('390: and the collapsed bar reserves its own 78 px, not the open bar’s 136',
    barShut.hidden === 0 && barShut.moved >= 10 && barShut.pad === '78px',
    JSON.stringify(barShut));
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

  /* ── P2: the same contract below the 900 px breakpoint ──
     There the glossary is a near-fullscreen fixed overlay, and the rule above
     names only the two elements that shared coordinates in the ≥900 px layout.
     Measured at 390×844 before the fix: 33 of the cycle's 85 tab stops were
     100 % covered — #helpBtn among them, one Shift+Tab from the dialog. */
  const glossary = async () => page.evaluate(async () => {
    document.querySelector('#helpBtn').click();
    await new Promise(r => setTimeout(r, 300));
    const card = document.querySelector('#helpCard');
    const all = [...document.querySelectorAll(
      'a[href],button:not([disabled]),select,input,[tabindex]:not([tabindex="-1"])')];
    const outside = all.filter(e => !card.contains(e));
    const live = outside.filter(e => !e.closest('[inert]') && e.getClientRects().length);
    return { modal: card.getAttribute('aria-modal'), role: card.getAttribute('role'),
      named: card.getAttribute('aria-labelledby'), outside: outside.length,
      live: live.length, who: live.map(e => e.id || e.className).slice(0, 5) };
  });
  await page.setViewport({ width: 390, height: 844 });
  await fresh('#v=saldo&c=1&y=2024&st=2');
  const gNarrow = await glossary();
  ck('below 900 px the glossary is modal: nothing it covers is still a tab stop',
    gNarrow.modal === 'true' && gNarrow.outside > 30 && gNarrow.live === 0,
    JSON.stringify(gNarrow));
  /* …measured by pressing Tab, because the check above cannot see this defect:
     it filters with `closest('[inert]')`, an ATTRIBUTE selector, and `inert` is
     an IDL attribute of HTMLElement. Set on `svg#map` it does nothing to the
     map (measured: `svg.inert === undefined`, and an inert <svg>'s focusable
     children still take Tab) while matching that selector perfectly — so all 21
     county paths were discarded as "inert" and `live` read 0 with the whole map
     still in the tab order. Walking the cycle is the only version of this that
     cannot be fooled: 80 of 80 stops outside the dialog were covered county
     paths before the fix. */
  const tabWalk = async (steps) => {
    const stops = [];
    for (let i = 0; i < steps; i++) {
      await page.keyboard.press('Tab');
      stops.push(await page.evaluate(() => {
        const a = document.activeElement, card = document.querySelector('#helpCard');
        if (!a || a === document.body) return { body: true, who: 'BODY' };
        const r = a.getBoundingClientRect(), c = card.getBoundingClientRect();
        return {
          inDialog: card.contains(a),
          covered: !card.contains(a) && r.left >= c.left - 0.5 && r.right <= c.right + 0.5
            && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5,
          who: a.id || a.getAttribute('data-iso') || String(a.getAttribute('class') || a.tagName),
        };
      }));
    }
    /* `moved` is the floor: focus that never goes anywhere reports "nothing
       outside the dialog" just as loudly as a correct trap does */
    return { stops: stops.length, moved: stops.filter((s, i) => i && s.who !== stops[i - 1].who).length,
      outside: stops.filter(s => !s.body && !s.inDialog).length,
      covered: stops.filter(s => s.covered).length,
      who: [...new Set(stops.filter(s => s.covered).map(s => s.who))].slice(0, 4) };
  };
  const wNarrow = await tabWalk(60);
  ck('and Tab proves it: 60 presses under the open glossary never leave the dialog',
    wNarrow.outside === 0 && wNarrow.covered === 0 && wNarrow.moved >= 5, JSON.stringify(wNarrow));
  await page.setViewport({ width: 1440, height: 900 });
  await fresh('#v=saldo&c=1&y=2024&st=2');
  const gWide = await glossary();
  ck('and above it the glossary stays non-modal, covering nothing',
    gWide.modal === 'false' && gWide.live > 20 && gWide.role === 'dialog'
    && gWide.named === 'helpTitle',
    JSON.stringify(gWide));
  /* "covering nothing" was a name, not an assertion: the check above counts
     non-inert focusables outside the dialog and wants that number LARGE, which
     is the opposite measurement. Nothing in it compares a box to a box. And it
     runs at 1440 px, where the claim happens to be true — the card is 330 px of
     opaque panel over the map's left edge, so how much of the map it covers is
     a function of the width. Measured with 120 Tab presses and a bbox test at
     each stop: 0 entirely-obscured stops at 1440, SEVEN at 1000 (a half-screen
     window, or 1440 at 150 % zoom) — consecutive county buttons drawn behind
     the card with their focus ring, where Enter re-selects a county the reader
     cannot see (2.4.11). Non-modality is kept: the rest of the page must still
     be tabbable, which is what `outside` asserts on the same walk. */
  await page.setViewport({ width: 1000, height: 900 });
  await fresh('#v=saldo&c=1&y=2024&s=HR-18');
  const g1000 = await glossary();
  const w1000 = await tabWalk(60);
  ck('at 1000 px, where the card does cover the map, no tab stop lands under it',
    w1000.covered === 0 && w1000.outside > 10 && w1000.moved >= 5 && g1000.modal === 'false',
    JSON.stringify({ ...w1000, modal: g1000.modal }));
  const handBack = await page.evaluate(async () => {
    document.querySelector('#helpX').click();
    await new Promise(r => setTimeout(r, 250));
    return { cnt: document.querySelectorAll('#map .cnt[tabindex="0"]').length,
      help: !!document.querySelector('#helpCard') };
  });
  ck('and closing it hands the map’s 21 county stops straight back',
    handBack.cnt === 21 && !handBack.help, JSON.stringify(handBack));
  await page.setViewport({ width: 1440, height: 900 });

  /* ── P2: the dialog owns the keyboard while it holds focus ──
     Space is exercised elsewhere with focus on a <button> (l.629), on <body>
     (l.637) and on an inert rail row (l.1630) — never inside the dialog, which
     is the one place it is also the focused element's own page-down. #helpCard
     is a scroll container (2.498 px of content in a 392 px box) and App's only
     scroll guard was the DOCUMENT's scrollHeight, which at ≥900 px never grows.
     Measured before the fix: Space → the card did not move, playback started,
     the year went 2024.→2025. and the permalink was rewritten, all behind an
     opaque overlay; ArrowRight stepped the year again; "+" zoomed the map to
     1,6× under it. PageDown scrolled the card in the same state, which is what
     proves only the app's own bare keys were at fault. */
  await fresh('#v=saldo&c=1&y=2024');
  await page.evaluate(() => document.querySelector('#helpBtn').click());
  await settle(350);
  const dlgKeys = { focus: await page.evaluate(() => document.activeElement.id) };
  await page.keyboard.press(' ');
  await settle(350);
  Object.assign(dlgKeys, await page.evaluate(() => ({
    scrolled: Math.round(document.querySelector('#helpCard').scrollTop),
    playing: document.querySelector('#play').getAttribute('aria-pressed'),
  })));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('+');
  await settle(300);
  Object.assign(dlgKeys, await page.evaluate(() => ({
    yr: document.querySelector('#bigYear').textContent, hash: location.hash,
    zoom: document.querySelector('#map g').getAttribute('transform'),
  })));
  ck('with the glossary open Space pages the dialog and no bare key moves the atlas',
    dlgKeys.focus === 'helpCard' && dlgKeys.scrolled > 0 && dlgKeys.playing === 'false'
    && dlgKeys.yr === '2024.' && dlgKeys.hash === '#v=saldo&c=1&y=2024'
    && /scale\(1\)/.test(dlgKeys.zoom), JSON.stringify(dlgKeys));
  await page.evaluate(() => document.querySelector('#helpX').click());
  await settle(200);

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
  /* v2.0.7: the cell no longer unmounts the grid, so the fix is now "focus stays
     on the control that opened the card" rather than "focus is handed onward" */
  ck('activating a matrix cell does not drop focus to <body>',
    /v=mx/.test(drillFocus.view) && !drillFocus.body, JSON.stringify(drillFocus));

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
    const a0 = first.dataset.a, b0 = first.dataset.b;
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const now = document.querySelector('.mxc[tabindex="0"]');
    return { a0, b0, a1: now.dataset.a, b1: now.dataset.b,
      one: document.querySelectorAll('.mxc[tabindex="0"]').length,
      focused: document.activeElement === now };
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

  /* `data-b` is an ISO code — MXORD[c], i.e. 'HR-21' / 'HR-01' / … — so the old
     `b1 !== '1'` disjunct was constant-true and short-circuited the whole test,
     while its only discriminating half (`a1 !== a0`) is false even in a healthy
     app: plain End is [-1, n-1], which keeps the row by construction. Deleting
     the End entry from MatrixView's key map left this printing ok. Assert the
     destination the way the JLS twin at the next block already does — same row,
     a different column — and count the roving stops while we are here. */
  ck('End jumps the matrix roving cell instead of doing nothing',
    gridJump.focused && gridJump.one === 1
    && gridJump.a1 === gridJump.a0 && gridJump.b1 !== gridJump.b0, JSON.stringify(gridJump));

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
    /* `[].every()` is true, so this passed if the glyph stopped being rendered
       at all — the count is what makes it mean something */
    arrN: document.querySelectorAll('.chip-arr').length,
    arrHidden: [...document.querySelectorAll('.chip-arr')].every(a => a.getAttribute('aria-hidden') === 'true'),
  }));
  ck('the page has a real heading outline, not styled divs',
    struct.h1 === 1 && struct.h2 >= 2, JSON.stringify(struct));
  ck('a skip link bypasses the header controls', struct.skip, JSON.stringify(struct));
  /* Presence was the whole assertion, and the link was never activated anywhere
     in the suite — so nothing could observe that activating it destroyed the
     view. `href="#map"` is a same-document fragment navigation, every engine
     answers one with popstate, and this app reads popstate as a permalink:
     readHash('#map') returns {} by the codec's own "unknown or invalid fields
     are ignored" contract, so the handler's {...ref.current, ...BASE, ...patch}
     was literally BASE. Measured before the fix: #v=klas&c=1&y=2015&t=6000 →
     #v=saldo&c=1&y=2024, big year 2015. → 2024., focus on <body>. Driven with a
     real Tab and a real Enter, because that is the only way this control is
     ever used. */
  await fresh('#v=klas&c=1&y=2015&t=6000');
  await page.keyboard.press('Tab');
  const skipOn = await page.evaluate(() => document.activeElement.className);
  await page.keyboard.press('Enter');
  await settle(400);
  const skipTo = await page.evaluate(() => ({ hash: location.hash,
    focus: document.activeElement.id || document.activeElement.tagName,
    /* landing somewhere invisible would be the same defect wearing a hat: the
       map is focusable only for this, so its keyboard ring is part of the fix */
    ring: getComputedStyle(document.activeElement).outlineStyle,
    yr: document.querySelector('#bigYear').textContent }));
  ck('the bypass block reaches the map, draws a ring and leaves the reader’s state where it was',
    skipOn === 'skip' && skipTo.focus === 'map' && skipTo.ring !== 'none' && skipTo.yr === '2015.'
    && /v=klas/.test(skipTo.hash) && /y=2015/.test(skipTo.hash) && /t=6000/.test(skipTo.hash),
    JSON.stringify({ skipOn, ...skipTo }));
  ck('the rail landmark is named and the card chart is a labelled figure',
    struct.railNamed && struct.cardSvg === 'img', JSON.stringify(struct));
  ck('decorative chip arrows are hidden from assistive tech',
    struct.arrN >= 3 && struct.arrHidden, JSON.stringify({ n: struct.arrN, hidden: struct.arrHidden }));

  /* ── P3: the threshold slider says what the readout says ── */
  /* `seen` — the visible #thrVal string — used to be collected and then used in
     no clause of the assertion, which matched two hardcoded literals against the
     aria string alone. Drop the sign from the readout, or let fmtR regress to an
     ASCII hyphen, and the sighted and the announced value disagree while this
     prints ok: precisely the mismatch Header's own comment exists to prevent.
     The absolute unit had no coverage anywhere in the file either. Assert the
     containment the check's name promises — the announced string must carry the
     visible one verbatim, sign and separator included — and do it in both units. */
  for (const [h, unit, lab] of [['#v=klas&c=1&y=2024&tr=1&tp=1.5', '%', '%'],
    ['#v=klas&c=1&y=2024&t=3000', 'osoba', 'osobe']]) {
    await fresh(h);
    const thrVt = await page.evaluate(() => ({
      vt: document.querySelector('#thr').getAttribute('aria-valuetext'),
      seen: document.querySelector('#thrVal').textContent.trim(),
    }));
    const vt = NBSP(thrVt.vt || ''), seen = NBSP(thrVt.seen);
    ck(`the ${lab} threshold slider announces the value its readout shows`,
      !!thrVt.vt && seen.includes('−') && vt.includes(seen) && vt.includes(unit),
      JSON.stringify(thrVt));
  }

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

  /* ── P3: a malformed permalink must not be able to stop the app booting ──
     `#v=saldo&st=1.5` decoded to a preset index of 0.5, which passed the range
     test; `STORIES[0.5]` is undefined, reading `.patch` off it threw at module
     scope, React never mounted, and index.html's boot placeholder became the
     permanent UI — reload-persistent, from one shareable link. The codec
     promises unknown or invalid fields are ignored, so the app has to render,
     and it has to render the state the *valid* part of the link asks for. */
  for (const [h, view] of [['#v=saldo&st=1.5', 'Saldo'], ['#v=klas&st=3.14', 'Klasifikacija']]) {
    await fresh(h);
    const boot = await page.evaluate(() => ({
      booted: !!document.querySelector('#map'), placeholder: !!document.querySelector('.boot'),
      view: (document.querySelector('#segView button[aria-pressed="true"]') || {}).textContent,
      cap: !!document.querySelector('#storyCap'),
    }));
    ck(`a malformed preset index still boots the app (${h})`,
      boot.booted && !boot.placeholder && boot.view === view && !boot.cap, JSON.stringify(boot));
  }
  /* the same input reached through history rather than through a boot: the
     popstate handler decodes too, and a throw there stops it answering Back for
     the rest of the session */
  await fresh('#v=saldo&c=1&y=2024');
  const popBad = await page.evaluate(async () => {
    history.pushState(null, '', '#v=reg&st=2.5');
    dispatchEvent(new PopStateEvent('popstate'));
    await new Promise(r => setTimeout(r, 250));
    const view = document.querySelector('#segView button[aria-pressed="true"]').textContent;
    history.pushState(null, '', '#v=klas&c=1&y=2024');
    dispatchEvent(new PopStateEvent('popstate'));
    await new Promise(r => setTimeout(r, 250));
    return { view, after: document.querySelector('#segView button[aria-pressed="true"]').textContent };
  });
  ck('and Back into a malformed hash leaves the handler alive',
    popBad.view === 'Regije' && popBad.after === 'Klasifikacija', JSON.stringify(popBad));

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
  /* Deliberately NOT fresh(): "without a reload" is the whole property, and both
     halves of this pair used to reload, so the media query was only ever read by
     useState's initialiser and the mount-time sync(). Deleting
     `mq.addEventListener('change', sync)` — the exact listener this block's own
     comment says it guards — left a reader who flips the OS switch mid-session
     with the animations they asked to stop, and both checks still printed ok
     because each was measured on a brand-new document. emulateMediaFeatures
     fires a real `change` on the live matchMedia list, so the running document
     is what answers now. The computed duration goes with the class: a class
     toggled without the stylesheet following would otherwise still pass. */
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await settle(200);
  ck('and it comes back off without a reload',
    await page.evaluate(() => !document.body.classList.contains('reduced')
      && getComputedStyle(document.querySelector('.cnt')).transitionDuration !== '0s'));

  /* ── P3: the JLS chunk can fail, and the view says so and offers a retry ── */
  blockGeoChunk = true;
  await page.goto('about:blank');
  await page.goto(url + '#v=jmap&dir=net', { waitUntil: 'domcontentloaded' });
  /* every other wait in this file is condition-based, and the project fixed this
     exact class once already for #v=jmap ("waits on 556 features, not a
     stopwatch"): a fixed sleep against an async import flakes on a slow machine */
  await page.waitForFunction(() => !!document.querySelector('#jerror') || !!document.querySelector('#jloading'),
    { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => !!document.querySelector('#jerror'), { timeout: 15000 })
    .catch(() => {});
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
  /* The aborted request above is a deliberate console error. Drop exactly it —
     the comment always said so, but the pattern matched any net:: failure with
     no URL test and no count limit, so an unrelated same-origin failure anywhere
     in that window was swept up with it and both zero-error checks passed. */
  {
    const before = errors.length;
    for (let i = errors.length - 1; i >= 0; i--) {
      if (/geo_jls/.test(errors[i]) && /ERR_FAILED|net::/.test(errors[i])) errors.splice(i, 1);
    }
    ck('the deliberate abort is the only error swept, and it was swept',
      before - errors.length >= 1 && errors.length === 0,
      JSON.stringify({ dropped: before - errors.length, left: errors.slice(0, 2) }));
  }
  /* Privacy and determinism are the same property here: a page that reaches no
     third-party origin cannot leak a visitor's IP on first paint and cannot
     have a check quietly depend on someone else's uptime. */
  ck('the page reaches no third-party origin — fonts included',
    thirdParty.length === 0, thirdParty.slice(0, 4).join(' , ') || 'none');
  /* Self-hosting only helps if the faces actually resolve; a wrong emitted URL
     would fall back to Arial Narrow and still render "fine". */
  /* `document.fonts.check()` answers "would this exact shorthand resolve to a
     loaded face", which is a different question: IBM Plex Sans reported false at
     600 simply because no visible run of text asks for that weight in latin, so
     that face was never fetched. What matters is that each family resolved from
     this origin at all, so count loaded faces per family instead. */
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    const want = ['IBM Plex Sans', 'IBM Plex Mono', 'Oswald'];
    return want.map(f => ({
      f, ok: [...document.fonts].some(x => x.family === f && x.status === 'loaded'),
    }));
  });
  ck('all three self-hosted families load from same-origin',
    faces.every(f => f.ok), JSON.stringify(faces));
  /* The subset that carries č ć š ž đ. Dropping latin-ext would render Croatian
     in the fallback face and look almost right. */
  /* Per family, not as one total. `extLoaded > 0` let five of the six ext faces
     vanish and still pass: drop Oswald's latin-ext subset and it is --disp, so
     .hd-title, .rail-year, .card-name and .tip-name — every county name shown as
     a heading — render 'Osječko-baranjska' and 'Šibensko-kninska' with their
     accented glyphs from Arial Narrow and the rest in Oswald, visibly mixed. The
     sibling family check passes too, because the surviving latin-only face
     satisfies it. All three self-hosted families set Croatian text, so all three
     owe an ext face. */
  const extLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    const by = {};
    for (const f of document.fonts) {
      if (f.status !== 'loaded' || !/U\+100|U\+0100/i.test(f.unicodeRange || '')) continue;
      by[f.family] = (by[f.family] || 0) + 1;
    }
    return by;
  });
  ck('every self-hosted family has a loaded latin-ext face (č ć š ž đ)',
    ['IBM Plex Mono', 'IBM Plex Sans', 'Oswald'].every(f => extLoaded[f] > 0),
    JSON.stringify(extLoaded));

  /* ══════════ v2.0.6 — the companion study is unpublished ══════════
     The paper this atlas is a companion to is not published yet, so three
     things have to hold at once and they are cheap to break one at a time:
     nothing identifies it, every surface says the reference is *pending*
     rather than implying one exists, and the atlas states it is unaffiliated.
     Same shape as the izmjereno/procjena rules — a bare "iz rada" with nothing
     a reader can look up is an unlabelled claim. src/lib/credits.ts is the one
     switch; these checks are what stops half a publication from shipping. */
  await fresh('');
  /* Until 27 July 2026 this asserted the opposite: the authors' names must not
     appear anywhere in the *bundle*, because the manuscript was unpublished. It
     is published now, so the same scan proves the attribution actually shipped —
     names, journal and the link, in the built files rather than only in a
     component that might not render. The scanned count is asserted either way,
     so a failed fetch cannot pass as a result. */
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
      if (/maras/i.test(t)) hits.push('maras');
      if (/vinovr/i.test(t)) hits.push('vinovrski');
      if (t.includes('hrcak.srce.hr/349820')) hits.push('url');
      if (t.includes('10.51650/ezrvs')) hits.push('doi');
    }
    return { scanned, hits: [...new Set(hits)] };
  });
  ck('the published citation ships in the built app — authors, link and DOI',
    bundleScan.scanned >= 2 && ['maras', 'vinovrski', 'url', 'doi'].every(h => bundleScan.hits.includes(h)),
    JSON.stringify(bundleScan));

  const attr = await page.evaluate(() => ({
    sub: document.querySelector('.hd-sub').textContent.trim(),
    ft: document.querySelector('.ft').textContent.trim(),
    /* `body > noscript`, not `noscript`: there are two now. The one in <head>
       carries the stylesheet that hides the first-paint placeholder when there
       is no JS to clear it, and it is markup, not copy. This one is the
       attribution fallback, and it is the only one that says anything. */
    ns: document.querySelector('body > noscript').textContent.trim(),
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
  /* Every upstream source on this page is credited by name and linked; the
     atlas itself was the one credit that stayed anonymous — the footer and the
     glossary both said "autor atlasa" and named nobody, and the markup carried
     no author at all. The <noscript> is checked with them for the same reason
     the citation is: it cannot import lib/licences.ts, so a half-done edit has
     to fail here rather than ship a page that names the author with JavaScript
     and not without it. The year and holder are LICENSE §1's, which is why both
     are matched rather than just the name. */
  const mine = await page.evaluate(() => ({
    ftAuthor: /Ante Blašković/.test(document.querySelector('.ft').textContent),
    ftRepo: !!document.querySelector('.ft a[href="https://github.com/ablaskovic/migracijski-atlas"]'),
    ftTerms: /©\s*2026/.test(document.querySelector('.ft').textContent)
      && /\bMIT\b/.test(document.querySelector('.ft').textContent),
    ns: document.querySelector('body > noscript').textContent,
    meta: document.querySelector('meta[name=author]')?.content || '',
  }));
  /* LICENSE §1 is the fourth copy and the one that legally matters, so it is
     matched too rather than trusted to have been edited alongside. Read from
     disk, not from the page: it does not ship to the browser. */
  const licHolder = (() => {
    try { return /Copyright \(c\) 2026 Ante Blašković/.test(fs.readFileSync(path.resolve(__dirname, '../LICENSE'), 'utf8')); }
    catch { return false; }
  })();
  ck('the atlas credits its own author, terms and source repository',
    mine.ftAuthor && mine.ftRepo && mine.ftTerms && mine.meta === 'Ante Blašković'
    && /Ante Blašković/.test(mine.ns) && /github\.com\/ablaskovic\/migracijski-atlas/.test(mine.ns)
    && /©\s*2026/.test(mine.ns) && /\bMIT\b/.test(mine.ns) && licHolder,
    JSON.stringify({ ...mine, ns: undefined, licHolder }));
  /* The one deliberately state-dependent check in the block: the paper was
     published on 27 July 2026, and that is a fact about this vintage of the
     atlas the same way the ground-truth table is a fact about this vintage of
     the DZS series. It moved with credits.ts and index.html's <noscript>, in one
     commit — which is exactly what this line is here to force. */
  ck('as of this build the study is published, and the subtitle cites it by year',
    !pending.hd && !pending.ft && /Maras/.test(attr.sub) && /\(2026\.\)/.test(attr.sub),
    attr.sub);
  /* The disclosure is always visible and it costs the map real height — pin
     both, so neither the footer nor the map can drift on the next copy edit.
     Re-measured at 75 px / 572 px once the fonts became self-hosted: the old
     72 px bound was taken against the Arial Narrow fallback, because the suite
     stubbed the font host. IBM Plex Sans sets wider, so the footer takes one
     more wrapped line than the fallback suggested — the number moved because
     the measurement got honest, not because the copy grew. */
  ck('the always-visible disclosure stays inside its lane at 1440',
    attr.ftH <= 78 && attr.boxH >= 560, JSON.stringify({ ftH: attr.ftH, boxH: attr.boxH }));

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
  const links = await page.evaluate(() => {
    const a = s => [...document.querySelectorAll(s)].map(e => ({
      href: e.getAttribute('href'), rel: e.getAttribute('rel') || '',
      text: e.textContent.trim(), name: e.getAttribute('aria-label') || '' }));
    return { hd: a('.hd-sub a.paper-link'), ft: a('.ft a.paper-link'), gl: a('.help-cite a.paper-link') };
  });
  /* Prominence is the point: the first line under the title, the always-visible
     footer and the glossary each name the paper and reach it in one click. The
     accessible name carries the full citation and *contains* the visible text,
     so 2.5.3 Label in Name holds. */
  ck('header, footer and glossary each link to the published record',
    /* the footer also links the four upstream sources now, so this asks for
       exactly one link *to the study record* per surface, not one link total */
    ['hd', 'ft', 'gl'].every(k => {
      const paper = links[k].filter(a => a.href === 'https://hrcak.srce.hr/349820');
      return paper.length === 1 && /noopener/.test(paper[0].rel)
        && paper[0].name.includes(paper[0].text);
    }),
    JSON.stringify(links).slice(0, 300));
  ck('and states independence, non-endorsement and what is not taken from the study',
    attrGloss.section && /nije povezan/.test(attrGloss.body) && /nisu pregledali/.test(attrGloss.body)
    && /nijedna brojka nije preuzeta iz rada/.test(attrGloss.body),
    JSON.stringify({ section: attrGloss.section }));

  /* The export is the artifact that leaves the app, and Klasifikacija reproduces
     the study's threshold while Regije reproduces its grouping. Both formats,
     both views — and the four views that take nothing from it stay quiet. */
  const expNote = async h => {
    await fresh(h);
    return page.evaluate(() => {
      const s = window.__exportSVG(false);
      return { svg: s,
        has: /nije povezan/.test(s) && (/neobjavljenom znanstvenom radu/.test(s)
          /* published: the artifact leaves the app, so it carries a citable DOI
             rather than a name a reader would have to search for */
          || (/Klasifikacija i regije prema:/.test(s) && /10\.51650\/ezrvs/.test(s))) };
    });
  };
  const eKlas = await expNote('#v=klas');
  const eReg = await expNote('#v=reg&c=1&y=2024');
  const eSaldo = await expNote('');
  ck('exported klasifikacija and regije carry the study reference and the disclaimer',
    eKlas.has && eReg.has, JSON.stringify({ klas: eKlas.has, reg: eReg.has }));
  ck('and the views that take nothing from the study claim nothing about it',
    !/nije povezan|neobjavljen/.test(eSaldo.svg), 'saldo');
  /* its own line, not glued onto the source credit: that line already runs
     ~950 px at 8,5 px mono, so an appended disclaimer is the half that gets
     clipped by the canvas edge */
  const noteRows = [...eKlas.svg.matchAll(/<text x="20" y="(\d+(?:\.\d+)?)"[^>]*font-size="8\.5"/g)]
    .map(m => +m[1]).sort((a, b) => a - b);
  const swatch = +(eKlas.svg.match(/<rect x="20" y="(\d+(?:\.\d+)?)" width="11"/) || [0, 0])[1];
  /* The rows wrap now, so their count depends on the width; what does not
     change is the rhythm and the clearance. Bottom-up: source credit, figure
     licence, study reference, revision caveat — at least four rows for a study
     view, 14 px apart, the topmost clearing the legend's last line by 12 px. */
  ck('the exported disclaimer is a line of its own, clear of the legend and the credit',
    noteRows.length >= 4 && noteRows.every((y, i) => i === 0 || y - noteRows[i - 1] === 14)
    && noteRows[0] - swatch >= 12,
    JSON.stringify({ noteRows, swatch }));

  /* ══════════ v2.0.7 — a corridor opens where it was picked ══════════
     Activating a matrix cell used to set `{view:'flow', sel:a, pair:b}`, which
     answered a corridor question with a county one: measured, clicking
     Istarska→Zadarska (31 people) unmounted the grid, drew 20 arcs from Istarska
     and listed all 20 partners summing 996 — the county's entire outflow — with
     the corridor demoted to a card in the corner. The matrix is *the* view for
     comparing corridors and one click threw it away. Now the corridor opens in
     place, and the card docks in the rail rather than floating over a surface
     that is data to its edges. */
  const mxOpen = async (hash, a, b, how) => {
    await fresh(hash);
    const before = await page.evaluate(() =>
      +document.querySelector('.mxc').getBoundingClientRect().width.toFixed(1));
    const selCell = `.mxc[data-a="${a}"][data-b="${b}"]`;
    if (how === 'key') {
      await page.evaluate(s => {
        const c = document.querySelector(s);
        c.focus();
        c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }, selCell);
    } else if (how === 'rail') {
      await page.click('#railList .rrow');
    } else {
      await page.click(selCell);
    }
    await settle(400);
    return page.evaluate(s => {
      const c = document.querySelector(s);
      const cells = [...document.querySelectorAll('.mxc')].map(x => x.getBoundingClientRect());
      const g = { l: Math.min(...cells.map(r => r.left)), r: Math.max(...cells.map(r => r.right)),
        t: Math.min(...cells.map(r => r.top)), b: Math.max(...cells.map(r => r.bottom)) };
      const card = document.querySelector('#pair');
      const cb = card && card.getBoundingClientRect();
      const marks = [...document.querySelectorAll('.mxsel rect')];
      const ring = marks[3] && marks[3].getBoundingClientRect();
      const cr = c && c.getBoundingClientRect();
      return {
        view: document.querySelector('#segView button[aria-pressed="true"]').dataset.v,
        hash: location.hash, cells: document.querySelectorAll('.mxc').length,
        cell: +document.querySelector('.mxc').getBoundingClientRect().width.toFixed(1),
        cardIn: card ? (card.closest('aside.rail') ? 'rail' : 'map') : null,
        name: document.querySelector('#pairName') ? document.querySelector('#pairName').textContent : null,
        row: document.querySelector('#pairRow') ? document.querySelector('#pairRow').textContent : null,
        sub: document.querySelector('#pair .card-sub') ? document.querySelector('#pair .card-sub').textContent : '',
        cellAria: c ? c.getAttribute('aria-label') : null,
        expanded: c ? c.getAttribute('aria-expanded') : null,
        expandedElsewhere: [...document.querySelectorAll('.mxc[aria-expanded="true"]')].length,
        roving: document.querySelector('.mxc[tabindex="0"]').dataset.a + '/' + document.querySelector('.mxc[tabindex="0"]').dataset.b,
        marks: marks.length,
        ringOnCell: !!(ring && cr && Math.abs(ring.x - cr.x) < 3 && Math.abs(ring.y - cr.y) < 3),
        naked: marks.filter(r => !r.hasAttribute('fill') || !r.hasAttribute('stroke')).length,
        selrow: document.querySelectorAll('.rrow.selrow').length,
        rowExpanded: document.querySelector('.rrow.selrow') ? document.querySelector('.rrow.selrow').getAttribute('aria-expanded') : null,
        hint: document.querySelector('.rail-hint') ? document.querySelector('.rail-hint').textContent : '',
        detailCard: document.querySelector('#card').textContent.length,
        focusOnCell: document.activeElement === c,
        gridCardOverlap: cb ? Math.round(Math.max(0, Math.min(g.r, cb.right) - Math.max(g.l, cb.left))
          * Math.max(0, Math.min(g.b, cb.bottom) - Math.max(g.t, cb.top))) : 0,
        before: null,
      };
    }, selCell).then(r => ({ ...r, before }));
  };

  const gz = await mxOpen('#v=mx&y=2018&c=0&dir=out', 'HR-21', 'HR-01', 'click');
  ck('a matrix cell opens the corridor in place — the grid survives the click',
    gz.view === 'mx' && gz.cells === 420 && !!gz.name && /s=HR-21/.test(gz.hash) && /pp=HR-01/.test(gz.hash),
    JSON.stringify({ v: gz.view, cells: gz.cells, hash: gz.hash }));
  /* The old jump's real cost: the card was right and everything around it was the
     county. Pin that the card is the corridor by matching it against the cell's
     own aria-label, which is the only other place that number appears. */
  ck('the card carries the cell\'s own corridor numbers, not the county\'s',
    /2\.311/.test(gz.row) && /1\.977/.test(gz.row) && /−334/.test(NBSP(gz.row))
    && gz.cellAria.includes('2.311'),
    JSON.stringify({ row: gz.row, aria: gz.cellAria }));
  ck('and its caption names both endpoints in the direction each series runs',
    /samo ovaj koridor/.test(gz.sub) && /Grad Zagreb → Zagrebačka/.test(gz.sub)
    && /Zagrebačka → Grad Zagreb/.test(gz.sub) && !/odlasci \(puna crta\)/.test(gz.sub),
    gz.sub);
  /* The card docks in the rail because a floating card over a heatmap covers
     live corridors — and steering the grid around it costs cells, which is the
     whole reason the placement search exists. Both halves asserted: where it is,
     and that opening it did not shrink a single cell. */
  ck('the corridor card docks in the rail and costs the grid nothing',
    gz.cardIn === 'rail' && gz.gridCardOverlap === 0 && gz.cell === gz.before && gz.cell >= 12,
    JSON.stringify({ where: gz.cardIn, overlap: gz.gridCardOverlap, cell: gz.cell, before: gz.before }));
  ck('the grid marks the selected corridor: two bands, a two-tone ring on the cell',
    gz.marks === 4 && gz.ringOnCell, JSON.stringify({ marks: gz.marks, ring: gz.ringOnCell }));
  /* .mxband had to be baked for the export because it took fill/stroke from the
     stylesheet and shipped as a solid black bar. These carry attributes instead. */
  ck('and paints them with attributes, so the export needs no new baking',
    gz.naked === 0, String(gz.naked));
  ck('the cell owns the disclosure: aria-expanded, exactly one, roving stop on it',
    gz.expanded === 'true' && gz.expandedElsewhere === 1 && gz.roving === 'HR-21/HR-01',
    JSON.stringify({ exp: gz.expanded, n: gz.expandedElsewhere, roving: gz.roving }));
  ck('focus stays on the cell that opened the card',
    gz.focusOnCell, String(gz.focusOnCell));
  /* `sel` is now set in Matrica, and DetailCard keyed off `sel` alone: it painted
     a 1998–2025 county card for the corridor's *row* — a county the user never
     picked — which is the v2.0.5 "no county card in Matrica" rule arriving by a
     new route. */
  ck('no county detail card in Matrica, even though sel is set',
    gz.detailCard === 0, String(gz.detailCard));
  ck('the rail marks the row the card describes and says what a click now does',
    gz.selrow === 1 && gz.rowExpanded === 'true' && !/otvara Tokove/.test(gz.hint),
    JSON.stringify({ selrow: gz.selrow, exp: gz.rowExpanded, hint: gz.hint.slice(0, 60) }));

  /* the same click, from the rail row and from the keyboard */
  const viaRail = await mxOpen('#v=mx&y=2018&c=0&dir=out', 'HR-21', 'HR-01', 'rail');
  ck('the matrix rail row opens the corridor in place too, and keeps its own list',
    viaRail.view === 'mx' && viaRail.cells === 420 && viaRail.selrow === 1 && !!viaRail.name,
    JSON.stringify({ v: viaRail.view, name: viaRail.name, selrow: viaRail.selrow }));
  const viaKey = await mxOpen('#v=mx&y=2018&c=0&dir=out', 'HR-21', 'HR-01', 'key');
  ck('Enter on a cell does the same and leaves focus where it was',
    viaKey.view === 'mx' && viaKey.cells === 420 && viaKey.focusOnCell && !!viaKey.name,
    JSON.stringify({ v: viaKey.view, focus: viaKey.focusOnCell }));

  /* it is a toggle: the control that opens it closes it */
  await page.click('.mxc[data-a="HR-21"][data-b="HR-01"]');
  await settle(350);
  const toggled = await page.evaluate(() => ({ card: !!document.querySelector('#pair'),
    marks: document.querySelectorAll('.mxsel rect').length, hash: location.hash,
    exp: document.querySelector('.mxc[data-a="HR-21"][data-b="HR-01"]').getAttribute('aria-expanded') }));
  ck('a second activation closes the corridor and clears its marks',
    !toggled.card && toggled.marks === 0 && !/pp=/.test(toggled.hash) && toggled.exp === 'false',
    JSON.stringify(toggled));

  /* Escape and the card's × both return focus to the cell, and both clear *both*
     halves — a lone `sel` in Matrica marks a row with no card behind it. */
  await fresh('#v=mx&y=2018&c=0&dir=out&s=HR-21&pp=HR-01');
  const esc = await page.evaluate(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    const el = document.activeElement;
    return { card: !!document.querySelector('#pair'), hash: location.hash,
      cell: !!(el.classList && el.classList.contains('mxc')),
      a: el.getAttribute ? el.getAttribute('data-a') : null, b: el.getAttribute ? el.getAttribute('data-b') : null };
  });
  ck('Escape closes the corridor, drops both halves and lands back on the cell',
    !esc.card && esc.cell && esc.a === 'HR-21' && esc.b === 'HR-01'
    && !/pp=/.test(esc.hash) && !/s=HR/.test(esc.hash), JSON.stringify(esc));
  await fresh('#v=mx&y=2018&c=0&dir=out&s=HR-21&pp=HR-01');
  await click('#pairX');
  const xBack = await page.evaluate(() => {
    const el = document.activeElement;
    return { card: !!document.querySelector('#pair'), hash: location.hash,
      cell: !!(el.classList && el.classList.contains('mxc')),
      a: el.getAttribute ? el.getAttribute('data-a') : null };
  });
  ck('the card\'s × does the same from the rail',
    !xBack.card && xBack.cell && xBack.a === 'HR-21' && !/pp=/.test(xBack.hash), JSON.stringify(xBack));

  /* A corridor means the same thing in Tokovi and in Matrica, so those two carry
     it between them; no other view can render it, so both halves die there. */
  await fresh('#v=mx&y=2018&c=0&dir=out&s=HR-21&pp=HR-01');
  await click('#segView button[data-v="flow"]');
  const carried = await page.evaluate(() => ({ hash: location.hash,
    name: document.querySelector('#pairName') ? document.querySelector('#pairName').textContent : null,
    where: document.querySelector('#pair') && document.querySelector('#pair').closest('aside.rail') ? 'rail' : 'map' }));
  await fresh('#v=mx&y=2018&c=0&dir=out&s=HR-21&pp=HR-01');
  await click('#segView button[data-v="saldo"]');
  const dropped = await page.evaluate(() => ({ hash: location.hash, card: !!document.querySelector('#pair'),
    detail: document.querySelector('#card').textContent.length }));
  ck('Matrica → Tokovi keeps the corridor (and the card floats again); → Saldo drops it',
    /s=HR-21/.test(carried.hash) && /pp=HR-01/.test(carried.hash) && carried.where === 'map'
    && !dropped.card && !/pp=/.test(dropped.hash) && !/s=HR/.test(dropped.hash) && dropped.detail === 0,
    JSON.stringify({ carried, dropped }));

  /* half a corridor is not a corridor: each of these used to be a mark or an
     Escape-eating flag with nothing on screen behind it */
  const halves = {};
  for (const h of ['#v=mx&s=HR-18', '#v=mx&pp=HR-13', '#v=flow&s=HR-01&pp=HR-01']) {
    await fresh(h);
    halves[h] = await page.evaluate(() => ({ hash: location.hash, card: !!document.querySelector('#pair'),
      marks: document.querySelectorAll('.mxsel rect').length }));
  }
  ck('a permalink carrying half a corridor boots without one',
    Object.values(halves).every(v => !v.card && v.marks === 0)
    && !/s=HR/.test(halves['#v=mx&s=HR-18'].hash) && !/pp=/.test(halves['#v=mx&pp=HR-13'].hash)
    && !/pp=/.test(halves['#v=flow&s=HR-01&pp=HR-01'].hash), JSON.stringify(halves));

  /* ══════════ v2.0.7 — strokes do not scale with the zoom ══════════
     Every stroke in the map is inside the zoom transform, so its width was
     multiplied by k. Measured on the JLS map at k=6,55: county outlines 6,55 px,
     a highlighted municipality 8,5 px, and the focus ring 29,5 px of white under
     13,1 px of dashed ink — the dash is why it read as "thick in places". The
     fix is `vector-effect="non-scaling-stroke"`, as an attribute so the export
     (which clones the live SVG *with* its transform) renders what the screen
     does. Arc widths are excluded: they encode magnitude. */
  await fresh('#v=jmap&dir=net');
  await page.evaluate(() => { for (let i = 0; i < 4; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true })); });
  await settle(700);
  /* The measurement is differential and on one document: rasterise the export as
     it ships, then rasterise the same string with the attribute stripped. Same
     scene, same zoom, one variable. `getBoundingClientRect` cannot see this —
     Chrome excludes the stroke from an SVG element's rect (measured: 0 px of
     stroke contribution either way), which is why this goes through pixels. */
  const strokes = await page.evaluate(async () => {
    const doc = window.__exportSVG(false);
    const scan = async s => {
      const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml;charset=utf-8' }));
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const runs = [];
      let opaque = 0;
      /* the map band only: the title band above and the legend/credit band below
         are full of ink text that has nothing to do with stroke width */
      for (let x = 30; x < cv.width - 30; x += 6) {
        let run = 0;
        for (let y = 94; y < cv.height - 120; y++) {
          const i = (y * cv.width + x) * 4;
          if (d[i + 3] > 200) opaque++;
          const dark = d[i + 3] > 200 && d[i] < 110 && d[i + 1] < 110 && d[i + 2] < 110;
          if (dark) run++;
          else { if (run > 0) runs.push(run); run = 0; }
        }
        if (run > 0) runs.push(run);
      }
      runs.sort((a, b) => a - b);
      return { n: runs.length, opaque, median: runs[Math.floor(runs.length / 2)] || 0 };
    };
    const on = await scan(doc);
    const off = await scan(doc.replace(/ vector-effect="non-scaling-stroke"/g, ''));
    return { attrs: (doc.match(/non-scaling-stroke/g) || []).length, on, off };
  });
  ck('zooming the map does not fatten its strokes, and the export agrees',
    strokes.on.opaque > 10000 && strokes.on.median <= 3 && strokes.off.median >= 6
    && strokes.attrs > 500,
    JSON.stringify({ attrs: strokes.attrs, on: strokes.on.median, off: strokes.off.median }));
  /* `.focusring` is rendered only while a feature holds *keyboard* focus, and at
     this point in the run nothing is focused at all — the very next block asserts
     exactly that. So `q('.focusring path').length === 0 || all(...)` took its
     left operand on every run and never inspected an element: strip
     vector-effect="non-scaling-stroke" from MapView's .fr-halo, which this
     section's own comment measures at 29,5 px of white under 13,1 px of dashed
     ink at k=6,55 — the most visible case of the bug the whole block exists for
     — and the check still printed ok. Bring the ring up first and drop the
     escape hatch, so an absent ring fails the way an absent .jl already does.
     After the differential scan above, so the ring's ink cannot move its medians. */
  await page.evaluate(() => document.querySelector('.jl[tabindex="0"]').focus());
  await page.keyboard.press('ArrowRight');
  await settle(300);
  const declared = await page.evaluate(() => {
    const q = s => [...document.querySelectorAll(s)];
    const all = sel => q(sel).length > 0 && q(sel).every(e => e.getAttribute('vector-effect') === 'non-scaling-stroke');
    return { jl: all('.jl'), jbord: all('.jbord'), nJl: q('.jl').length,
      nRing: q('.focusring path').length, ring: all('.focusring path') };
  });
  ck('every stroked feature on the JLS map declares it, not a stylesheet rule',
    declared.jl && declared.jbord && declared.ring && declared.nJl === 556
    && declared.nRing === 2,
    JSON.stringify(declared));

  /* The two-tone ring is a *keyboard* affordance and was drawn from the `focus`
     event, which a mouse click fires too — so clicking a municipality painted the
     dashed ring meant for Tab (and, before the fix above, at 4× width). */
  /* A real mouse, through CDP: `:focus-visible` keys off *trusted* input, so an
     in-page `dispatchEvent(new PointerEvent(...)) + el.focus()` is indistinguishable
     from a script focus and reports focus-visible — measured, that version of this
     check passed the bug. */
  const target = await page.evaluate(() => {
    let best = null;
    for (const p of document.querySelectorAll('.jl')) {
      const r = p.getBoundingClientRect();
      if (r.width > 14 && r.height > 14) {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (document.elementFromPoint(cx, cy) === p && (!best || r.width * r.height > best.a)) {
          best = { a: r.width * r.height, x: Math.round(cx), y: Math.round(cy) };
        }
      }
    }
    return best;
  });
  if (target) await page.mouse.click(target.x, target.y);
  await settle(300);
  const ptrRing = await page.evaluate(t => {
    const el = document.activeElement;
    return { skipped: !t, focused: !!(el.classList && el.classList.contains('jl')),
      fv: el.matches ? el.matches(':focus-visible') : null,
      ring: !!document.querySelector('.focusring') };
  }, target);
  ck('a pointer click focuses a municipality without painting the keyboard ring',
    !ptrRing.skipped && ptrRing.focused && !ptrRing.fv && !ptrRing.ring, JSON.stringify(ptrRing));
  await page.evaluate(() => document.querySelector('.jl[tabindex="0"]').focus());
  await page.keyboard.press('ArrowRight');
  await settle(350);
  const kbRing = await page.evaluate(() => ({ ring: !!document.querySelector('.focusring .fr-ink'),
    fv: document.activeElement.matches(':focus-visible') }));
  ck('and an arrow key brings it straight back',
    kbRing.ring && kbRing.fv, JSON.stringify(kbRing));

  /* The UA ring is the other half of that fix, and the first cut of it got this
     wrong: `outline:none` was moved under `:focus-visible` together with the
     stroke, so a plain mouse click — deliberately *not* focus-visible — got
     Chrome's default ring back. On an SVG element an outline is drawn round the
     bbox, i.e. a rounded rectangle, and inside the zoom transform it scales with
     k: ~20 px of black at k=4,1, over the shape it is supposed to indicate.
     `outline:none` is unconditional; the indicator alone is conditional.
     A sweep, not three selectors: the first cut of this check covered `.cnt`,
     `.jl` and `.mxc`, and `#spark` — the timeline, an `<svg>` and so not matched
     by `svg :focus` — still wrapped its whole 1.100 px box in Chrome's
     `auto 5px rgb(16,16,16)` on every click of it, in all four views. `.mxd` had
     no rule at all either. Clicking every focusable graphic and control is the
     only version of this check that generalises. */
  const uaRing = { hits: [], n: 0 };
  const CLICKABLE = ['#spark', '.rrow', '.cnt', '.jl', '.mxc', '.mxd', '#play', '#labBtn',
    '#helpBtn', '#zoomRst', '#pngBtn', '#segView button', '#thr', '.chip-hd', '#cardX', '#pairX'];
  for (const hash of ['', '#v=mx&y=2018&c=0&dir=out', '#v=jmap&dir=net',
    '#v=flow&s=HR-21&pp=HR-01&y=2018&c=0&dir=net']) {
    await fresh(hash);
    const targets = await page.evaluate(sels => {
      const out = [];
      for (const s of sels) {
        for (const el of document.querySelectorAll(s)) {
          const r = el.getBoundingClientRect();
          if (r.width < 8 || r.height < 8) continue;
          const x = Math.round(r.left + Math.min(r.width / 2, 40)), y = Math.round(r.top + r.height / 2);
          const hit = document.elementFromPoint(x, y);
          if (hit && (hit === el || el.contains(hit))) { out.push({ s, x, y }); break; }
        }
      }
      return out;
    }, CLICKABLE);
    for (const t of targets) {
      await page.mouse.click(t.x, t.y);
      await settle(150);
      const st = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const c = getComputedStyle(el);
        return { id: el.id, tag: el.tagName, cls: (el.getAttribute && el.getAttribute('class')) || '',
          style: c.outlineStyle, width: c.outlineWidth, fv: el.matches ? el.matches(':focus-visible') : null };
      });
      if (!st) continue;
      uaRing.n++;
      /* the app's own teal ring on a real form control is intended: Chrome reports
         focus-visible for <select>/<input> however they were focused */
      const formControl = /^(SELECT|INPUT)$/.test(st.tag || '') || st.fv === true;
      if (st.style !== 'none' && parseFloat(st.width) > 0 && !formControl) {
        uaRing.hits.push(`${hash || 'saldo'}:${t.s}→${st.id || st.cls}=${st.style} ${st.width}`);
      }
    }
  }
  ck('no pointer click anywhere leaves a UA focus ring (a bbox rounded rect)',
    uaRing.n >= 28 && uaRing.hits.length === 0,   /* measured: 31 across the four views */
    JSON.stringify({ compared: uaRing.n, hits: uaRing.hits.slice(0, 4) }));

  /* ══════════ v2.0.9 — answering to a source a reader can now open ══════════
     While the study was unpublished, "differs slightly from the paper" was a
     claim nobody could audit. Published, every approximation becomes checkable,
     and three surfaces were carrying one: the klasifikacija legend showed a
     count the study never published with no note, the Regije legend attributed a
     21-county partition to a paper that prints none (and called the study silent
     on Lika, which it is not), and the export cited the study by DOI while
     dropping the one sentence that explains why its numbers differ. */

  /* The count divergence is real and is the whole reason the note exists: the
     study publishes 7/7/7 for 2011–2024, the atlas computes 7/5/9 on a newer
     DZS pull. Asserted here as a ground truth so the note cannot quietly become
     decorative — if a revision closes the gap, this fails and the copy changes
     with it. */
  await fresh('#v=klas&y=2024');
  const klasCmp = await page.evaluate(() => ({
    counts: [...document.querySelectorAll('#legend .legend-cat')].map(e => e.textContent.trim()),
    note: (document.querySelector('#legend .legend-note') || {}).textContent || '',
    h: document.querySelector('#legend').getBoundingClientRect().height,
  }));
  ck('the klasifikacija legend names the counties that differ from the published split',
    /7 \/ 7 \/ 7/.test(klasCmp.note) && /2011\.–2024\./.test(klasCmp.note)
    && /Karlova/.test(klasCmp.note) && /Koprivni/.test(klasCmp.note),
    klasCmp.note);
  ck('and the counts it qualifies are still the 7 / 5 / 9 that made it necessary',
    /pobjednice · 7/.test(klasCmp.counts[0]) && /neutralne · 5/.test(klasCmp.counts[1])
    && /gubitnice · 9/.test(klasCmp.counts[2]), JSON.stringify(klasCmp.counts));
  /* One note, never two — the klas legend is the tallest in the app and both
     .helpcard and .jcard reserve 164 px for its lane. */
  const klasNotes = await page.evaluate(() => document.querySelectorAll('#legend .legend-note').length);
  ck('exactly one klasifikacija legend note, and the legend still fits its 164 px lane',
    klasNotes === 1 && klasCmp.h <= 164, JSON.stringify({ notes: klasNotes, h: klasCmp.h }));
  /* Off the study's threshold or endpoint the comparison is meaningless, so the
     note must stop asserting one and say what the study actually computed. */
  await fresh('#v=klas&y=2025');
  const klas25 = await page.evaluate(() => ({
    note: document.querySelector('#legend .legend-note').textContent,
    counts: [...document.querySelectorAll('#legend .legend-cat')].map(e => e.textContent.trim()),
  }));
  ck('one year past the study\'s endpoint the legend states its period instead of comparing',
    !/7 \/ 7 \/ 7/.test(klas25.note) && /2011\.–2024\./.test(klas25.note)
    && /pobjednice · 9/.test(klas25.counts[0]), JSON.stringify({ note: klas25.note, c: klas25.counts[0] }));

  /* Regije: the study prints no membership table, so the legend says the
     partition is the atlas's reading. The old copy footnoted Lika alone and
     described the study as undecided about it. */
  await fresh('#v=reg&c=1&y=2024');
  const regNote = await page.evaluate(() => document.querySelector('#legend .legend-note').textContent);
  ck('the Regije legend calls the county partition the atlas\'s reading, not the study\'s table',
    /ne objavljuje popis županija/.test(regNote) && /tumačenje atlasa/.test(regNote)
    && !/neodređeno/.test(regNote), regNote);

  /* The glossary is where the interpretation gets named per county, and where
     the study's own data caveats now live. */
  await fresh('');
  const gl9 = await page.evaluate(async () => {
    document.querySelector('#helpBtn').click();
    await new Promise(r => setTimeout(r, 300));   /* React has to flush before #helpCard exists */
    const c = document.querySelector('#helpCard');
    return {
      heads: [...c.querySelectorAll('.help-h')].map(h => h.textContent.trim()),
      body: c.textContent,
      terms: [...c.querySelectorAll('.help-dl dt')].map(d => d.textContent.trim()),
    };
  });
  ck('the glossary carries the study\'s own data-quality caveats, not only the atlas\'s',
    gl9.heads.includes('Ograničenja podataka')
    && /odjavama prebivališta/.test(gl9.body) && /privremeni boravak/.test(gl9.body)
    && /registar stanovništva/.test(gl9.body) && /kuće za odmor/.test(gl9.body)
    && /[Dd]nevne migracije nisu obuhvaćene/.test(gl9.body),
    JSON.stringify(gl9.heads));
  ck('and says the pre-2007 inter-county margins do not close',
    /2007/.test(gl9.body) && /ne odgovara zbroju odseljenih/.test(gl9.body), 'pre-2007');
  ck('the glossary explains the class divergence county by county',
    /Zašto se razredi razlikuju/.test(gl9.body) && /u radu neutralne, ovdje gubitnice/.test(gl9.body)
    && /berba podataka/.test(gl9.body), 'klas divergence');
  ck('and names the two contestable region assignments and the nine-region variant',
    /Ličko-senjska/.test(gl9.body) && /Šibensko-kninska/.test(gl9.body)
    && /devet regija/.test(gl9.body) && /ne imenuje središta/.test(gl9.body), 'regions');
  ck('both denominators are defined, including the estimate\'s clamp',
    gl9.terms.includes('% popisa 2011.') && gl9.terms.includes('% tek. procjene')
    && /2001\.–2024\./.test(gl9.body), JSON.stringify(gl9.terms.slice(-3)));
  /* The threshold IS a number from the study; the old copy denied it one
     sentence after naming it. */
  ck('the "no figure is taken from the study" claim exempts the threshold it names',
    /Osim samog praga, nijedna brojka nije preuzeta iz rada/.test(gl9.body), 'threshold exemption');

  /* Pre-2007 renders only in godišnje mode, which is exactly where the
     scrubber's hatch is drawn at opacity 0. */
  await fresh('#v=saldo&c=0&y=2002');
  const preNote = await page.evaluate(() => document.querySelector('#legend .legend-note').textContent);
  ck('a pre-2007 godišnje year says its margins do not close',
    /Prije 2007/.test(preNote), preNote);
  await fresh('#v=saldo&c=0&y=2018');
  ck('and a year after 2007 does not',
    !/Prije 2007/.test(await page.evaluate(() => document.querySelector('#legend .legend-note').textContent)), '2018');

  /* The export cites the study by DOI, so it owes the reason its numbers differ
     on the same image — there is no footer to scroll to in a PNG. */
  const eCav = await expNote('#v=klas');
  const eCavSaldo = await expNote('');
  ck('the exported study views carry the revision caveat, not only the reference',
    /revidira serije/.test(eCav.svg) && /razlikuju od objavljenih u radu/.test(eCav.svg),
    'klas export caveat');
  ck('and a view that takes nothing from the study still says nothing about it',
    !/revidira serije/.test(eCavSaldo.svg), 'saldo export');

  /* Nalaz 2 said "samo tri županije" and the rail it opens listed five. */
  await fresh('');
  const nalaz2 = await page.evaluate(() => {
    const sel = document.querySelector('#story');
    sel.value = '1'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    return new Promise(r => setTimeout(() => r({
      cap: (document.querySelector('#storyCap') || {}).textContent || '',
      pos: [...document.querySelectorAll('#railList .rrow .rval')]
        .map(e => e.textContent.trim()).filter(t => t.startsWith('+')).length,
    }), 260));
  });
  ck('Nalaz 2 states the number of growing counties the rail beneath it lists',
    /pet županija/.test(nalaz2.cap) && nalaz2.pos === 5 && !/samo tri/.test(nalaz2.cap),
    JSON.stringify(nalaz2));

  /* The six v2.0.9 presets exist because the first seven covered the atlas's
     apparatus and not the study's argument. Same rule as every other caption:
     the numbers it cites are the numbers its own view renders. */
  const railOf = async ix => {
    await fresh('');
    return page.evaluate(async i => {
      const s = document.querySelector('#story');
      s.value = String(i); s.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 280));
      const rows = [...document.querySelectorAll('#railList .rrow')].map(e => ({
        n: (e.querySelector('.rname') || {}).textContent || '',
        v: (e.querySelector('.rval') || {}).textContent || '',
      }));
      return { cap: (document.querySelector('#storyCap') || {}).textContent || '', rows };
    }, ix);
  };
  const nInt = await railOf(7);          /* Dva motora rasta — unutarnji, kum 2024 */
  const zag = nInt.rows.find(r => /Zagrebačka/.test(r.n) && !/Grad/.test(r.n));
  ck('the internal/external Nalaz cites the internal saldo its own rail renders',
    /\+15\.287/.test(nInt.cap) && zag && /15\.287/.test(zag.v),
    JSON.stringify({ zag, cited: /\+15\.287/.test(nInt.cap) }));
  const nRel = await railOf(8);          /* Relativno gleda drukčije — % popisa 2011. */
  ck('the relative-lens Nalaz puts Istarska on top of the rail, ahead of Grad Zagreb',
    /Istarska/.test(nRel.rows[0].n) && /10,8/.test(nRel.rows[0].v)
    && /Grad Zagreb/.test(nRel.rows[2].n), JSON.stringify(nRel.rows.slice(0, 3)));
  const nNat = await railOf(10);         /* Prirodni pad nema iznimke */
  ck('the natural-change Nalaz renders 21 negative counties, no exceptions',
    nNat.rows.length === 21 && nNat.rows.every(r => r.v.includes('−')),
    JSON.stringify({ rows: nNat.rows.length, top: nNat.rows[0] }));
  /* The Matrica had no story at all; this one opens a corridor in the grid
     rather than switching views, which is the v2.0.7 contract. */
  await fresh('');
  const nMx = await page.evaluate(async () => {
    const s = document.querySelector('#story');
    s.value = '14'; s.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return {
      cells: document.querySelectorAll('.mxc').length,
      selMark: !!document.querySelector('.mxsel'),
      docked: !!document.querySelector('.rail .paircard'),
      cap: (document.querySelector('#storyCap') || {}).textContent || '',
    };
  });
  ck('the Matrica Nalaz opens its corridor inside the grid, card docked in the rail',
    nMx.cells === 420 && nMx.selMark && nMx.docked && /4\.288/.test(nMx.cap) && /−517/.test(nMx.cap),
    JSON.stringify(nMx));

  /* ══════════ v2.0.9 — sources reachable, terms stated ══════════
     Every upstream source was named in plain text and linked nowhere, which for
     the 2018 flows is closer to an obligation than a courtesy: they are CC BY
     4.0, whose §3(a) asks for a hyperlink to the material where practicable, and
     OSM's attribution guidance asks for one to its copyright page. And nothing
     said what a reader may do with the artifact that actually leaves the app. */
  await fresh('');
  const srcLinks = await page.evaluate(() => [...document.querySelectorAll('.ft a')]
    .filter(a => a.getAttribute('href') !== 'https://hrcak.srce.hr/349820')
    .map(a => ({ href: a.getAttribute('href'), rel: a.getAttribute('rel') || '',
      text: a.textContent.trim(), name: a.getAttribute('aria-label') || '' })));
  ck('the footer links every upstream source it names, not only the study',
    ['podaci.dzs.hr', 'doi.org/10.1186', 'openstreetmap.org/copyright', 'geoboundaries.org']
      .every(h => srcLinks.some(a => a.href.includes(h)))
    && srcLinks.every(a => /noopener/.test(a.rel))
    /* 2.5.3 Label in Name: each opens in a new tab and says so, and the
       accessible name contains the visible text — "DZS" is what a speech-input
       user can see, so "Državni zavod za statistiku …" alone would miss it */
    && srcLinks.every(a => a.name.includes(a.text) && /novoj kartici/.test(a.name)),
    JSON.stringify(srcLinks.map(a => a.href)));
  /* The always-visible surface is where "non-commercial" belongs, and it had to
     cost the map nothing — one word inside a sentence already there. */
  const ncFoot = await page.evaluate(() => ({
    txt: document.querySelector('.ft').textContent,
    h: document.querySelector('.ft').getBoundingClientRect().height,
  }));
  ck('the footer states the project is non-commercial without gaining a line',
    /nekomercijalan/.test(ncFoot.txt) && ncFoot.h <= 78, JSON.stringify({ h: ncFoot.h }));
  const glLic = await page.evaluate(async () => {
    document.querySelector('#helpBtn').click();
    await new Promise(r => setTimeout(r, 300));
    const c = document.querySelector('#helpCard');
    return {
      heads: [...c.querySelectorAll('.help-h')].map(h => h.textContent.trim()),
      body: c.textContent,
      srcs: [...c.querySelectorAll('.help-src a')].map(a => a.getAttribute('href')),
      font: !!c.querySelector('a[href$="OFL-IBMPlex.txt"]'),
    };
  });
  ck('the glossary lists each source with its terms, and links the font licence',
    glLic.heads.includes('Licencije i izvori') && glLic.srcs.length === 4 && glLic.font
    && /CC BY 4\.0/.test(glLic.body) && /MIT/.test(glLic.body)
    && /ne prosljeđujte ih/.test(glLic.body),
    JSON.stringify({ srcs: glLic.srcs.length, font: glLic.font }));
  /* The exported figure is the one artifact with no link to click, so its terms
     go on it as text — and unlike the study line, they apply to every view. */
  const licK = await expNote('#v=klas');
  const licS = await expNote('');
  ck('every exported figure carries its own licence, study view or not',
    /Slika: CC BY 4\.0/.test(licK.svg) && /Slika: CC BY 4\.0/.test(licS.svg),
    JSON.stringify({ klas: /Slika: CC BY 4\.0/.test(licK.svg), saldo: /Slika: CC BY 4\.0/.test(licS.svg) }));
  /* A non-study export carries the licence and the source and nothing else —
     it must not imply it disagrees with a study it takes nothing from. */
  const sRows = [...licS.svg.matchAll(/<text x="20" y="(\d+(?:\.\d+)?)"[^>]*font-size="8\.5"/g)]
    .map(m => +m[1]).sort((a, b) => a - b);
  ck('and a non-study export draws only its own two credits',
    sRows.length >= 2 && sRows.every((y, i) => i === 0 || y - sRows[i - 1] === 14)
    && !/revidira serije|Klasifikacija i regije prema/.test(licS.svg),
    JSON.stringify(sRows));

  /* ── the export fits inside itself, at every width ──
     Reported by a user: at a narrow map the title ran straight through the
     right-aligned period ("NETO TOKOVI: … · KUMULATIVNA PROCJENA" over
     "2011.–2025."), and the licence and source rows ran off the right edge
     entirely. Both were drawn without ever being fitted. Measured directly —
     the exported SVG is put in the document and every band <text> is asked for
     its own advance width, which is the only way to catch this: the strings are
     built from data and no amount of reading the source shows the overflow. */
  const fitAt = async (wpx, hash) => {
    await page.setViewport({ width: wpx, height: 900 });
    await fresh(hash);
    const r = await page.evaluate(() => {
      const doc = window.__exportSVG(false);
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-99999px;top:0';
      host.innerHTML = doc;
      document.body.appendChild(host);
      const root = host.querySelector('svg');
      const W = +root.getAttribute('width');
      /* band text only: direct children of the root. The nested <svg> is the
         baked map, whose own <text> lives in map coordinates. */
      const band = [...root.children].filter(el => el.tagName === 'text');
      const box = t => {
        const len = t.getComputedTextLength();
        const x = +t.getAttribute('x');
        const base = { y: +t.getAttribute('y'), fs: +t.getAttribute('font-size') };
        return t.getAttribute('text-anchor') === 'end'
          ? { ...base, l: x - len, r: x }
          : { ...base, l: x, r: x + len };
      };
      const boxes = band.map(t => ({ ...box(t), s: t.textContent.slice(0, 44) }));
      const over = boxes.filter(b => b.r > W - 19 || b.l < 19);
      /* title vs the right-aligned period, same baseline */
      const byY = {};
      for (const b of boxes) (byY[b.y] = byY[b.y] || []).push(b);
      const clash = [];
      for (const y of Object.keys(byY)) {
        const row = byY[y].sort((a, b) => a.l - b.l);
        for (let i = 1; i < row.length; i++) if (row[i].l < row[i - 1].r - 0.5) clash.push(y + ': ' + row[i - 1].s + ' | ' + row[i].s);
      }
      document.body.removeChild(host);
      /* the title is the only run above 11 px at x=20; the eyebrow above it is
         10 px and every credit row below is 8,5 px */
      const title = boxes.filter(b => b.l === 20 && b.fs > 11);
      return { W, n: boxes.length, titleLines: title.length,
        titleFs: title.length ? title[0].fs : 0,
        over: over.map(b => `${b.s}@${Math.round(b.r)}>${W}`), clash };
    });
    return r;
  };
  /* `dir=net`, not `d=net`: `d` is the denominator and `net` is not one of its
     values, so the codec dropped it and the intended Neto direction held only
     because BASE.dir happens to be 'net'. A default change would have silently
     rerouted this overflow fixture to a shorter title — the ignore-invalid
     policy masking a typo in the suite's own inputs. */
  const FLOW = '#v=flow&s=HR-03&dir=net&c=1&y=2025';
  const fits = [await fitAt(1440, FLOW), await fitAt(1024, FLOW), await fitAt(1024, '#v=klas'),
    /* 390 is where the title hits its 12 px floor and has to wrap instead of
       shrinking further, and where the legend caveat drops from x=222 to its own
       line — both paths are only exercised down here */
    await fitAt(390, FLOW), await fitAt(390, '#v=klas'),
    /* Godine is the widest content in the app and its title carries the window
       plus the mode, so it exercises the band at a length the other views do
       not — appended rather than given its own check, so the existing overflow
       and overlap assertions simply cover one more view */
    await fitAt(1024, '#v=yrs&c=0&f=nat&y=2017'), await fitAt(390, '#v=yrs&c=1&y=2024'),
    /* and the same band in English, where every run is a different length: the
       eyebrow states the country and drops the Croatian trailing dots, which is
       four characters longer and lands within ~1 px of the 390 px edge. Appended
       rather than given its own check, so the overflow and overlap assertions
       above simply cover the second language too. */
    await fitAt(1440, '#l=en&v=flow&s=HR-03&dir=net&c=1&y=2025'), await fitAt(390, '#l=en&v=klas'),
    await fitAt(390, '#l=en&v=flow&s=HR-03&dir=net&c=1&y=2025')];
  ck('no exported band text runs past the canvas edge, 1440 down to 390',
    fits.every(f => f.over.length === 0),
    JSON.stringify(fits.map(f => f.over)).slice(0, 300));
  ck('and no two runs on the same baseline overlap — the title clears the period',
    fits.every(f => f.clash.length === 0),
    JSON.stringify(fits.map(f => f.clash)).slice(0, 300));
  ck('the title wraps at the narrow end rather than shrinking out of legibility',
    fits[3].titleLines === 2 && fits[3].titleFs >= 12 && fits[0].titleLines === 1,
    JSON.stringify({ mobile: fits[3].titleLines, fs: fits[3].titleFs, wide: fits[0].titleLines }));
  ck('the measurement actually inspected the band it claims to have checked',
    fits.every(f => f.n >= 6), JSON.stringify(fits.map(f => f.n)));
  await page.setViewport({ width: 1440, height: 900 });

  /* ══════════ v2.1.0 — Godine (21 counties × the series, as a grid) ══════════
     The atlas could show every county for one year (the map) and every year for
     one county (the detail card), and nothing showed both — so "when did this
     turn" was answered by scrubbing 28 times from memory. This block pins the
     grid itself, the two properties that make it honest (the tooltip is on the
     hovered cell's year, not the selected one; the colour domain is shared with
     Saldo so the two views are comparable), and the geometry rules the Matrica
     already had to obey. */
  await page.setViewport({ width: 1440, height: 900 });
  await fresh('#v=yrs&c=1&y=2024');
  const yg = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#map .yrc')];
    const grid = document.querySelector('#map[role="grid"]');
    const leg = document.querySelector('#legend').getBoundingClientRect();
    const b0 = cells[0].getBoundingClientRect();
    return {
      cells: cells.length,
      rows: document.querySelectorAll('#map [role="row"]').length,
      tab0: document.querySelectorAll('#map .yrc[tabindex="0"]').length,
      rowcount: grid.getAttribute('aria-rowcount'), colcount: grid.getAttribute('aria-colcount'),
      aria0: cells[0].getAttribute('aria-label'),
      gridcells: cells.filter(c => c.getAttribute('role') === 'gridcell').length,
      overLegend: cells.filter(c => {
        const r = c.getBoundingClientRect();
        return r.left < leg.right && r.right > leg.left && r.top < leg.bottom && r.bottom > leg.top;
      }).length,
      cw: b0.width, ch: b0.height,
      sel: document.querySelectorAll('#map .yrsel').length,
      pre: document.querySelectorAll('#map .yrpre').length,
      railRole: document.querySelector('#railList .rrow').getAttribute('role'),
      card: !!document.querySelector('#card.show'),
    };
  });
  /* cumulative starts the columns at 2011 rather than painting nine columns of
     zeros — `val()` returns 0 before then, which is where the sum starts, not a
     measurement (the same trap `#v=saldo&y=2005` fell into) */
  ck('Godine draws 21 county rows × 15 cumulative years, every cell a gridcell',
    yg.cells === 315 && yg.rows === 21 && yg.gridcells === 315
    && yg.rowcount === '21' && yg.colcount === '15', JSON.stringify(yg).slice(0, 200));
  ck('roving tabindex: exactly one of the 315 cells is a tab stop',
    yg.tab0 === 1, String(yg.tab0));
  ck('a cell states its own county, year and value (#tip is aria-hidden)',
    /^Grad Zagreb, 2011\.: \+2\.139$/.test(yg.aria0), yg.aria0);
  /* At the reference viewport the design target is met outright: nothing under
     the legend and a cell well past the 12 px fitGrid aims for. That is worth
     pinning, but it was the ONLY place either property was measured — see the
     sweep below for what the contract actually is. */
  ck('at 1440×900 no cell sits under the legend and the grid clears its 12 px target',
    yg.overLegend === 0 && yg.cw >= 12 && yg.ch >= 12,
    JSON.stringify({ over: yg.overLegend, cw: yg.cw, ch: yg.ch }));
  /* Swept, and against the floor the code actually guarantees. The whole `yg`
     probe ran at one viewport, and both of its clauses are false elsewhere on the
     shipped build: at 1024×768 annual, 48 cells sit inside the legend's rect at a
     12,0 × 10,0 px cell; at 1024×700, 160 cells; at 1280×720 the cell is
     10,3 × 11,5 and at 901×900 it is 7,6 × 11,3. The 12 px is not the app's floor
     at all — YearsView floors at 7 × 10 — it is a coincidence of 1440×900. And
     gridfit documents overflow *past the legend* as the intended trade when no
     placement reaches its target, so `overLegend === 0` was asserting a property
     the design deliberately gives up. What the design does not give up is the
     other half of that trade: the overflow must run past the legend, which is
     pointer-events:none, and never under the chip dock, which is opaque and eats
     the pointer — that is where a cell stops being reachable rather than merely
     off-box. */
  const ygSweep = [];
  for (const [vw, vh] of [[1600, 900], [1440, 900], [1280, 900], [1280, 720],
    [1024, 768], [1024, 700], [960, 900], [901, 900]]) {
    await page.setViewport({ width: vw, height: vh });
    for (const h of ['#v=yrs&c=1&y=2024', '#v=yrs&c=0&y=2024']) {
      await fresh(h);
      const g = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('#map .yrc')];
        const dock = document.querySelector('.chipdock');
        const d = dock && getComputedStyle(dock).position === 'absolute'
          ? dock.getBoundingClientRect() : null;
        const leg = document.querySelector('#legend').getBoundingClientRect();
        const hits = (r, box) => r.left < box.right && r.right > box.left
          && r.top < box.bottom && r.bottom > box.top;
        const b0 = cells[0].getBoundingClientRect();
        return { n: cells.length, cw: +b0.width.toFixed(1), ch: +b0.height.toFixed(1),
          overDock: d ? cells.filter(c => hits(c.getBoundingClientRect(), d)).length : 0,
          overLegend: cells.filter(c => hits(c.getBoundingClientRect(), leg)).length };
      });
      if (!g.n || g.cw < 7 || g.ch < 10 || g.overDock > 0) {
        ygSweep.push(vw + 'x' + vh + ' ' + h.slice(1) + ' ' + JSON.stringify(g));
      }
    }
  }
  ck('Godine keeps its 7×10 cell floor and never overflows under the chip dock, 901–1600 px',
    ygSweep.length === 0, ygSweep.slice(0, 3).join(' | '));
  await page.setViewport({ width: 1440, height: 900 });
  await fresh('#v=yrs&c=1&y=2024');
  ck('the selected year is marked and no pre-2007 hatch appears in cumulative mode',
    yg.sel === 1 && yg.pre === 0, JSON.stringify({ sel: yg.sel, pre: yg.pre }));
  /* nothing to open here — the row IS the county's series, so a rail row must not
     claim role=button, and no county card may be painted over the grid */
  ck('Godine rail rows are role=img and no county card covers the grid',
    yg.railRole === 'img' && !yg.card, yg.railRole + ' card=' + yg.card);

  /* The property the whole view turns on: the hovered cell names a year that is
     generally NOT the selected one, so reading S.yi would have printed a
     different column's numbers under that cell's county — the same class of
     defect as the matrix labelling a cell `a → b` over `b → a`'s number. */
  const at = await page.evaluate(() => {
    const b = document.querySelector('#map .yrc[data-iso="HR-21"][data-y="2015"]').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(at.x, at.y);
  await settle(220);
  const ytip = await page.evaluate(() => ({
    tip: document.querySelector('#tip').textContent,
    shown: document.querySelector('#tip').classList.contains('show'),
    bigYear: document.querySelector('#bigYear').textContent,
    band: document.querySelectorAll('#map .yrband rect').length,
  }));
  ck('the tooltip reports the hovered cell’s year, not the selected one',
    ytip.shown && /2015\./.test(ytip.tip) && ytip.bigYear === '2024.' && ytip.band === 2,
    JSON.stringify({ big: ytip.bigYear, band: ytip.band, tip: ytip.tip.slice(0, 120) }));

  /* Saldo and Godine share DOM[flow+den+cum] exactly, so the same county-year is
     the same fill in both — that is what lets a reader carry a colour from the
     map to the grid. Compared by measuring the same cell twice. */
  const fillYrs = await page.evaluate(() =>
    getComputedStyle(document.querySelector('#map .yrc[data-iso="HR-18"][data-y="2024"]')).fill);
  await fresh('#v=saldo&c=1&y=2024');
  const fillMap = await page.evaluate(() =>
    getComputedStyle(document.querySelector('#map .cnt[data-iso="HR-18"]')).fill);
  ck('a county-year is the same colour in Godine as on the Saldo map',
    fillYrs === fillMap && /^rgb/.test(fillYrs), fillYrs + ' vs ' + fillMap);

  /* annual mode renders 1998–2006 beside the rest — the first view that does —
     so it is the first that can mark where the inter-county margins start
     closing (measured: Σ(ii) − Σ(oi) is −550…−490 to 2006, exactly 0 from 2007) */
  await fresh('#v=yrs&c=0&y=2024');
  const yann = await page.evaluate(() => ({
    cells: document.querySelectorAll('#map .yrc').length,
    pre: document.querySelectorAll('#map .yrpre').length,
    note: document.querySelector('#legend .legend-note').textContent,
    first: document.querySelector('#map .yrc').getAttribute('data-y'),
  }));
  ck('godišnje mode renders all 28 years and hatches the pre-2007 span',
    yann.cells === 588 && yann.pre === 1 && yann.first === '1998'
    && /Šrafirano do 2007/.test(yann.note), JSON.stringify(yann).slice(0, 160));

  /* clicking a cell is how the grid doubles as a year picker: it drives the same
     S.yi the scrubber and every other view read */
  const yclick = await page.evaluate(async () => {
    document.querySelector('#map .yrc[data-iso="HR-21"][data-y="2003"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    return { big: document.querySelector('#bigYear').textContent, hash: location.hash };
  });
  ck('activating a cell sets the year everywhere, and it lands in the permalink',
    yclick.big === '2003.' && /y=2003/.test(yclick.hash), JSON.stringify(yclick));

  /* arrows walk the grid; without stopPropagation App's window handler also
     steps the year, so one press would move two things */
  const yarrow = await page.evaluate(async () => {
    const c = document.querySelector('#map .yrc[tabindex="0"]');
    c.focus();
    const before = document.querySelector('#bigYear').textContent;
    const wasCell = c.getAttribute('aria-label');
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const now = document.querySelector('#map .yrc[tabindex="0"]');
    return { yearHeld: before === document.querySelector('#bigYear').textContent,
      moved: wasCell !== now.getAttribute('aria-label'), focused: document.activeElement === now };
  });
  ck('arrow keys walk the grid without also stepping the year',
    yarrow.yearHeld && yarrow.moved && yarrow.focused, JSON.stringify(yarrow));

  /* the two-tone ring is a keyboard affordance — a real mouse click must not
     paint it (the check that caught this on the map drives CDP, not dispatch) */
  await fresh('#v=yrs&c=0&y=2024');
  const yb = await page.evaluate(() => {
    const b = document.querySelector('#map .yrc[data-iso="HR-21"][data-y="2015"]').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.click(yb.x, yb.y);
  await settle(160);
  const ringMouse = await page.evaluate(() => document.querySelectorAll('#map .focusring').length);
  await page.keyboard.press('ArrowRight');
  await settle(160);
  const ringKey = await page.evaluate(() => document.querySelectorAll('#map .focusring').length);
  ck('a mouse click leaves no keyboard ring on a cell; an arrow key brings it',
    ringMouse === 0 && ringKey === 1, `mouse=${ringMouse} key=${ringKey}`);

  /* the grid steers around the chip dock, exactly as the matrix has to — clearing
     it vertically alone crushes the cell, which is why the search tries four
     placements rather than one */
  await fresh('#v=yrs&c=1&y=2024&cz=1');
  const ydock = await page.evaluate(() => {
    const d = document.querySelector('.chipdock');
    if (!d || getComputedStyle(d).position !== 'absolute') return { skip: true };
    /* union, not the dock's own rect: the open body is anchored above the
       header stack and is outside it — see the same note in the overlay sweep */
    const bs = [...d.querySelectorAll('.chipcard, .chipcard.open .chip-body')]
      .filter(c => c.getClientRects().length).map(c => c.getBoundingClientRect());
    const b = { left: Math.min(...bs.map(r => r.left)), right: Math.max(...bs.map(r => r.right)),
      top: Math.min(...bs.map(r => r.top)), bottom: Math.max(...bs.map(r => r.bottom)) };
    const c0 = document.querySelector('#map .yrc').getBoundingClientRect();
    return {
      under: [...document.querySelectorAll('#map .yrc')].filter(c => {
        const r = c.getBoundingClientRect();
        return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
      }).length,
      cw: c0.width, ch: c0.height,
    };
  });
  ck('an open chip panel covers no cell, and the grid keeps a usable cell',
    ydock.skip || (ydock.under === 0 && ydock.cw >= 12 && ydock.ch >= 12), JSON.stringify(ydock));

  /* The dock covers cells when it is CLOSED too — the case nothing was watching.
     `panel` used to be reported only while a chip was open, so the collapsed
     dock (247 × 62 px of opaque headers) was never steered around: measured at
     the default state, 8 unreachable `.mxc` at 1440 and 24 at 1150, plus 20 / 34
     `.yrc` in Godine. Probed with `elementFromPoint`, because rect overlap is not
     the same as reachable — and asserted for BOTH grid views, since this was
     never a Godine bug, only a Godine-visible one. */
  const dockClosed = [];
  let dockProbed = 0;
  for (const W of [1600, 1440, 1150, 960]) {
    await page.setViewport({ width: W, height: 900 });
    for (const [h, sel] of [['#v=yrs&c=1&y=2024', '.yrc'], ['#v=yrs&c=0&y=2024', '.yrc'],
      ['#v=mx&y=2018&c=0', '.mxc']]) {
      await fresh(h);
      const bad = await page.evaluate(s => {
        const d = document.querySelector('.chipdock');
        if (!d || getComputedStyle(d).position !== 'absolute') return 0;
        const b = d.getBoundingClientRect();
        return [...document.querySelectorAll('#map ' + s)].filter(c => {
          const r = c.getBoundingClientRect();
          if (!(r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top)) return false;
          const el = document.elementFromPoint(
            (Math.max(r.left, b.left) + Math.min(r.right, b.right)) / 2,
            (Math.max(r.top, b.top) + Math.min(r.bottom, b.bottom)) / 2);
          return !!(el && el.closest('.chipdock'));
        }).length;
      }, sel);
      if (bad) dockClosed.push(`${W}${h.slice(0, 8)}${sel}:${bad}`);
      dockProbed += await page.evaluate(s => {
        const d = document.querySelector('.chipdock');
        return d && getComputedStyle(d).position === 'absolute'
          ? document.querySelectorAll('#map ' + s).length : 0;
      }, sel);
    }
  }
  await page.setViewport({ width: 1440, height: 900 });
  ck('a CLOSED chip dock covers no grid cell either, in Matrica or Godine',
    dockClosed.length === 0, dockClosed.join(' | '));
  /* Both dock-coverage checks return "pass" the moment `.chipdock` stops being
     position:absolute — and this file records active design pressure on exactly
     that element. A floor makes the vacuous case a failure. */
  ck('and that sweep actually compared cells rather than skipping on a layout change',
    dockProbed > 4000, String(dockProbed));

  /* a carried `sel` has no card to open here, so it must die on the way in —
     the v2.0.5 rule, reached by a seventh view */
  await fresh('#v=yrs&s=HR-18&c=1&y=2024');
  const ysel = await page.evaluate(() => ({ hash: location.hash, card: !!document.querySelector('#card.show') }));
  ck('a permalink into Godine drops a county selection it cannot render',
    !/s=HR-18/.test(ysel.hash) && !ysel.card, JSON.stringify(ysel));

  /* the export is the artifact that leaves the app: it must carry the grid, its
     own title, the pre-2007 words the hatch has no caption for, and none of the
     UI state that would turn a figure into a screenshot */
  await fresh('#v=yrs&c=0&y=2024');
  const yexp = await page.evaluate(async () => {
    document.querySelector('#map .yrc[tabindex="0"]').focus();
    await new Promise(r => setTimeout(r, 120));
    const svg = window.__exportSVG(false);
    return {
      cells: (svg.match(/class="yrc"/g) || []).length,
      title: /ŽUPANIJE KROZ GODINE/i.test(svg),
      period: /1998\.–2025\./.test(svg),
      pre: /Šrafirano do 2007/.test(svg),
      noRing: !svg.includes('focusring'),
      png: await window.__exportPNG(false),
    };
  });
  ck('the exported figure carries all 588 cells, its own title and period',
    yexp.cells === 588 && yexp.title && yexp.period && yexp.png.bytes > 20000,
    JSON.stringify({ cells: yexp.cells, title: yexp.title, period: yexp.period }));
  ck('it carries the pre-2007 caveat the hatch has no room to word, and no focus ring',
    yexp.pre && yexp.noRing, JSON.stringify({ pre: yexp.pre, noRing: yexp.noRing }));
  /* The two formats must stay twins for this view too — the band heights are
     computed from measured text, so a view whose title is longer than any other
     is exactly where the PNG and the SVG could drift apart. */
  const ytwin = await page.evaluate(async () => {
    const doc = window.__exportSVG(false);
    const m = /<svg[^>]*width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/.exec(doc);
    const png = await window.__exportPNG(false);
    return { svgW: +m[1], svgH: +m[2], pngW: png.w, pngH: png.h };
  });
  ck('the Godine PNG is exactly 2× the SVG the same state emits',
    ytwin.pngW === ytwin.svgW * 2 && ytwin.pngH === ytwin.svgH * 2,
    `${ytwin.pngW}x${ytwin.pngH} vs 2×${ytwin.svgW}x${ytwin.svgH}`);

  /* the two Godine presets: each cites a sign change only this view can show */
  const yst = async ix => {
    await fresh('');
    return page.evaluate(async i => {
      const s = document.querySelector('#story');
      s.value = String(i); s.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 320));
      const cell = (iso, y) => {
        const e = document.querySelector(`#map .yrc[data-iso="${iso}"][data-y="${y}"]`);
        return e ? e.getAttribute('aria-label') : null;
      };
      return {
        cap: (document.querySelector('#storyCap') || {}).textContent || '',
        view: document.querySelector('#segView button[aria-pressed="true"]').dataset.v,
        gz22: cell('HR-21', 2022), gz15: cell('HR-21', 2015), zg22: cell('HR-01', 2022),
      };
    }, ix);
  };
  const nZg = await yst(12);
  ck('the Zagreb-reversal Nalaz renders the sign change its caption cites',
    nZg.view === 'yrs' && /−622/.test(nZg.gz22) && /\+4\.420/.test(nZg.gz15)
    && /\+2\.238/.test(nZg.zg22) && /−622/.test(nZg.cap),
    JSON.stringify(nZg).slice(0, 220));
  const nNatY = await page.evaluate(async () => {
    const s = document.querySelector('#story');
    s.value = '13'; s.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 320));
    const cells = [...document.querySelectorAll('#map .yrc')];
    const from2017 = cells.filter(c => +c.getAttribute('data-y') >= 2017);
    return {
      cap: (document.querySelector('#storyCap') || {}).textContent || '',
      total: from2017.length,
      positive: from2017.filter(c => /: \+/.test(c.getAttribute('aria-label'))).length,
    };
  });
  /* 21 counties × 2017–2025 = 189 cells, and the caption says every one of them
     is negative — a claim the grid either shows or does not */
  ck('the natural-change Nalaz: no county is positive in any year from 2017 on',
    nNatY.total === 189 && nNatY.positive === 0 && /2016/.test(nNatY.cap),
    JSON.stringify({ total: nNatY.total, pos: nNatY.positive }));

  /* ── the external Nalaz's two superlatives, against the atlas's own series ──
     It said 2022 was the first year the national external balance was positive
     and that at most one county had ever been positive before 2017. The shipped
     data says the balance is positive in every year 1998–2008, peaking at
     +44.192 — nearly four times the +11.685 the caption cites — and that in 1998
     all 21 counties were positive. The atlas draws eleven years of that surplus
     in the scrubber 100 px under the banner denying it.
     Recomputed from the Godine grid rather than from the JSON: 21 counties ×
     28 years of aria-labels, summed per year, is the same number the map paints
     and is independent of metrics.ts. No check pinned this preset — the
     round-trip check asserts a caption survives its own link, never that it is
     true. */
  await fresh('#v=yrs&f=ext&c=0&y=2022');
  const extY = await page.evaluate(() => {
    const num = t => Number(String(t).replace(/\./g, '').replace('−', '-').replace('+', '').trim());
    const per = {};
    for (const c of document.querySelectorAll('#map .yrc')) {
      const y = +c.getAttribute('data-y');
      (per[y] = per[y] || []).push(num((c.getAttribute('aria-label') || '').split(': ')[1]));
    }
    const nat = {}, pos = {};
    for (const y of Object.keys(per)) {
      nat[y] = per[y].reduce((a, b) => a + b, 0);
      pos[y] = per[y].filter(v => v > 0).length;
    }
    return { cells: document.querySelectorAll('#map .yrc').length, nat, pos };
  });
  const lastPlus = Object.keys(extY.nat).map(Number)
    .filter(y => y < 2022 && extY.nat[y] > 0).sort((a, b) => b - a)[0];
  await fresh('');
  const nExt = await page.evaluate(async () => {
    const s = document.querySelector('#story');
    s.value = '9'; s.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return { cap: (document.querySelector('#storyCap') || {}).textContent || '', hash: location.hash,
      pos: [...document.querySelectorAll('#railList .rrow .rval')]
        .map(e => e.textContent.trim()).filter(t => t.startsWith('+')).length };
  });
  ck('the external Nalaz dates its reversal to the year the atlas’s own series does',
    extY.cells === 588 && extY.nat[2022] === 11685 && lastPlus === 2008
    && /prvi je put od 2008\./.test(nExt.cap) && !/prvi put je pozitivan/.test(nExt.cap)
    && /\+11\.685/.test(nExt.cap),
    JSON.stringify({ lastPlus, nat2022: extY.nat[2022], nat2008: extY.nat[2008], nat1998: extY.nat[1998] }));
  ck('and the one-county window it names is the window the grid actually shows',
    extY.pos[2015] <= 1 && extY.pos[2016] <= 1 && extY.pos[2017] <= 1 && extY.pos[2014] > 1
    && extY.pos[1998] === 21 && extY.pos[2022] === 12 && extY.pos[2024] === 19
    && /Od 2015\. do 2017\./.test(nExt.cap) && /ima ih 12/.test(nExt.cap)
    && /19 od 21/.test(nExt.cap) && nExt.pos === 12 && /st=10/.test(nExt.hash),
    JSON.stringify({ p1998: extY.pos[1998], p2014: extY.pos[2014], p2015: extY.pos[2015],
      p2016: extY.pos[2016], p2017: extY.pos[2017], p2022: extY.pos[2022], p2024: extY.pos[2024], rail: nExt.pos }));

  /* 390: the densest grid in the app on the narrowest layout */
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await fresh('#v=yrs&c=1&y=2024');
  const y390 = await page.evaluate(() => {
    const de = document.documentElement;
    return {
      overflow: de.scrollWidth - de.clientWidth,
      cells: document.querySelectorAll('#map .yrc').length,
      hit: document.querySelectorAll('#map .yrhit').length,
      tab0: document.querySelectorAll('#map .yrc[tabindex="0"]').length,
    };
  });
  ck('390: Godine never scrolls the page sideways and keeps its touch hit layer',
    y390.overflow <= 0 && y390.cells === 315 && y390.hit === 1 && y390.tab0 === 1,
    JSON.stringify(y390));
  await page.setViewport({ width: 1440, height: 900 });

  /* ══ v2.1.1 — what a PageSpeed run found ══════════════════════════════════
     Six defects, each measured here rather than trusted to a score: an invalid
     robots.txt, 21 rail rows whose spoken name did not contain their visible
     one, a 64×18 touch target, the whole page shifting when the fonts swapped,
     3,68 % legible text on a phone, and no source maps. */

  /* The SPA rewrite in vercel.json answers /(.*) with index.html, so before this
     file existed /robots.txt served `<!DOCTYPE html>` with a 200 and a crawler
     read 31 invalid directives out of it. Static files are matched first, so the
     file alone is the fix — but only if it *is* a file, which is what this asks. */
  const robots = await page.evaluate(async u => {
    const r = await fetch(u + 'robots.txt');
    const t = await r.text();
    return { status: r.status, type: r.headers.get('content-type') || '', body: t };
  }, url);
  const robotLines = robots.body.split('\n').map(s => s.trim())
    .filter(s => s && !s.startsWith('#'));
  /* The guard is on the *directives*, not the whole file: a `#` comment may say
     anything, including — as this one's does — the words `<!DOCTYPE html>` it
     exists to explain. What must not appear is markup a crawler would try to
     read as a rule, which is exactly what the rewrite used to serve. */
  ck('robots.txt is a real file, and every directive in it parses',
    robots.status === 200 && !/^\s*</.test(robots.body)
    && robotLines.length > 0 && robotLines.every(l => /^[A-Za-z-]+:\s*\S*$/.test(l))
    /* Every crawler is allowed, and it has to stay that way by construction:
       exactly one User-agent group, and it is the wildcard. A named group
       *replaces* the wildcard for that agent, so a single `User-agent: GPTBot`
       block would quietly exempt it from the Allow below — which is the one way
       "allow everything" regresses without anyone editing the Allow line. */
    && robotLines.filter(l => /^user-agent:/i.test(l)).length === 1
    && robotLines.some(l => /^user-agent:\s*\*$/i.test(l))
    && robotLines.some(l => /^allow:\s*\/$/i.test(l))
    /* and nothing is hidden from a renderer: a JS-rendered atlas whose assets
       are disallowed is an atlas a search engine cannot see */
    && !robotLines.some(l => /^disallow:\s*\S/i.test(l)),
    JSON.stringify({ status: robots.status, type: robots.type, lines: robotLines }));

  /* the Sitemap line must lead somewhere. Its URL is absolute by protocol and
     names the production origin, so the *path* is what is checked here — the
     suite runs offline and against whatever host it was pointed at. */
  const smPath = (robotLines.find(l => /^sitemap:/i.test(l)) || '').replace(/^sitemap:\s*/i, '');
  const sitemap = await page.evaluate(async (u) => {
    const r = await fetch(u + 'sitemap.xml');
    const t = await r.text();
    const d = new DOMParser().parseFromString(t, 'application/xml');
    return { status: r.status, err: !!d.querySelector('parsererror'),
      root: d.documentElement.nodeName,
      ns: d.documentElement.namespaceURI,
      locs: [...d.querySelectorAll('url > loc')].map(e => e.textContent.trim()) };
  }, url);
  ck('and its Sitemap line names a sitemap that parses and lists the site',
    /^https:\/\/\S+\/sitemap\.xml$/.test(smPath) && sitemap.status === 200 && !sitemap.err
    && sitemap.root === 'urlset' && sitemap.ns === 'http://www.sitemaps.org/schemas/sitemap/0.9'
    && sitemap.locs.length === 1 && /^https:\/\//.test(sitemap.locs[0])
    && smPath.startsWith(new URL(sitemap.locs[0]).origin),
    JSON.stringify({ smPath, ...sitemap }));

  /* The first-paint placeholder. #root was empty until React mounted, which on
     the mobile profile meant 2.054 ms of "render delay" — 76 % of LCP — spent
     looking at the background colour. Measured A/B on 4× CPU / 1,6 Mbps with
     the cache off: FCP 4.244 → 768 ms, and CLS 0,0035 → 0 (the app replacing
     the placeholder shifts nothing, because nothing that was on screen moves).
     The wall-clock number is reported, not pinned — it is machine-dependent.
     What is pinned is the structure it depends on. */
  const bootHtml = await page.evaluate(async u => await (await fetch(u)).text(), url);
  const rootBlock = (bootHtml.match(/<div id="root">([\s\S]*?)<\/div>\s*<!--/) || [])[1] || '';
  ck('a first-paint placeholder ships inside #root, and JS-off hides it',
    /class="boot"/.test(rootBlock)
    /* inside #root is what makes it self-clearing — see below */
    && /<noscript><style>[^<]*\.boot\{display:none\}/.test(bootHtml),
    JSON.stringify({ inRoot: /class="boot"/.test(rootBlock), noscript: /\.boot\{display:none\}/.test(bootHtml) }));

  /* createRoot() replaces whatever it finds in its container, so the placeholder
     is removed by the same act that makes it unnecessary — nothing has to
     remember to clear it, and there is no window with both on screen. Verified
     rather than assumed: React's container behaviour is the whole reason this
     needs no teardown code, and if it ever changed the placeholder would sit
     on top of the app forever. */
  await fresh('');
  const bootGone = await page.evaluate(() => ({
    left: document.querySelectorAll('.boot').length,
    kids: document.getElementById('root').children.length,
    first: (document.getElementById('root').children[0] || {}).className,
  }));
  ck('and mounting the app removes it, with no teardown code to forget',
    bootGone.left === 0 && bootGone.kids > 1 && bootGone.first === 'skip',
    JSON.stringify(bootGone));

  /* Source maps are fetched over HTTP rather than read off disk, so this check
     means the same thing when the suite is pointed at a running server. */
  const smap = await page.evaluate(async u => {
    const html = await (await fetch(u)).text();
    const src = (html.match(/src="([^"]*index-[^"]*\.js)"/) || [])[1];
    if (!src) return { err: 'no entry chunk in index.html' };
    const js = await (await fetch(new URL(src, u))).text();
    const m = js.match(/sourceMappingURL=(\S+)/);
    if (!m) return { err: 'no sourceMappingURL on the entry chunk' };
    const r = await fetch(new URL(m[1], new URL(src, u)));
    if (!r.ok) return { err: 'map ' + r.status };
    const j = await r.json();
    return { sources: (j.sources || []).length, hasMappings: !!j.mappings,
      names: (j.sources || []).filter(s => /App\.tsx|metrics\.ts/.test(s)).length };
  }, url);
  ck('the entry chunk ships a source map that resolves to real sources',
    !smap.err && smap.hasMappings && smap.sources > 50 && smap.names >= 2,
    JSON.stringify(smap));

  /* WCAG 2.5.3, and the reason it failed: the visible label of a row is its text
     children joined with NO separator, so `Grad Zagreb` + `+41.986` reads
     `Grad Zagreb+41.986`, which `Grad Zagreb +41.986` does not contain. axe's
     label-content-name-mismatch, reimplemented rather than depended on — the
     suite takes no new package and no network. Run over every row shape there
     is: county, corridor (which leads with a rank), region, JLS (which appends
     a county tag) and Godine. */
  const nameSan = `(s => s.replace(/\\s+/g, ' ').trim().toLowerCase())`;
  const nameProbe = `(() => {
    const san = ${nameSan};
    const vis = el => san([...el.childNodes].map(nd =>
      nd.nodeType === 3 ? nd.nodeValue : (nd.nodeType === 1 ? vis(nd) : '')).join(''));
    const rows = [...document.querySelectorAll('#railList .rrow')];
    const bad = rows.filter(r => {
      const lab = san(r.getAttribute('aria-label') || '');
      return !lab || !lab.includes(vis(r));
    });
    return { n: rows.length, nbad: bad.length,
      worst: bad.slice(0, 2).map(r => vis(r) + ' !< ' + r.getAttribute('aria-label')) };
  })()`;
  const nameViews = [];
  for (const h of ['', '#v=flow&s=HR-21&y=2018&c=0', '#v=mx&y=2018&c=0', '#v=reg&c=1&y=2024', '#v=jmap&y=2018&c=0', '#v=yrs&c=1&y=2024']) {
    await fresh(h);
    if (h.startsWith('#v=jmap')) await page.waitForFunction(() => document.querySelectorAll('#map .jl').length === 556, { timeout: 20000 });
    nameViews.push({ h: h || '(saldo)', ...(await page.evaluate(nameProbe)) });
  }
  ck('every rail row’s accessible name contains its visible label, in every view',
    nameViews.every(v => v.n > 0 && v.nbad === 0),
    JSON.stringify(nameViews.filter(v => v.nbad).slice(0, 2)) || JSON.stringify(nameViews.map(v => v.n)));

  /* 64×18 was reported at "should be at least 24px by 24px". The ::before hit
     extension does not count — axe and WCAG 2.5.8 measure the element's own box —
     so the box itself grew upwards, into the page rather than into the chart. The
     visible handle must stay 18 px, which is why the chrome moved to ::after. */
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await fresh('');
  const tog = await page.evaluate(() => {
    const e = document.querySelector('#scrubTog');
    const r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const chart = document.querySelector('.scrub-chart').getBoundingClientRect();
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      hit: hit ? hit.id : null, overChart: +(r.bottom - chart.top).toFixed(1) };
  });
  ck('the scrubber toggle is a ≥24 px target that still keeps off the chart',
    tog.w >= 24 && tog.h >= 24 && tog.hit === 'scrubTog' && tog.overChart <= 0,
    JSON.stringify(tog));

  /* Lighthouse's legible-text bar is >60 % of rendered characters at ≥12 px; the
     phone layout measured 3,68 %, with `.ft` alone 50,97 % of all text on the
     page. Its own heuristic, reimplemented: weight every visible text node by
     its length against the computed font-size of its parent. */
  const legible = await page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let total = 0, big = 0;
    for (let nd = w.nextNode(); nd; nd = w.nextNode()) {
      const t = nd.nodeValue.trim(); if (!t) continue;
      const p = nd.parentElement; if (!p || !p.getClientRects().length) continue;
      const cs = getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      total += t.length;
      if (parseFloat(cs.fontSize) >= 12) big += t.length;
    }
    const clipped = [...document.querySelectorAll('#railList .rname, #railList .rval')]
      .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent);
    return { pct: +(big / total * 100).toFixed(2), total, clipped };
  });
  ck('a phone reads mostly ≥12 px text, and no rail cell is clipped to fit',
    legible.pct > 60 && legible.total > 500 && legible.clipped.length === 0,
    JSON.stringify(legible).slice(0, 200));
  await page.setViewport({ width: 1440, height: 900 });

  /* The other half of 2.5.8, and the one that failed at *every* desktop width:
     21 rail rows at 291×19, with 14 px of safe clickable space between
     neighbours. Checked only in the views whose rows actually activate — a
     role=img row is not a target — and across the width band the overlap sweeps
     already use. The cost is a rail that scrolls sooner; see index.css. */
  const rowTargets = [];
  for (const w of [960, 1200, 1440, 1600]) {
    await page.setViewport({ width: w, height: 900 });
    for (const h of ['', '#v=flow&s=HR-21&y=2018&c=0', '#v=mx&y=2018&c=0']) {
      await fresh(h);
      rowTargets.push({ w, h: h || '(saldo)', ...(await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#railList .rrow')]
          .filter(e => e.getAttribute('role') === 'button');
        const hs = rows.map(e => +e.getBoundingClientRect().height.toFixed(1));
        return { n: rows.length, min: hs.length ? Math.min(...hs) : 0 };
      })) });
    }
  }
  ck('every rail row that activates is a ≥24 px target, 960–1600 px',
    rowTargets.length === 12 && rowTargets.every(r => r.n > 0 && r.min >= 24),
    JSON.stringify(rowTargets.filter(r => !r.n || r.min < 24)));
  await page.setViewport({ width: 1440, height: 900 });

  /* The whole of the measured CLS was one shift at the font swap (0,1038 of
     0,1038 — Lighthouse desktop scored 0,105 and named "Web font loaded" as the
     cause). This is that shift, measured directly and without a metric in the
     way: lay the page out with the woff2 blocked, lay it out again with them
     allowed, and diff the boxes that moved. It has to be zero, not small — the
     fallback faces exist to make the swap dimensionally invisible.
     Loading twice is also the only way to test them: with the real faces present
     the fallback is never used, so nothing else in this suite can see it. */
  const swapBox = `(() => { const b = s => { const e = document.querySelector(s);
      const r = e.getBoundingClientRect();
      return [+r.top.toFixed(1), +r.height.toFixed(1)]; };
    return { hd: b('header.hd'), main: b('main.main'), ft: b('.ft'), scrub: b('#scrubBox') }; })()`;
  /* 390 as well as 1350: the ≤560 block changes the type scale, and the swap was
     invisible only at the size the overrides were checked at. Measured at 390 the
     header lost 5 px, main and the map box 5, the footer 6 — the five .ctrl-lab
     line boxes each dropped a pixel, because `line-height: normal` derives the
     box from the font's own metrics and the metric-matched fallback only
     guarantees the advance. */
  const swap = {}, swapNarrow = {};
  for (const mode of ['fallback', 'real']) {
    const p2 = await watch(await browser.newPage(),
      mode === 'fallback' ? (u => u.endsWith('.woff2')) : null);
    await pinHr(p2);
    await p2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await p2.goto(url, { waitUntil: 'networkidle0' });
    await settle(600);
    swapNarrow[mode] = await p2.evaluate(swapBox);
    await p2.setViewport({ width: 1350, height: 940 });
    await p2.goto(url, { waitUntil: 'networkidle0' });
    await settle(600);
    swap[mode] = await p2.evaluate(swapBox);
    if (mode === 'real') {
      /* and the faces themselves, on strings the app actually sets in each of
         them. Asserted against the *unadjusted* system font rather than against
         a fixed tolerance: "closer than doing nothing" is the claim these faces
         make, and it cannot be satisfied by fitting the check to the fit. It is
         not a formality — Oswald fitted on caps+digits was 3,83 % out on the
         title where raw Arial Narrow was 1,88 %, i.e. the adjustment was making
         that string worse, and only this comparison says so. */
      swap.widths = await p2.evaluate(() => {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:-99999px;white-space:nowrap;line-height:normal';
        document.body.appendChild(el);
        const w = (f, wt, s) => { el.style.font = wt + ' 100px "' + f + '"'; el.textContent = s; return el.getBoundingClientRect().width; };
        const cases = [
          ['IBM Plex Sans', 'Arial', 400, 'Unutarnje i vanjske migracije + međužupanijski tokovi'],
          ['IBM Plex Sans', 'Arial', 600, 'Saldo Klasifikacija Regije'],
          ['IBM Plex Mono', 'Courier New', 400, 'DZS tab. 7.4.1.–7.4.3. · OpenStreetMap ODbL · CC BY 4.0'],
          ['Oswald', 'Arial Narrow', 600, 'MIGRACIJSKI ATLAS ŽUPANIJA'],
        ];
        const out = cases.map(([real, loc, wt, s]) => ({
          f: real + ' ' + wt,
          fb: +Math.abs(w(real + ' Fallback', wt, s) / w(real, wt, s) - 1).toFixed(4),
          raw: +Math.abs(w(loc, wt, s) / w(real, wt, s) - 1).toFixed(4),
        }));
        el.remove();
        return out;
      });
    }
    await p2.close();
  }
  const swapMoved = ['hd', 'main', 'ft', 'scrub'].map(k => ({ k,
    dTop: +(swap.real[k][0] - swap.fallback[k][0]).toFixed(1),
    dH: +(swap.real[k][1] - swap.fallback[k][1]).toFixed(1) }));
  const swapNarrowMoved = ['hd', 'main', 'ft', 'scrub'].map(k => ({ k,
    dTop: +(swapNarrow.real[k][0] - swapNarrow.fallback[k][0]).toFixed(1),
    dH: +(swapNarrow.real[k][1] - swapNarrow.fallback[k][1]).toFixed(1) }));
  ck('and it moves nothing at 390 px either, where the type scale changes',
    swapNarrowMoved.every(m => m.dTop === 0 && m.dH === 0),
    JSON.stringify(swapNarrowMoved.filter(m => m.dTop || m.dH)));
  ck('the font swap moves nothing: header, main, footer and scrubber are identical',
    swapMoved.length === 4 && swapMoved.every(m => m.dTop === 0 && m.dH === 0),
    JSON.stringify(swapMoved));
  ck('and each fallback face is closer to its webfont’s width than doing nothing',
    swap.widths.length === 4 && swap.widths.every(x => x.fb <= x.raw && x.fb < 0.02),
    JSON.stringify(swap.widths));

  /* ══ v2.2.0 — the second language ═══════════════════════════════════════
     The atlas is Croatian and stays Croatian by default; English exists so it
     can be shown to people who do not read Croatian. What is checked here is
     not "the words changed" but the three things that could quietly go wrong:
     the numbers, the honesty labels, and which reader gets which language. */

  /* Numbers are part of the translation, not decoration around it. Croatian
     writes 41.986 where English writes 41,986 — read as English, the Croatian
     form is wrong by three orders of magnitude, which is the single most
     dangerous thing an untranslated atlas can do. */
  await fresh('#l=en&v=saldo&c=1&y=2024');
  const en1 = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    top: document.querySelector('#railList .rrow .rname').textContent,
    val: document.querySelector('#railList .rrow .rval').textContent,
    label: document.querySelector('#railList .rrow').getAttribute('aria-label'),
    view0: document.querySelector('#segView button').textContent,
    pressed: document.querySelector('#segLang button[data-l="en"]').getAttribute('aria-pressed'),
  }));
  ck('English renders English separators, and says so in <html lang>',
    en1.lang === 'en' && en1.val === '+41,986' && en1.top === 'Grad Zagreb'
    && en1.view0 === 'Net' && en1.pressed === 'true',
    JSON.stringify(en1));
  /* 2.5.3 again, in the other language: rowName() feeds both halves, so if the
     separator rule survived translation this holds without further work. */
  ck('and the rail row label still contains its visible text',
    en1.label === 'Grad Zagreb +41,986', String(en1.label));

  /* County names are identifiers — they are what a reader checks against a DZS
     table — so they are NOT translated, in either direction. */
  ck('county names are left in Croatian, because they are identifiers',
    en1.top === 'Grad Zagreb', en1.top);

  /* The honesty labels are the load-bearing ones. A badge nobody can read is
     not a label — and the measured/estimate distinction has to keep its
     *visual* form too (solid vs dashed), which is keyed off the badge text. */
  await fresh('#l=en&v=mx&y=2018&c=0');
  await page.hover('.mxc[data-a="HR-21"][data-b="HR-01"]');
  await settle(220);
  const enBadge = await page.evaluate(() => {
    const tag = document.querySelector('#tip .cls-tag');
    return { txt: tag ? tag.textContent : null, cls: tag ? tag.className : null,
      border: tag ? getComputedStyle(tag).borderStyle : null,
      legend: document.querySelector('#legend .legend-note').textContent };
  });
  ck('the measured badge is in English and still solid, not dashed',
    enBadge.txt === 'measured' && /meas/.test(enBadge.cls) && enBadge.border === 'solid',
    JSON.stringify(enBadge));
  ck('and the English legend still names the source and the licence',
    /Measured/.test(enBadge.legend) && /Pitoski/.test(enBadge.legend) && /CC BY/.test(enBadge.legend),
    enBadge.legend.slice(0, 120));

  await fresh('#l=en&v=mx&y=2024&c=1');
  await page.hover('.mxc[data-a="HR-21"][data-b="HR-01"]');
  await settle(220);
  const enEst2 = await page.evaluate(() => {
    const tag = document.querySelector('#tip .cls-tag');
    return { txt: tag ? tag.textContent : null, border: tag ? getComputedStyle(tag).borderStyle : null };
  });
  ck('the cumulative estimate badge is English and still dashed',
    enEst2.txt === 'cumulative estimate' && enEst2.border === 'dashed',
    JSON.stringify(enEst2));


  /* The exported figure is the artifact that leaves the app: it must carry the
     honesty label, the source credit and the licence in the reader's language,
     because there is no footnote to click through to. */
  const enSvg = await page.evaluate(() => window.__exportSVG(false));
  ck('the English export carries its badge, sources and licence in English',
    /CUMULATIVE ESTIMATE/i.test(enSvg) && /Sources:/.test(enSvg)
    && /Figure: CC BY 4\.0/.test(enSvg) && !/Izvori:/.test(enSvg)
    /* the legend badge was a Croatian literal, so the title said CUMULATIVE
       ESTIMATE over a bar labelled "kumulativna procjena" */
    && !/izmjereno|kumulativna procjena|skala/.test(enSvg),
    (enSvg.match(/>[^<]{20,90}</g) || []).slice(0, 3).join(' | '));

  /* the JLS legend badge is the other half of the same literal */
  await fresh('#l=en&v=jmap&dir=net');
  const enJmapSvg = await page.evaluate(() => window.__exportSVG(false));
  ck('and an English JLS export badges itself in English too',
    /measured/.test(enJmapSvg) && /√ scale/.test(enJmapSvg)
    && !/izmjereno|skala/.test(enJmapSvg),
    (enJmapSvg.match(/·[^<]{4,40}</g) || []).slice(0, 3).join(' | '));

  /* ── Croatian year ordinals must not leak into English ──
     `2024.` is a Croatian ordinal and reads as a full stop in English; the study
     window was a module constant evaluated before setLang had run, so the
     headline paper-comparison note read "for 2011.–2024.." at its default
     state, and all 28 Godine column headers plus 588 cell labels carried the
     dot. Every year on screen goes through yr()/yrSpan() now. */
  await fresh('#l=en&v=klas&c=1&y=2024');
  const enKlas = await page.evaluate(() => document.querySelector('#legend .legend-note').textContent);
  await fresh('#l=en&v=yrs&f=int&c=0&y=2022');
  const enYrs = await page.evaluate(() => ({
    cols: [...document.querySelectorAll('#map text')].map(t => t.textContent).filter(t => /^\d{4}\.?$/.test(t)),
    cell: document.querySelector('.yrc').getAttribute('aria-label'),
  }));
  /* …and the same claim, swept, because the check below reads exactly three
     things: one `.legend-note`, the `#map text` runs in Godine, and the first
     `.yrc` label. The scrubber is `#spark`, not `#map`, so reverting either
     Scrubber tick (`{yrL(t)}`) or the 46 px `#bigYear` to `t + '.'` — the exact
     regression that block exists to catch — gives an English reader 28 Croatian
     ordinals across the timeline and one in the headline, with every check green.
     The tooltip, #card, #pairRow, the chip panels and the export band are in the
     same blind spot.
     Distinguishing an ordinal from an English sentence-final full stop is a
     judgement, so this only claims the unambiguous shapes: a year-dot followed by
     a separator, a digit or a lowercase word, and a run that is nothing but a
     year and a dot (a standalone year label never ends a sentence). Content
     marked lang="hr" and the paper's own citation are exempt by construction —
     "Maras i Vinovrški (2026.)" is printed, not translated. */
  const enOrd = [];
  for (const h of ['#l=en&v=saldo&c=1&y=2024&s=HR-18', '#l=en&v=klas&c=1&y=2024',
    '#l=en&v=yrs&f=int&c=0&y=2022', '#l=en&v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0',
    '#l=en&v=mx&y=2018&c=0&dir=net', '#l=en&v=reg&c=1&y=2024', '#l=en&cz=1', '#l=en&ag=1']) {
    await fresh(h);
    const bad = await page.evaluate(() => {
      const ORD = /\b(?:19|20)\d{2}\.(?=\s*[·–—,;:]|\s+[a-z]|\d)/;
      const BARE = /^(?:19|20)\d{2}\.$/;
      const isOrd = s => BARE.test(s.trim()) || ORD.test(s);
      const exempt = el => !!(el && el.closest && el.closest('[lang="hr"], .paper-link, .help-cite, noscript'));
      const out = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const s = (n.textContent || '').trim();
        if (!s || !isOrd(s) || exempt(n.parentElement)) continue;
        out.push('text «' + s.slice(0, 50) + '»');
      }
      for (const el of document.querySelectorAll('[aria-label],[title]')) {
        if (exempt(el)) continue;
        for (const a of ['aria-label', 'title']) {
          const v = el.getAttribute(a);
          if (v && isOrd(v)) out.push(a + ' «' + v.slice(0, 50) + '»');
        }
      }
      return out;
    });
    if (bad.length) enOrd.push(h + ' → ' + bad.slice(0, 2).join(' ; '));
  }
  ck('no Croatian year ordinal survives into English, anywhere on the page',
    enOrd.length === 0, enOrd.slice(0, 3).join(' | '));

  ck('no Croatian year ordinal survives into English',
    /for 2011–2024\. On the newer/.test(enKlas) && !/\d{4}\.\.|\d{4}\.–/.test(enKlas)
    && enYrs.cols.length >= 28 && enYrs.cols.every(t => !t.endsWith('.'))
    && !/\d{4}\./.test(enYrs.cell),
    JSON.stringify({ klas: enKlas.slice(0, 70), cols: enYrs.cols.slice(0, 3), cell: enYrs.cell }));

  /* ── the display minus is U+2212 in both languages ──
     in-cell matrix numbers are formatted straight from a signed value, and
     en-GB's Intl emits U+002D where hr-HR emits U+2212 */
  await page.setViewport({ width: 1920, height: 1200 });
  for (const l of ['hr', 'en']) {
    await fresh(`#l=${l}&v=mx&y=2018&c=0&dir=net`);
    const neg = await page.evaluate(() =>
      [...document.querySelectorAll('.mxnum')].map(t => t.textContent).filter(t => /[-−]/.test(t)));
    ck(`negative matrix numbers use U+2212, not an ASCII hyphen (${l})`,
      neg.length > 0 && neg.every(t => t.includes('−') && !t.includes('-')),
      JSON.stringify(neg.slice(0, 3)));
  }
  await page.setViewport({ width: 1440, height: 900 });

  /* The arc-dash and pair-badge encodings, in the other language. Both used to
     be keyed off a comparison against the Croatian literal 'izmjereno', so in
     English the one measured year drew with the atlas's own estimate mark: 20 of
     20 arcs dashed under a legend saying "Measured", and the corridor badge
     styled as an estimate. The Croatian twins of these run at :396 and :393. */
  await fresh('#l=en&v=flow&s=HR-21&dir=out&c=0&y=2018');
  const enArc = await page.evaluate(() => ({
    dash: [...document.querySelectorAll('.arc')].map(a => a.getAttribute('stroke-dasharray')),
    sub: document.querySelector('#bigYearSub').textContent,
  }));
  ck('the English measured year draws solid arcs, not the estimate dash',
    enArc.dash.length > 0 && enArc.dash.every(d => d === null) && /measured/.test(enArc.sub),
    JSON.stringify({ n: enArc.dash.length, d: enArc.dash[0], s: enArc.sub }));
  await click('#railList .rrow');
  const enPair = await page.evaluate(() => {
    const tg = document.querySelector('#pairRow .cls-tag');
    return { txt: tg ? tg.textContent : null, cls: tg ? tg.className : null,
      border: tg ? getComputedStyle(tg).borderStyle : null };
  });
  ck('and the English corridor badge is styled measured, not estimate',
    enPair.txt === 'measured' && /meas/.test(enPair.cls) && enPair.border === 'solid',
    JSON.stringify(enPair));
  await fresh('#l=en&v=flow&s=HR-21&dir=out&c=0&y=2017');
  const enArc2 = await page.evaluate(() =>
    [...document.querySelectorAll('.arc')].map(a => a.getAttribute('stroke-dasharray')));
  ck('and an English IPF year still dashes every arc',
    enArc2.length > 0 && enArc2.every(d => d === '7 4'), String(enArc2.length));

  /* ── every data feature's accessible name, in English ──
     #tip is aria-hidden by design, so these labels are the ONLY copy of their
     numbers for a screen reader — and 997 of them (556 .jl + 420 .mxc + 21 .mxd)
     were Croatian whatever the reader had chosen, with en-GB separators inside
     them. County and municipality names stay Croatian: they are identifiers a
     reader checks against a DZS table. Everything the atlas *says about* them
     has to move. One sweep per feature class, so the next surface that forgets
     is caught by the check rather than by a reader. */
  const CRO = /\b(doseljeno|odseljeno|neto|doseljeni|odseljeni|dijagonala|selidbe|županij\w*|godišnj\w*|vremensk\w*|prikaz\w*|zumiranj\w*|zatvori|reprodukcij\w*|koridor|nalaz)\b/i;
  await fresh('#l=en&v=jmap');
  const enJl = await page.evaluate(() => [...document.querySelectorAll('.jl')].map(p => p.getAttribute('aria-label') || ''));
  const jlBad = enJl.filter(s => CRO.test(s));
  ck('all 556 English municipality labels read in English',
    enJl.length === 556 && jlBad.length === 0 && enJl.every(s => / in, .* out, net /.test(NBSP(s))),
    JSON.stringify({ n: enJl.length, bad: jlBad.slice(0, 2), first: enJl[0] }));

  await fresh('#l=en&v=mx&c=0&y=2018&dir=net');
  const enMx = await page.evaluate(() => ({
    c: [...document.querySelectorAll('.mxc')].map(p => p.getAttribute('aria-label') || ''),
    d: [...document.querySelectorAll('.mxd')].map(p => p.getAttribute('aria-label') || ''),
  }));
  const mxBad = [...enMx.c, ...enMx.d].filter(s => CRO.test(s));
  ck('all 420 English matrix cells and 21 diagonals read in English',
    enMx.c.length === 420 && enMx.d.length === 21 && mxBad.length === 0
    && / ↔ .*: net /.test(NBSP(enMx.c[0])) && / — diagonal: /.test(enMx.d[0]),
    JSON.stringify({ c: enMx.c.length, d: enMx.d.length, bad: mxBad.slice(0, 2) }));

  /* the primary controls: the year slider, the play button, the mobile handle
     and the zoom reset — whose title was translated while its accessible name
     was not, so one control said two things in two languages */
  await fresh('#l=en&v=saldo&c=1&y=2024');
  await page.keyboard.press('+');
  await settle(200);
  const enCtl = await page.evaluate(() => {
    const g = (sel, at) => { const e = document.querySelector(sel); return e ? (e.getAttribute(at) || '') : null; };
    return { spark: g('#spark', 'aria-label'), play: g('#play', 'aria-label'), playT: g('#play', 'title'),
      tog: g('#scrubTog', 'aria-label'), zoom: g('#zoomRst', 'aria-label'), zoomT: g('#zoomRst', 'title'),
      zoomTxt: (document.querySelector('#zoomRst') || {}).textContent };
  });
  /* A blacklist alone cannot tell "named in English" from "not named at all".
     The probe returns '' for a missing attribute and null for a missing element,
     and CRO.test('') is false while CRO.test(null) tests the string "null" — also
     false — so `!CRO.test(...)` was TRUE for both. Delete aria-label from #play,
     an icon-only button a screen reader then announces as a bare "button", or
     rename any of these four ids, and this printed ok under a name claiming the
     controls "name themselves in English". Require a real name first, then that
     it is not Croatian. */
  const hasName = s => typeof s === 'string' && s.trim().length > 3;
  ck('the year slider, play, timeline handle and zoom reset all name themselves in English',
    [enCtl.spark, enCtl.play, enCtl.playT, enCtl.tog, enCtl.zoom, enCtl.zoomT].every(hasName)
    && ![enCtl.spark, enCtl.play, enCtl.playT, enCtl.tog, enCtl.zoom, enCtl.zoomT].some(s => CRO.test(s))
    && enCtl.zoom.startsWith(enCtl.zoomT) && /1\.6×/.test(NBSP(enCtl.zoomTxt)),
    JSON.stringify(enCtl));

  /* ── the panels' own visible copy ──
     Scope limits (2018-only, 2025-only, the scrubber-does-not-apply notes) and
     the identity-sum caveat are the load-bearing kind: unreadable, they are not
     weak labels but unlabelled claims. Each panel is opened and read, so the
     next one that forgets is caught here. */
  const enText = async (hash, sel) => {
    await fresh(hash);
    return page.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
  };
  const enScope = {
    clamp: await enText('#l=en&v=saldo&cz=1&y=2015', '#citzClamp'),
    fixed: await enText('#l=en&v=saldo&cz=2&y=2024', '#zemFixed'),
    age: await enText('#l=en&v=saldo&ag=1&y=2024', '#ageNote'),
    jcap: await enText('#l=en&v=flow&s=HR-21&c=0&y=2018&jl=1', '#jcardCap'),
  };
  ck('every English panel states its own scope in English',
    Object.values(enScope).every(s => s && !CRO.test(s))
    && /outside the published range/.test(enScope.clamp) && /Fixed at 2025/.test(enScope.fixed)
    && /published for 2025 only/.test(enScope.age) && / · 2018 · measured$/.test(NBSP(enScope.jcap)),
    JSON.stringify(enScope));

  const enNote = {
    card: await enText('#l=en&v=saldo&f=all&c=1&y=2024&s=HR-18', '#cardNote'),
    flow: await enText('#l=en&v=flow&s=HR-21&c=0&y=2018', '.rail-hint'),
    mx: await enText('#l=en&v=mx&c=0&y=2018&dir=out', '.rail-hint'),
    pair: await enText('#l=en&v=flow&s=HR-21&pp=HR-01&c=0&y=2018', '.pair-note'),
  };
  ck('and the identity-sum caveat, both rail hints and the measured-year note read in English',
    Object.values(enNote).every(s => s && !CRO.test(s))
    && /not total population change/.test(enNote.card) && /clicking the map/.test(enNote.flow)
    && /someone’s departure/.test(enNote.mx) && /only year with a measured flow matrix/.test(enNote.pair),
    JSON.stringify(enNote));

  /* Who gets which language, on a fresh visit with nothing shared and nothing
     stored. Two signals — the browser's language list and where the reader is —
     and a reader needs only one of them to point at Croatian.
     Both are pinned per page: `emulateTimezone` because the machine running the
     suite has a timezone of its own, and on a Croatian one every case below
     would pass for the wrong reason. */
  const bootLang = async (tags, tz, stored) => {
    const pg = await watch(await browser.newPage());
    await pg.emulateTimezone(tz);
    await pg.evaluateOnNewDocument((t, st) => {
      Object.defineProperty(navigator, 'languages', { get: () => t, configurable: true });
      Object.defineProperty(navigator, 'language', { get: () => t[0], configurable: true });
      /* runs before any page script, so the app's module init sees it */
      try { if (st) localStorage.setItem('atlas-lang', st); else localStorage.removeItem('atlas-lang'); }
      catch { /* opaque origin on the initial about:blank */ }
    }, tags, stored || '');
    await pg.goto(url, { waitUntil: 'networkidle0' });
    await settle(250);
    const r = await pg.evaluate(() => ({ l: document.documentElement.lang, hash: location.hash }));
    await pg.close();
    return r;
  };

  /* Signal 1, with the reader pinned OUTSIDE the region so the language list is
     what decides. Croatian is the default for the languages that read it — a
     Serbian or Bosnian reader is far better served by Croatian than by English —
     and English is the fallback for everyone else. */
  const detect = [];
  for (const tags of [['hr-HR', 'hr'], ['sr-Latn-RS', 'sr'], ['bs-BA'], ['de-DE', 'de'], ['en-GB']]) {
    detect.push({ t: tags[0], ...await bootLang(tags, 'Europe/Berlin') });
  }
  ck('hr/sr/bs readers get Croatian, everyone else English, with no l= in the link',
    detect[0].l === 'hr' && detect[1].l === 'hr' && detect[2].l === 'hr'
    && detect[3].l === 'en' && detect[4].l === 'en',
    JSON.stringify(detect));

  /* Signal 2: WHERE the reader is. A browser set to English or German inside
     Croatia is extremely ordinary — it is what a great many machines in the
     region ship as — and the atlas is Croatian by default, so answering such a
     reader in English because of a setting they may never have chosen gets the
     common case backwards. The signal is the device's own timezone, plus any
     region subtag the reader's own language tags carry (`en-HR`); it is not an
     IP lookup, because an IP lookup needs a third-party host this app must not
     reach or a server round trip, and either answer arrives after the first
     paint — one frame in which 41.986 means forty-one.
     …and the region deciding the default must NOT put `l=` in the link: it is
     still the reader's own default, and a link carrying it would force Croatian
     on whoever it was sent to. */
  const inRegion = [
    { t: ['de-DE', 'de'], tz: 'Europe/Zagreb', why: 'German browser, in Croatia' },
    { t: ['en-US', 'en'], tz: 'Europe/Zagreb', why: 'English browser, in Croatia' },
    { t: ['fr-FR'], tz: 'Europe/Sarajevo', why: 'French browser, in BiH' },
    { t: ['it-IT'], tz: 'Europe/Podgorica', why: 'Italian browser, in Montenegro' },
    /* the region subtag alone, with the timezone saying otherwise */
    { t: ['en-HR'], tz: 'America/New_York', why: 'en-HR abroad' },
  ];
  const inR = [];
  for (const c of inRegion) inR.push({ why: c.why, ...await bootLang(c.t, c.tz) });
  ck('a reader in the region gets Croatian whatever their browser asks for, and the link stays neutral',
    inR.every(r => r.l === 'hr' && !/l=/.test(r.hash)),
    JSON.stringify(inR));

  /* The converse, so the region signal cannot be the *only* thing deciding:
     outside it the language list still answers, in both directions. */
  const outRegion = [
    { t: ['hr-HR', 'hr'], tz: 'America/New_York', want: 'hr', why: 'Croatian browser abroad' },
    { t: ['sr-Latn-RS'], tz: 'Australia/Sydney', want: 'hr', why: 'Serbian browser abroad' },
    { t: ['en-GB', 'en'], tz: 'Europe/London', want: 'en', why: 'English browser in the UK' },
    { t: ['ja-JP'], tz: 'Asia/Tokyo', want: 'en', why: 'neither signal' },
  ];
  const outR = [];
  for (const c of outRegion) outR.push({ why: c.why, want: c.want, ...await bootLang(c.t, c.tz) });
  ck('and outside the region the browser language still decides, both ways',
    outR.every(r => r.l === r.want), JSON.stringify(outR));

  /* An explicit act beats an inference, always. A reader sitting in Zagreb who
     once pressed EN gets English on the next visit — the region must not
     silently undo the one signal that is not a guess. */
  const stored = await bootLang(['hr-HR', 'hr'], 'Europe/Zagreb', 'en');
  ck('a stored choice still outranks both signals, and is that reader’s own default',
    /* no l= either: BASE.lang resolves from the stored choice, so English *is*
       this reader's default and a link they share must not force it on anyone */
    stored.l === 'en' && !/l=/.test(stored.hash), JSON.stringify(stored));

  /* A shared link outranks both the browser and the stored choice: a link sent
     in English has to arrive in English, or the sender cannot show anyone
     anything. And a link with no l= stays language-neutral, so the same URL
     serves both readers. */
  /* fresh(), not goto(): the previous navigation was to the same document, so
     this was a fragment change — which never re-runs module init, and this check
     is about a BOOT property. It could not have failed on a boot-path
     regression, which is the class it exists to catch (the helper exists for
     exactly this reason). */
  await fresh('#v=saldo&c=1&y=2024&l=en');
  const sharedEn = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    val: document.querySelector('#railList .rrow .rval').textContent,
  }));
  ck('a link carrying l=en opens in English on a Croatian browser',
    sharedEn.lang === 'en' && sharedEn.val === '+41,986',
    JSON.stringify(sharedEn));
  await fresh('');
  const neutral = await page.evaluate(() => location.hash);
  ck('and a link at the reader’s own default carries no l= at all',
    !/l=/.test(neutral), neutral);

  /* ══ v2.3.0 — the English title names the country ═══════════════════════
     "Migracijski atlas županija" reaches a reader who already knows whose
     counties these are. "County Migration Atlas" does not: English exists here
     so the atlas can be shown to people outside that context, and "county" is a
     unit forty countries use. The country is therefore stated in English, on
     every surface the title reaches — and on none of them in Croatian, where it
     would be noise. */
  await fresh('#v=saldo&c=1&y=2024');
  const hrTitle = await page.evaluate(() => ({ h1: document.querySelector('.hd-title').textContent, doc: document.title }));
  await fresh('#l=en&v=saldo&c=1&y=2024');
  const enTitle = await page.evaluate(() => ({ h1: document.querySelector('.hd-title').textContent, doc: document.title }));
  ck('the English title names the country and the Croatian one does not',
    enTitle.h1 === 'County Migration Atlas (CROATIA)' && hrTitle.h1 === 'Migracijski atlas županija',
    JSON.stringify({ en: enTitle.h1, hr: hrTitle.h1 }));
  /* index.html's <title> is static markup, parsed before the language is known,
     so it ships Croatian and App corrects it. The Croatian half of this is what
     proves the correction did not simply leave the static string in place. */
  ck('and the tab title follows the language, keeping the period either way',
    enTitle.doc === 'County Migration Atlas (CROATIA) · 1998–2025'
    && hrTitle.doc === 'Migracijski atlas županija · 1998.–2025.',
    JSON.stringify({ en: enTitle.doc, hr: hrTitle.doc }));

  /* The exported figure is where the country matters most: it leaves the app
     with no page around it to say which counties these are. The eyebrow was the
     last run in the band still hardcoded in Croatian — an English export carried
     "MIGRACIJSKI ATLAS ŽUPANIJA · DZS" over an otherwise English document. */
  const eyebrowOf = doc => (doc.match(/<text[^>]*y="26"[^>]*>([^<]*)</) || [])[1] || '';
  const enBand = await page.evaluate(() => window.__exportSVG(false));
  await fresh('#v=saldo&c=1&y=2024');
  const hrBand = await page.evaluate(() => window.__exportSVG(false));
  ck('both export formats carry the atlas name in the reader’s language',
    eyebrowOf(enBand) === 'COUNTY MIGRATION ATLAS (CROATIA) · CBS · 1998–2025'
    && eyebrowOf(hrBand) === 'MIGRACIJSKI ATLAS ŽUPANIJA · DZS · 1998.–2025.',
    JSON.stringify([eyebrowOf(enBand), eyebrowOf(hrBand)]));

  /* …and it is *fitted*, like every other run in the band. It was drawn at a
     fixed 10 px and never measured, which was invisible only because Croatian
     happens to fit at every width the suite exercises. English is four
     characters longer and needs to shrink at 390 px. Asserted in both
     directions, so a fit that silently stopped firing would fail too. */
  const eyeFs = async (w, hash) => {
    await page.setViewport({ width: w, height: 900 });
    await fresh(hash);
    return page.evaluate(() => {
      const m = window.__exportSVG(false).match(/<text[^>]*y="26"[^>]*font-size="([\d.]+)"/);
      return m ? +m[1] : 0;
    });
  };
  const eyeWide = await eyeFs(1440, '#l=en&v=klas');
  const eyeNarrow = await eyeFs(390, '#l=en&v=klas');
  const eyeNarrowHr = await eyeFs(390, '#v=klas');
  await page.setViewport({ width: 1440, height: 900 });
  ck('the export eyebrow shrinks to fit a narrow canvas instead of running off it',
    eyeWide === 10 && eyeNarrow < 10 && eyeNarrow >= 7 && eyeNarrowHr === 10,
    JSON.stringify({ en1440: eyeWide, en390: eyeNarrow, hr390: eyeNarrowHr }));

  /* ══ v2.3.0 — the controls hold still ══════════════════════════════════
     Reported by a user as "the buttons jump around when you click them, and as
     they change — when some are removed or appear, or get narrower or wider".
     Three separate causes, each measured before being touched:

       1. `aria-pressed` adds font-weight:500, which is 0,4–2,3 px wider per
          label. The pressed button grew, its neighbours in the group slid, the
          group's own width changed and every control after it moved — 1,2 px
          under the pointer on a plain click, 1,6 px across four groups on a view
          change.
       2. Prag and Smjer sat mid-row and only exist in some views, so appearing
          pushed everything after them along: Izvoz moved 255 px sideways at 1280
          and 1024, and at 1440 wrapped onto a new row — 1.024 px left, 54 px
          down.
       3. The two titles are different widths and the language switch is the next
          flex item, so pressing EN moved the button that had just been pressed
          by 33 px.

     All three are asserted as *outcomes* — nothing may move — rather than by
     looking for the ghosts that fix them, so a different fix would pass and a
     regression could not. */
  const CTRL_SNAP = `(() => {
    const out = {};
    /* document coordinates, not viewport ones: below 900 px the body scrolls and
       page.click() scrolls its target into view, which would move every rect in
       the "after" snapshot and read as a layout shift that never happened */
    /* getBoundingClientRect() on a display:none element returns all zeros rather
       than nothing, so a group that APPEARS would read as one that moved from
       the origin. getClientRects().length is the same is-this-rendered-at-all
       test focusSoon uses. (No backticks in here: this whole snapshot is itself
       a template literal.) */
    const rec = (k, el) => { if (!el || !el.getClientRects().length) return; const r = el.getBoundingClientRect();
      out[k] = [Math.round((r.x + scrollX) * 10) / 10, Math.round((r.y + scrollY) * 10) / 10,
        Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10].join(','); };
    document.querySelectorAll('.ctrls .seg button').forEach(b =>
      rec('btn:' + b.closest('.seg').id + '/' + (b.dataset.v || b.dataset.l || b.id), b));
    document.querySelectorAll('.ctrls .ctrl').forEach(c => {
      if (c.offsetParent) rec('ctrl:' + (c.id || c.querySelector('.ctrl-lab').textContent), c); });
    rec('h1', document.querySelector('.hd-title'));
    rec('segLang', document.querySelector('#segLang'));
    return out;
  })()`;
  /* only what is on screen in BOTH states: a group that appears is the thing
     being allowed, a group that moves is the thing being forbidden */
  const movedBetween = (a, b) => Object.keys(a).filter(k => k in b && a[k] !== b[k]).map(k => k + ' ' + a[k] + ' -> ' + b[k]);

  const pressMoves = [], viewMoves = [];
  /* 390 is in the sweep because the narrow layout is a different mechanism, not
     a narrower version of the same one: below 560 px .ctrls is a two-column grid
     with `grid-auto-flow: row dense`, and `dense` backfilled the leftover cell
     with whichever narrow group happened to be available — which depended on
     whether Prag or Smjer was mounted. Measured: Izvoz sat beside Vrijeme in
     Saldo and moved to a row of its own in Klasifikacija. */
  /* 1600 and 1150 were absent and both have defect history — the 901–1150
     collision band, and the 1440 Izvoz wrap. */
  /* 2560 and 2048 are here because every width above it was measured on a
     laptop. .hd is `justify-content:space-between` and wraps, so between 2016
     and 2048 px — measured, not derived — .ctrls stops fitting beside the
     identity block and takes a line of its own, left-aligned. That is the only
     reason every width in the list above holds still, and it is why a sweep
     that stopped at 1600 was green while the header slid about on any monitor
     wider than 1080p: sharing the line pins .ctrls to the RIGHT edge, so a
     group that appears translates every control already on the row. Measured at
     2560 before the fix, Saldo → Klasifikacija moved 29 controls 255,6 px
     (#segView saldo 1289 → 1033,4) and Saldo → Tokovi/Matrica/JLS moved the
     same 29 by 151,4 px.
     2048 rather than a rounder number because it is the worse case: Saldo shared
     the line from 2017 px and Klasifikacija only from 2273, so anywhere between
     the two the row hopped a whole line on a view change — at 2048, 32 controls
     went 617 px left and 60 px down (#segView saldo 777,43 → 160,103) and took
     the header height 80 → 140 with them. Nine widths, as documented. */
  for (const W of [2560, 2048, 1600, 1440, 1280, 1150, 1024, 960, 390]) {
    await page.setViewport(W === 390
      ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
      : { width: W, height: 900 });
    /* (1) a press inside a live group, which changes nothing but the press */
    for (const [grp, v, hash] of [['segFlow', 'int', ''], ['segDen', 'rel11', ''], ['segMode', 'yr', ''],
      ['segDir', 'out', '#v=flow&s=HR-21']]) {
      await fresh(hash);
      const before = await page.evaluate(CTRL_SNAP);
      await click(`#${grp} button[data-v="${v}"]`);
      const moved = movedBetween(before, await page.evaluate(CTRL_SNAP));
      if (moved.length) pressMoves.push(`${W}px ${grp}=${v}: ` + moved.join(' | '));
    }
    /* (2) a view change, which adds or removes a whole group. JLS is in the
       list because it is the only one that swaps a group both ways — #thrBox
       out, #dirBox in — rather than only adding one, and measured at 2560 and
       2048 before the fix it moved 25 controls that neither of the other six
       reached in that shape. */
    for (const v of ['klas', 'reg', 'yrs', 'flow', 'mx', 'jmap']) {
      await fresh('');
      const before = await page.evaluate(CTRL_SNAP);
      await click(`#segView button[data-v="${v}"]`);
      await settle(150);
      const moved = movedBetween(before, await page.evaluate(CTRL_SNAP));
      if (moved.length) viewMoves.push(`${W}px saldo→${v}: ` + moved.join(' | '));
    }
  }
  ck('pressing a control moves nothing, 2560 down to 390',
    pressMoves.length === 0, pressMoves.slice(0, 3).join('  ;  ').slice(0, 300));
  ck('and a view change moves no control that survives it — the optional group only appears',
    viewMoves.length === 0, viewMoves.slice(0, 3).join('  ;  ').slice(0, 300));

  /* The switch must not move out from under the pointer that just pressed it.
     Measured against the *other* language's layout, not against a tolerance. */
  await page.setViewport({ width: 1440, height: 900 });
  await fresh('');
  const hrHd = await page.evaluate(CTRL_SNAP);
  await fresh('#l=en');
  const enHd = await page.evaluate(CTRL_SNAP);
  ck('the language switch and the title occupy the same box in both languages',
    hrHd.h1 === enHd.h1 && hrHd.segLang === enHd.segLang,
    JSON.stringify({ hr: [hrHd.h1, hrHd.segLang], en: [enHd.h1, enHd.segLang] }));

  /* The export button reads PNG, then "…", then "greška": three strings in one
     box, and the box used to be sized by whichever was showing. Measured by
     substituting each string, because that is exactly the question — the width
     is the stylesheet's job, not the component's. */
  await fresh('');
  const expStates = await page.evaluate(() => {
    const g = document.querySelector('#segExp'), b = document.querySelector('#pngBtn');
    const probe = t => { const old = b.textContent; b.textContent = t;
      const r = [g.getBoundingClientRect().width, b.getBoundingClientRect().width].join(',');
      b.textContent = old; return r; };
    return { PNG: probe('PNG'), busy: probe('…'), err: probe('greška') };
  });
  ck('the export group holds its width through PNG, “…” and “greška”',
    expStates.PNG === expStates.busy && expStates.busy === expStates.err,
    JSON.stringify(expStates));

  /* The reservation is a duplicate of the label, so the one way it could go
     wrong is by being announced: "Saldo Saldo". visibility:hidden is what keeps
     it out of the accessibility tree, and opacity:0 would not have. */
  const axNames = await (async () => {
    const snap = await page.accessibility.snapshot();
    const out = [];
    (function walk(n) { if (!n) return; if (n.role === 'button') out.push(n.name); (n.children || []).forEach(walk); })(snap);
    return out;
  })();
  const labels = await page.evaluate(() => [...document.querySelectorAll('#segView button')].map(b => b.textContent));
  ck('the reserved width is not announced: every segment button keeps its own name',
    labels.length === 7 && labels.every(l => axNames.includes(l))
    && !axNames.some(n => n && /^(.+)\1$/.test(n)),
    JSON.stringify({ missing: labels.filter(l => !axNames.includes(l)), doubled: axNames.filter(n => n && /^(.+)\1$/.test(n)) }));

  /* ── the same invariant, for the controls the .ctrls snapshot cannot reach ──
     CTRL_SNAP above covers the header and nothing else, so every control that
     lives over the map, in the timeline bar or inside a chip panel was measured
     by nobody. Measured, three of them moved on their own state change:

       1. The chip dock is anchored to the map's bottom edge, so an opening
          panel took its height off the top of the stack: clicking Državljanstvo
          moved *its own header* 354 px up out from under the pointer (672 →
          317,7) and Dob i spol with it (637 → 282,7), at 1440, 1024 and 390.
       2. Inside an open panel, pressing a tab moved that tab — the body's
          height changes with the tab, and a bottom-anchored body moves its own
          top edge when it does. 15 px on Dob i spol, 3,3 px on Državljanstvo.
       3. Collapsing the timeline moved the play button 48 px down and halved it
          (8,740,48,96 → 8,788,48,48): the bar's bottom edge is pinned to the
          viewport, its top is not, and the button was stretching between them.

     Asserted as outcomes — nothing may move — rather than by looking for the
     rules that fix them, so a different fix would still pass and a regression
     could not. Same rec() contract as CTRL_SNAP: document coordinates, and
     anything not rendered is left out rather than reported at the origin. */
  const MAP_SNAP = `(() => {
    const out = {};
    const rec = (k, el) => { if (!el || !el.getClientRects().length) return; const r = el.getBoundingClientRect();
      out[k] = [Math.round((r.x + scrollX) * 10) / 10, Math.round((r.y + scrollY) * 10) / 10,
        Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10].join(','); };
    for (const s of ['#helpBtn', '#labBtn', '#zoomRst', '#play', '#scrubTog',
      '#cardX', '#storyX', '#resetBtn', '#citzHd', '#ageHd', '#jlsHd', '#pngBtn', '#svgBtn'])
      rec(s, document.querySelector(s));
    document.querySelectorAll('.jtabs button').forEach((b, i) => rec('tab' + i + '/' + (b.dataset.v || ''), b));
    return out;
  })()`;
  const chipMoves = [];
  for (const W of [1440, 1024]) {
    await page.setViewport({ width: W, height: 900 });
    /* (1) opening a panel, and closing it again */
    for (const hd of ['#citzHd', '#ageHd']) {
      await fresh('');
      const before = await page.evaluate(MAP_SNAP);
      await click(hd); await settle(200);
      let m = movedBetween(before, await page.evaluate(MAP_SNAP));
      if (m.length) chipMoves.push(`${W}px open ${hd}: ` + m.join(' | '));
      await click(hd); await settle(200);
      m = movedBetween(before, await page.evaluate(MAP_SNAP));
      if (m.length) chipMoves.push(`${W}px reclose ${hd}: ` + m.join(' | '));
    }
    /* (2) pressing a tab inside an open panel */
    for (const [hd, tab] of [['#citzHd', '.citz .jtabs button[data-v="zem"]'],
      ['#ageHd', '.agec .jtabs button[data-v="int"]']]) {
      await fresh('');
      await click(hd); await settle(250);
      const before = await page.evaluate(MAP_SNAP);
      await click(tab); await settle(250);
      const m = movedBetween(before, await page.evaluate(MAP_SNAP));
      if (m.length) chipMoves.push(`${W}px tab ${tab}: ` + m.join(' | '));
    }
  }
  ck('opening a chip panel, closing it, and switching its tab move no control at all',
    chipMoves.length === 0, chipMoves.slice(0, 3).join('  ;  ').slice(0, 300));

  /* The play button is the one control that must stay under the thumb while the
     timeline folds away — it is how playback is stopped. */
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await fresh('');
  const playBefore = await page.evaluate(() => { const r = document.querySelector('#play').getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10) / 10).join(','); });
  await click('#scrubTog'); await settle(300);
  const playAfter = await page.evaluate(() => { const r = document.querySelector('#play').getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10) / 10).join(','); });
  ck('collapsing the timeline leaves the play button exactly where it was',
    playBefore === playAfter, JSON.stringify({ open: playBefore, collapsed: playAfter }));

  /* PNG and SVG read the same in both languages, so the visible label never
     changes — but the *reserved* state did ("greška" against "error"), and a
     ghost is what sets these boxes. Measured before the fix: 47,7 → 38,1 and
     46,7 → 37,1, i.e. two buttons resizing on a switch that renames neither. */
  await page.setViewport({ width: 1440, height: 900 });
  const expBox = async h => { await fresh(h); return page.evaluate(() =>
    ['#pngBtn', '#svgBtn'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().width * 10) / 10).join(',')); };
  const expHr = await expBox(''), expEn = await expBox('#l=en');
  ck('the export pair keeps its box across a language switch that renames neither button',
    expHr === expEn, JSON.stringify({ hr: expHr, en: expEn }));

  /* ── and the same view change, on a monitor wider than 1080p ──
     The sweep above measures .ctrls, which is the header. Everything anchored
     to the map below it moves when the *header* changes height, and a view
     change is what changes it: the control row grows a line, the header grows
     54 px, and #helpBtn, #labBtn and the chip headers all drop by it. That is
     the real behaviour at 1440 — the row genuinely needs a second line for Prag
     there and no reserve is being proposed for it — so this is asserted only at
     the widths this pass is about, where the row fits on one line in every view
     and therefore nothing may move at all. It is 2048 that earns this check:
     there the row used to hop between the shared header line and its own on a
     view change, which took the header 80 → 140 and dropped #helpBtn, #labBtn
     and both chip headers 60 px with it. At 2560 the header was always one line
     and these never moved — that width is here to keep it that way.
     MAP_SNAP rather than CTRL_SNAP, because the header controls are already
     covered above and these are the ones that were not. */
  const wideMoves = [];
  /* 2272 is the top of the band and the worst case in the whole defect: the
     Klasifikacija threshold is 2273, so at 2272 Saldo shared the identity
     block's line and Klasifikacija did not. */
  for (const W of [2560, 2272, 2048]) {
    await page.setViewport({ width: W, height: 1080 });
    for (const v of ['klas', 'reg', 'yrs', 'flow', 'mx', 'jmap']) {
      await fresh('');
      const before = await page.evaluate(MAP_SNAP);
      await click(`#segView button[data-v="${v}"]`);
      await settle(200);
      const m = movedBetween(before, await page.evaluate(MAP_SNAP));
      if (m.length) wideMoves.push(`${W}px saldo→${v}: ` + m.join(' | '));
    }
  }
  ck('a view change on a monitor wider than 1080p moves no control over the map either',
    wideMoves.length === 0, wideMoves.slice(0, 3).join('  ;  ').slice(0, 300));

  /* ── and in the direction a reader actually travels ──
     Every no-move sweep in this file starts from a fresh Saldo, so all of them
     have only ever measured a group APPEARING. The largest movement the defect
     ever produced was one LEAVING: at 2272, Klasifikacija → Saldo took #segView
     saldo from 160,103,42,25 to 1001,43,42,25 — 841 px sideways and 60 px up in
     a single click, because the row stopped needing its own header line and
     jumped back onto the identity block's, where space-between re-pinned it to
     the right edge. movedBetween already drops anything not rendered in both
     states, so the group that leaves is not the claim; everything that stays is.
     Klasifikacija ↔ JLS is the third case neither direction reaches on its own:
     a swap, #thrBox (245,6 px) out and #dirBox (141,4 px) in, which moved every
     control 104,2 px at 2560 with nothing appearing or disappearing that a
     reader could see.
     English is here because the thresholds are the *content's*, not the
     layout's, and English is 15 px narrower in the identity block and ~10 px in
     the row: it shared the line from 1992 px where Croatian needed 2017, so a
     Croatian-only sweep is blind to a 25 px band — and 1992 is only 72 px above
     the 1920 the suite already uses for two matrix checks. */
  const hopMoves = [];
  for (const [W, pre] of [[2560, ''], [2272, ''], [2048, ''], [2048, 'l=en&'], [1992, 'l=en&']]) {
    await page.setViewport({ width: W, height: 1080 });
    for (const [from, to] of [['klas', 'saldo'], ['flow', 'saldo'], ['saldo', 'klas'],
      ['klas', 'jmap'], ['jmap', 'klas']]) {
      await fresh('#' + pre + 'v=' + from);
      const before = await page.evaluate(CTRL_SNAP);
      await click(`#segView button[data-v="${to}"]`);
      await settle(200);
      const m = movedBetween(before, await page.evaluate(CTRL_SNAP));
      if (m.length) hopMoves.push(`${W}px ${pre ? 'en ' : ''}${from}→${to}: ` + m.join(' | '));
    }
  }
  ck('and a group leaving or being swapped moves no control either, 1992 to 2560, in both languages',
    hopMoves.length === 0, hopMoves.slice(0, 3).join('  ;  ').slice(0, 300));
  await page.setViewport({ width: 1440, height: 900 });


  /* ══════════════════ v2.3.2 — audit pass ══════════════════ */

  /* ── M-4: Back must not discard an explicit stored language choice ──
     BASE.lang is resolved once at module init, and the popstate handler folded
     BASE back in — so Back to an entry written before the toggle reverted the
     language while localStorage still said otherwise, and reloading that same
     URL booted the other one. One URL, two languages, by arrival route. */
  const backLang = await (async () => {
    const pg = await watch(await browser.newPage());
    await pg.emulateTimezone('Europe/Zagreb');
    await pg.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'languages', { get: () => ['hr-HR', 'hr'], configurable: true });
      Object.defineProperty(navigator, 'language', { get: () => 'hr-HR', configurable: true });
      try { localStorage.removeItem('atlas-lang'); } catch { /* opaque origin */ }
    });
    await pg.goto(url + '#v=saldo&c=1&y=2024', { waitUntil: 'networkidle0' });
    await settle(300);
    await pg.click('#segView button[data-v="klas"]');   /* pushes a history entry */
    await settle(300);
    await pg.click('#segLang button[data-l="en"]');     /* stored; replaces this entry */
    await settle(300);
    await pg.goBack();                                  /* back to the pre-toggle entry */
    await settle(400);
    const r = await pg.evaluate(() => ({ lang: document.documentElement.lang,
      stored: localStorage.getItem('atlas-lang'), hash: location.hash,
      pressed: document.querySelector('#segLang button[aria-pressed="true"]').dataset.l }));
    await pg.close();
    return r;
  })();
  ck('Back keeps the language choice the reader has stored',
    backLang.stored === 'en' && backLang.lang === 'en' && backLang.pressed === 'en',
    JSON.stringify(backLang));

  /* ── M-5: a defensive key must not make a caption panel-sensitive ──
     `sel` is in STORY_KEYS and twelve presets carried a defensive `sel: null`,
     so opening a county card killed a caption whose claim the card changes
     nothing about: pick Nalaz 2, click the top rail row, and the rail is
     byte-identical before and after while #storyCap is gone. */
  await fresh('');
  const selKeep = await page.evaluate(async () => {
    const sel = document.querySelector('#story');
    sel.value = '1';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    const before = document.querySelector('#railList').textContent;
    document.querySelector('#railList .rrow').click();
    await new Promise(r => setTimeout(r, 350));
    return { cap: !!document.querySelector('#storyCap'), card: !!document.querySelector('#cardName'),
      same: before === document.querySelector('#railList').textContent };
  });
  ck('opening a county card keeps a caption that claims nothing about one',
    selKeep.cap && selKeep.card && selKeep.same, JSON.stringify(selKeep));

  /* ── M-6: the region half of the geometry failure machinery ──
     regFailed() had zero importers, so a failed geo_regions5.json left Regije
     drawing county tints with no outlines, no message and no retry — and the
     five outlines were counted nowhere, so a build drawing zero of them passed
     every check. */
  await fresh('#v=reg&c=1&y=2024');
  await page.waitForFunction(() => document.querySelectorAll('.regline').length === 5, { timeout: 15000 })
    .catch(() => {});
  const regLines = await page.evaluate(() => document.querySelectorAll('.regline').length);
  ck('Regije draws all five region outlines', regLines === 5, String(regLines));
  blockGeoChunk = 'reg';
  await page.goto('about:blank');
  await page.goto(url + '#v=reg&c=1&y=2024', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#jerror'), { timeout: 15000 })
    .catch(() => {});
  const regFail = await page.evaluate(() => {
    const st = document.querySelector('#jstatus');
    return { err: (document.querySelector('#jerror') || {}).textContent || null,
      retry: !!document.querySelector('#jretry'),
      live: st ? st.getAttribute('role') : null,
      lines: document.querySelectorAll('.regline').length };
  });
  blockGeoChunk = false;
  ck('a failed region chunk says so and offers the same retry the JLS view does',
    /regija/.test(regFail.err || '') && regFail.retry && regFail.live === 'status'
    && regFail.lines === 0, JSON.stringify(regFail));
  /* This abort is deliberate too, and it never scrubbed after itself — the
     blanket `errors.length = 0` further down was covering for it, which is
     exactly what a blanket wipe does. Scrubbed here, where it is caused, by the
     same targeted splice the geo_jls block uses. */
  {
    const before = errors.length;
    for (let i = errors.length - 1; i >= 0; i--) {
      if (/geo_regions5/.test(errors[i]) && /ERR_FAILED|net::/.test(errors[i])) errors.splice(i, 1);
    }
    ck('the blocked region chunk is the only error swept, and it was swept',
      before - errors.length >= 1 && errors.length === 0,
      JSON.stringify({ dropped: before - errors.length, left: errors.slice(0, 2) }));
  }

  /* ── M-7: the first-paint placeholder must give up out loud ──
     A purged hashed chunk against a cached index.html leaves this markup as the
     permanent UI, claiming progress it is not making. */
  blockEntry = true;
  await page.goto('about:blank');
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await settle(11000);
  const bootFail = await page.evaluate(() => {
    const f = document.querySelector('#bootFail');
    return { present: !!f, opacity: f ? getComputedStyle(f).opacity : null,
      stillBooting: !!document.querySelector('.boot'), mounted: !!document.querySelector('#map') };
  });
  blockEntry = false;
  ck('a boot with no entry chunk stops claiming progress and says what to do',
    bootFail.present && bootFail.opacity === '1' && bootFail.stillBooting && !bootFail.mounted,
    JSON.stringify(bootFail));
  /* The deliberate abort above lands in the error list like any other, and this
     used to drop the whole ledger to length 0 to be rid of it. The comment
     justified one entry; the statement truncated the array — so the end-of-run
     "still zero page/console errors" assertion covered the last dozen checks
     instead of bracketing the run, and the 141 ck() sites between the previous
     errors assertion (the geo_jls scrub) and this line were guarded by nothing
     at all. That is most of the file, under a CSP whose entire enforcement story
     is that Chrome logs every violation to the console and this suite asserts
     zero console errors twice (see the header, and the design note at l.184).
     Same targeted splice the geo_jls scrub uses: remove only what the blocked
     entry chunk produced, prove at least one was removed, and prove nothing else
     is left — so an unrelated error raised anywhere in that window now fails a
     check instead of being swept up with it. */
  {
    const before = errors.length;
    for (let i = errors.length - 1; i >= 0; i--) {
      if (/\/assets\/index-[\w-]+\.js/.test(errors[i]) && /ERR_FAILED|net::/.test(errors[i])) errors.splice(i, 1);
    }
    ck('the blocked entry chunk is the only error swept, and it was swept',
      before - errors.length >= 1 && errors.length === 0,
      JSON.stringify({ dropped: before - errors.length, left: errors.slice(0, 2) }));
  }
  /* and the rewrite must not turn that 404 into a 200 text/html */
  const vercelCfg = JSON.parse(fs.readFileSync(path.resolve('vercel.json'), 'utf8'));
  /* `destination` was never read, and a destination is the half of a rewrite that
     can be dead. It has to name a file the build actually emits. */
  ck('the catch-all rewrite excludes the build’s own asset directories',
    vercelCfg.rewrites.length === 1 && /\(\?!assets\//.test(vercelCfg.rewrites[0].source)
    && /fonts\//.test(vercelCfg.rewrites[0].source)
    && vercelCfg.rewrites[0].destination === '/index.html'
    && (URLMODE || fs.existsSync(path.resolve(arg, 'index.html'))),
    JSON.stringify(vercelCfg.rewrites));
  /* …and then exercise the rule instead of grepping it. serve() applies the real
     source regex now (see REWRITE), so this is a request, not a string: a
     sub-path and a two-segment sub-path must both boot the app, and a missing
     asset or font must still 404 rather than being handed an HTML body that the
     browser would then refuse to execute as a script. */
  const httpGet = u => new Promise((resolve, reject) => {
    http.get(u, r => {
      let b = '';
      r.on('data', d => { b += d; });
      r.on('end', () => resolve({ status: r.statusCode, body: b }));
    }).on('error', reject);
  });
  const base = url.replace(/\/$/, '');
  for (const p of ['/assets/verify-missing.js', '/fonts/verify-missing.woff2']) probe404.add(p);
  const rw = {
    sub: await httpGet(base + '/nalaz'),
    deep: await httpGet(base + '/a/b'),
    asset: await httpGet(base + '/assets/verify-missing.js'),
    font: await httpGet(base + '/fonts/verify-missing.woff2'),
  };
  ck('a sub-path boots the app through the rewrite while a missing asset still 404s',
    rw.sub.status === 200 && /id="root"/.test(rw.sub.body)
    && rw.deep.status === 200 && /id="root"/.test(rw.deep.body)
    && rw.asset.status === 404 && rw.font.status === 404,
    JSON.stringify({ sub: rw.sub.status, deep: rw.deep.status, asset: rw.asset.status, font: rw.font.status }));
  /* …and serving the shell is not the same as mounting. Under the old relative
     `base: './'` a document served at /a/b resolved its entry to
     /a/assets/index-*.js, which the rewrite itself answered with text/html —
     Chrome refused it on strict MIME checking and React never mounted, so every
     trailing-slash or two-segment URL was a permanent boot placeholder whose own
     "Reload the page" link pointed back into the same dead path. Drive a real
     navigation to a two-segment path and require the map. */
  await page.goto('about:blank');
  await page.goto(base + '/en/saldo', { waitUntil: 'networkidle0' });
  await settle(400);
  const deepBoot = await page.evaluate(() => ({
    map: !!document.querySelector('#map'),
    boot: !!document.querySelector('.boot'),
    kids: (document.querySelector('#root') || {}).childElementCount,
  }));
  ck('a two-segment URL mounts the app, not the boot placeholder',
    deepBoot.map && !deepBoot.boot, JSON.stringify(deepBoot));
  await fresh('');

  /* ── M-8: the exported JLS figure must state its direction ──
     Odlasci, Dolasci and Neto shared one title, one badge and one filename, so
     in a slide nobody could tell whether a dark municipality meant many left it
     or many arrived. */
  const jmapExp = {};
  for (const d of ['out', 'in', 'net']) {
    await fresh('#v=jmap&dir=' + d);
    /* the export band uppercases its title, so this reads it case-insensitively */
    jmapExp[d] = await page.evaluate(() => {
      const svg = window.__exportSVG(false) || '';
      return (svg.match(/>[^<]*GRADOVI I OP[^<]*</i) || [''])[0];
    });
  }
  ck('the three JLS export directions produce three different titles',
    new Set(Object.values(jmapExp)).size === 3
    && /odlasci iz JLS/i.test(jmapExp.out) && /dolasci u JLS/i.test(jmapExp.in)
    && /neto po JLS/i.test(jmapExp.net),
    JSON.stringify(jmapExp));

  /* ── M-10: a pan must survive the pointer crossing the map edge ──
     onPointerLeave was mapped to onPointerUp, so a drag died at the box edge
     with the button still held — a ~570 px box and a country to cross. */
  await fresh('');
  await page.keyboard.press('+'); await page.keyboard.press('+'); await page.keyboard.press('+');
  await settle(250);
  const mbox = await page.evaluate(() => {
    const r = document.querySelector('#map').getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height };
  });
  const tf = () => page.evaluate(() => document.querySelector('#map g').getAttribute('transform'));
  const t0 = await tf();
  await page.mouse.move(mbox.l + mbox.w / 2, mbox.t + mbox.h / 2);
  await page.mouse.down();
  await page.mouse.move(mbox.l + 6, mbox.t + mbox.h / 2, { steps: 6 });
  const tEdge = await tf();
  await page.mouse.move(mbox.l - 120, mbox.t + mbox.h / 2, { steps: 6 });   /* outside the box */
  const tPast = await tf();
  await page.mouse.up();
  ck('a pan keeps going when the pointer crosses the map edge',
    t0 !== tEdge && tEdge !== tPast, JSON.stringify({ t0, tEdge, tPast }));
  /* and a right-button drag is not a pan */
  await fresh('');
  await page.keyboard.press('+');
  await settle(250);
  const rBefore = await tf();
  await page.mouse.move(mbox.l + mbox.w / 2, mbox.t + mbox.h / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(mbox.l + 40, mbox.t + mbox.h / 2, { steps: 5 });
  const rAfter = await tf();
  await page.mouse.up({ button: 'right' });
  ck('and a right-button drag does not pan the map', rBefore === rAfter,
    JSON.stringify({ rBefore, rAfter }));

  /* ── M-12: the matrix cell floor holds where the search runs out of box ──
     The 12 px floor is a documented invariant and the suite asserted it — but
     never at ≤980 px with a chip panel open, which is where the placement search
     measured 11,52 px. */
  for (const w of [1024, 980, 960]) {
    await page.setViewport({ width: w, height: 900 });
    for (const h of ['#v=mx&c=0&y=2018&dir=net&cz=1', '#v=mx&c=0&y=2018&dir=net&ag=1']) {
      await fresh(h);
      const g = await page.evaluate(() => {
        const c = document.querySelector('.mxc').getBoundingClientRect();
        const cells = [...document.querySelectorAll('.mxc')];
        /* and no cell may end up under the dock, which is what an off-box grid
           would cost if it overflowed sideways instead of downwards */
        const dock = document.querySelector('.chipdock').getBoundingClientRect();
        const under = cells.filter(e => {
          const r = e.getBoundingClientRect();
          return r.left < dock.right && r.right > dock.left && r.top < dock.bottom && r.bottom > dock.top;
        }).length;
        return { cell: +c.width.toFixed(2), n: cells.length, under };
      });
      ck(`matrix cell holds its 12 px floor at ${w} px with a panel open (${h.slice(-4)})`,
        g.cell >= 12 && g.n === 420 && g.under === 0, JSON.stringify(g));
    }
  }
  await page.setViewport({ width: 1440, height: 900 });

  /* ── M-13: the selected Godine column label is 9 px text on the ground ── */
  await fresh('#v=yrs&f=int&c=0&y=2022');
  const yrsSel = await page.evaluate(() => {
    /* the Croatian column label carries its ordinal dot */
    const t = [...document.querySelectorAll('#map text')].find(e => /^2022\.?$/.test(e.textContent));
    return t ? { txt: t.textContent, fill: t.getAttribute('fill'), weight: t.getAttribute('font-weight') } : null;
  });
  ck('the selected year label is ink, not 9 px teal on the ground',
    !!yrsSel && yrsSel.fill === '#20262B', JSON.stringify(yrsSel));

  /* ── M-14: the threshold slider is the only control that changes what klas
     classifies, and it was a 110×16 target on a coarse pointer ── */
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await fresh('#v=klas&c=1&y=2024');
  const thrBox = await page.evaluate(() => {
    const r = document.querySelector('#thr').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  ck('the klasifikacija threshold slider clears 24 px on a coarse pointer',
    thrBox.h >= 24, JSON.stringify(thrBox));
  await page.setViewport({ width: 1440, height: 900 });

  /* ── M-15: the docked corridor card clipped the honesty badge at 901–960 ── */
  for (const w of [960, 940, 901]) {
    await page.setViewport({ width: w, height: 900 });
    await fresh('#v=mx&c=0&y=2018&dir=net&s=HR-14&pp=HR-21');
    const clip = await page.evaluate(() => {
      const row = document.querySelector('#pairRow');
      const tag = row ? row.querySelector('.cls-tag') : null;
      const rail = document.querySelector('.rail');
      if (!row || !tag || !rail) return null;
      const t = tag.getBoundingClientRect(), r = rail.getBoundingClientRect();
      return { over: +(t.right - r.right).toFixed(2), badge: tag.textContent };
    });
    ck(`the corridor badge stays inside the rail at ${w} px`,
      !!clip && clip.over <= 0 && clip.badge === 'izmjereno', JSON.stringify(clip));
  }
  await page.setViewport({ width: 1440, height: 900 });

  /* ── M-16: county names are identifiers and must not be clipped, with or
     without the WCAG 1.4.12 text-spacing overrides ── */
  const spacing = `* { line-height: 1.5 !important; letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important; }`;
  for (const [w, over] of [[1440, false], [1280, false], [960, false], [1440, true]]) {
    await page.setViewport({ width: w, height: 900 });
    await fresh('#v=mx&c=0&y=2018&dir=net');
    if (over) await page.addStyleTag({ content: spacing });
    await settle(150);
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('#railList .rname, #railList .rval')]
        .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent).slice(0, 3));
    ck(`no rail label is clipped at ${w} px${over ? ' under the 1.4.12 overrides' : ''}`,
      clipped.length === 0, JSON.stringify(clipped));
  }
  await page.setViewport({ width: 1440, height: 900 });

  /* ── M-17: Windows High Contrast blanks whatever decodes the map ── */
  /* puppeteer's own emulateMediaFeatures whitelist does not carry forced-colors,
     so this goes through CDP directly */
  const cdp = await page.createCDPSession();
  const forced = on => cdp.send('Emulation.setEmulatedMedia',
    { features: on ? [{ name: 'forced-colors', value: 'active' }] : [] });
  await forced(true);
  await fresh('#v=klas&c=1&y=2024');
  const fcKlas = await page.evaluate(() => {
    const sw = [...document.querySelectorAll('.legend-sw')].map(e => getComputedStyle(e).backgroundColor);
    const seg = document.querySelector('#segView button[aria-pressed="true"]');
    const cs = getComputedStyle(seg);
    return { sw, distinct: new Set(sw).size, outline: cs.outlineWidth, adjust: getComputedStyle(document.querySelector('.legend-sw')).forcedColorAdjust };
  });
  await fresh('');
  const fcBar = await page.evaluate(() => {
    const b = document.querySelector('.legend-bar');
    const cs = getComputedStyle(b);
    return { adjust: cs.forcedColorAdjust, border: cs.borderTopWidth, img: cs.backgroundImage.slice(0, 24) };
  });
  await forced(false);
  await cdp.detach();
  ck('forced colors keeps the two colour keys legible and the pressed state visible',
    fcKlas.distinct === 3 && fcKlas.adjust === 'none' && parseFloat(fcKlas.outline) >= 2
    && fcBar.adjust === 'none' && parseFloat(fcBar.border) >= 1 && /gradient/.test(fcBar.img),
    JSON.stringify({ fcKlas, fcBar }));

  /* ── M-18: the differential stroke test exercised 2 of 9 documented selectors ──
     The strong measurement — it rasterises rather than reading attributes — ran
     on the JLS map alone, so a build that dropped `vector-effect` from the county
     paths, the region outlines, either grid or their trace bands would have
     shipped the reported "weird thick border" and stayed green. Every view that
     strokes inside the zoom transform is measured the same way now, and each of
     its selectors is asserted to *declare* the attribute on every element rather
     than inherit it from a stylesheet the exported document does not carry. */
  const strokeScan = async (hash, zoom, sels) => {
    await fresh(hash);
    await page.evaluate(z => {
      for (let i = 0; i < z; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    }, zoom);
    await settle(500);
    return page.evaluate(async list => {
      const doc = window.__exportSVG(false);
      /* A pixel *difference* rather than a run-length measurement. The JLS probe
         above counts dark runs, which works there because .jbord is ink — but the
         county paths and both grids stroke in white, so a dark-run median cannot
         see them at all and reported 0 vs 0. Rasterising the document as it ships
         and again with the attribute stripped, then counting the pixels that
         move, is colour-agnostic: if the attribute is doing nothing the two
         images are identical, whatever the stroke is painted in. */
      const raster = async str => {
        const u = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }));
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = u; });
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(u);
        return ctx.getImageData(0, 0, cv.width, cv.height).data;
      };
      const a = await raster(doc);
      const b = await raster(doc.replace(/ vector-effect="non-scaling-stroke"/g, ''));
      let moved = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) > 12 || Math.abs(a[i + 1] - b[i + 1]) > 12
          || Math.abs(a[i + 2] - b[i + 2]) > 12) moved++;
      }
      const declares = {};
      for (const t of list) {
        const q = [...document.querySelectorAll(t)];
        declares[t] = q.length > 0 && q.every(e => e.getAttribute('vector-effect') === 'non-scaling-stroke');
      }
      return { moved, px: a.length / 4, declares };
    }, sels);
  };
  for (const [hash, z, sels] of [
    ['#v=saldo&c=1&y=2024', 4, ['.cnt']],
    ['#v=reg&c=1&y=2024', 4, ['.cnt', '.regline']],
    ['#v=mx&c=0&y=2018&dir=net&s=HR-14&pp=HR-21', 3, ['.mxc', '.mxd', '.mxsel rect']],
    ['#v=yrs&f=int&c=0&y=2022', 3, ['.yrc', '.yrsel rect']],
  ]) {
    const r = await strokeScan(hash, z, sels);
    ck(`zooming ${hash.slice(3, 8)} does not fatten its strokes, and every stroke declares it`,
      r.moved > 2000 && Object.values(r.declares).every(Boolean),
      JSON.stringify(r));
  }
  await fresh('');

  /* ── M-21: the glossary's own accessibility contract ──
     role=dialog, aria-labelledby and #jcard[inert] were in the documented
     contract and in no assertion, which is why the ≤900 px regression was
     invisible. The first two are asserted on both sides of the breakpoint
     above; this is the third, which needs the JLS card to exist at all. */
  await fresh('#v=flow&s=HR-21&c=0&y=2018&jl=1');
  const jInert = await page.evaluate(async () => {
    const before = document.querySelector('#jcard').hasAttribute('inert');
    document.querySelector('#helpBtn').click();
    await new Promise(r => setTimeout(r, 300));
    const during = document.querySelector('#jcard').hasAttribute('inert');
    document.querySelector('#helpX').click();
    await new Promise(r => setTimeout(r, 300));
    return { before, during, after: document.querySelector('#jcard').hasAttribute('inert') };
  });
  ck('the open glossary makes the JLS card inert, and hands it back on close',
    !jInert.before && jInert.during && !jInert.after, JSON.stringify(jInert));

  /* ── M-20: the third honesty badge, on all three layers ──
     'badge.est' — load-bearing for every non-2018 tokovi year — appeared in no
     check on any layer, in either language. Screen, export and the visual mark,
     because the house rule binds honesty labels to exactly those. */
  for (const [l, badge] of [['hr', 'procjena (IPF)'], ['en', 'estimate (IPF)']]) {
    await fresh(`#l=${l}&v=flow&s=HR-21&dir=out&c=0&y=2017&pp=HR-01`);
    const est = await page.evaluate(() => {
      const tag = document.querySelector('#pairRow .cls-tag');
      return { sub: document.querySelector('#bigYearSub').textContent,
        tag: tag ? tag.textContent : null, cls: tag ? tag.className : null,
        border: tag ? getComputedStyle(tag).borderStyle : null,
        svg: (window.__exportSVG(false) || '').toUpperCase() };
    });
    ck(`the annual IPF badge reads on screen, in the export and in the mark (${l})`,
      est.sub.includes(badge) && est.tag === badge && /est/.test(est.cls)
      && est.border === 'dashed' && est.svg.includes(badge.toUpperCase()),
      JSON.stringify({ sub: est.sub, tag: est.tag, border: est.border,
        inSvg: est.svg.includes(badge.toUpperCase()) }));
  }

  /* ── M-24: the top rung of the language precedence ──
     `pinHr` deletes atlas-lang on every main-page document and none of the 15
     bootLang combinations passes an `l=`, so "an explicit link beats a stored
     choice" was exercised in neither direction. Both directions now, on a fresh
     document each time — and a link must not rewrite what the reader chose. */
  const linkVsStored = async (stored, hash) => {
    const pg = await watch(await browser.newPage());
    await pg.emulateTimezone('Europe/Zagreb');
    await pg.evaluateOnNewDocument(st => {
      Object.defineProperty(navigator, 'languages', { get: () => ['hr-HR', 'hr'], configurable: true });
      Object.defineProperty(navigator, 'language', { get: () => 'hr-HR', configurable: true });
      try { localStorage.setItem('atlas-lang', st); } catch { /* opaque origin */ }
    }, stored);
    await pg.goto(url + hash, { waitUntil: 'networkidle0' });
    await settle(250);
    const r = await pg.evaluate(() => ({ lang: document.documentElement.lang,
      stored: localStorage.getItem('atlas-lang'),
      val: (document.querySelector('#railList .rrow .rval') || {}).textContent || '' }));
    await pg.close();
    return r;
  };
  const linkEn = await linkVsStored('hr', '#l=en&v=saldo&c=1&y=2024');
  const linkHr = await linkVsStored('en', '#l=hr&v=saldo&c=1&y=2024');
  ck('an explicit link beats a stored choice, in both directions',
    linkEn.lang === 'en' && linkHr.lang === 'hr'
    && /,/.test(NBSP(linkEn.val)) && /\./.test(NBSP(linkHr.val)),
    JSON.stringify({ linkEn, linkHr }));
  ck('and following a link does not rewrite the stored choice',
    linkEn.stored === 'hr' && linkHr.stored === 'en',
    JSON.stringify({ en: linkEn.stored, hr: linkHr.stored }));

  /* ── M-25: the hosting policy, applied to every response of this run ──
     The live origin sent exactly one security header (HSTS): no CSP, no
     frame-ancestors, no nosniff, no Referrer-Policy — the page was framable by
     any origin. And content-hashed assets got no `immutable` while HTML got no
     revalidation, so a repeat visitor re-validated ~12 conditional requests per
     load and the cached-HTML-against-purged-chunk mismatch had a clear run.
     `serve()` reads vercel.json and applies it, so every check above ran under
     the real policy and a CSP that broke the app would have failed them rather
     than passing quietly. This asserts the policy is present and is the one the
     deploy will send. */
  const docHdr = (await page.goto(url, { waitUntil: 'domcontentloaded' })).headers();
  await fresh('');
  const entryUrl = await page.evaluate(() => {
    const e = performance.getEntriesByType('resource').find(r => /\/assets\/index-.*\.js$/.test(r.name));
    return e ? e.name : null;
  });
  const assetHdr = entryUrl ? (await page.goto(entryUrl, { waitUntil: 'domcontentloaded' })).headers() : {};
  await fresh('');
  const csp = docHdr['content-security-policy'] || '';
  ck('every response carries the deployed security policy',
    /default-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp)
    && /img-src 'self' data: blob:/.test(csp)
    && docHdr['x-content-type-options'] === 'nosniff'
    && /strict-origin/.test(docHdr['referrer-policy'] || ''),
    JSON.stringify({ csp: csp.slice(0, 80), nosniff: docHdr['x-content-type-options'] }));
  ck('content-hashed assets are immutable and the document revalidates',
    /immutable/.test(assetHdr['cache-control'] || '')
    && /must-revalidate/.test(docHdr['cache-control'] || ''),
    JSON.stringify({ asset: assetHdr['cache-control'], doc: docHdr['cache-control'] }));

  /* ── M-11: the two corridor repairs must not disagree ──
     `#v=mx&s=X&pp=X` looked complete to the lone-half test, passed it, and was
     then reduced to a lone `sel` — a state nothing renders, whose `s=` encodeHash
     laundered into every shared link and Tokovi then adopted as its hub. */
  await fresh('#v=mx&s=HR-01&pp=HR-01&c=0&y=2018');
  const mxSelf = await page.evaluate(() => ({ hash: location.hash,
    pair: !!document.querySelector('#pair'),
    band: document.querySelectorAll('.mxsel').length }));
  ck('a self-pair corridor leaves no phantom row behind in Matrica',
    !/s=HR/.test(mxSelf.hash) && !/pp=/.test(mxSelf.hash) && !mxSelf.pair && mxSelf.band === 0,
    JSON.stringify(mxSelf));
  /* ── errors, again, after the v2.0.5 block ── */
  /* This is the closing half of the bracket the file's design note describes,
     and it means it now: the ledger is no longer truncated mid-run, so what it
     covers is every check since the geo_jls scrub — 141 ck() sites that were
     previously answered by an array somebody had emptied. */
  await fresh('');
  ck('still zero page/console errors after the pass-3 surfaces',
    errors.length === 0, errors.join(' ; ').slice(0, 300));

  /* The two Vercel platform routes are stubbed (see VERCEL_STUB); this asserts
     they were actually asked for — a silent analytics regression would otherwise
     read as green — and that nothing *else* went missing behind the stub. */
  /* Re-asserted here, not only at check #171: everything the suite exercises
     after that point was unguarded, and the two probes together bracket the run. */
  ck('and the page still reaches no third-party origin at end of run',
    thirdParty.length === 0, thirdParty.slice(0, 4).join(' , ') || 'none');
  ck('the only paths dist cannot answer are the two Vercel platform routes',
    /* the two deliberate 404 probes from the rewrite check are excluded by name;
       everything else dist cannot answer is still a failure */
    stubHits.size === 2 && (URLMODE || notFound.filter(p => !probe404.has(p)).length === 0),
    JSON.stringify({ stubbed: [...stubHits], missing: notFound.slice(0, 5) }));

  /* The suite is a fixed protocol, so its size is itself an invariant: three
     documents once claimed three different check counts and none was right.
     A deleted ck() is now a failure, not a quieter green run. */
  ck('the suite ran its full documented check count', n + 1 === EXPECTED_CHECKS, `${n + 1} vs ${EXPECTED_CHECKS}`);
})().then(
  () => finish(),
  e => { console.error('harness error:', e); return finish(2); },
);
