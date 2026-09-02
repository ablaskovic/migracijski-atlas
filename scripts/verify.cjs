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

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.map': 'application/json', '.xml': 'application/xml', '.woff2': 'font/woff2' };
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
const EXPECTED_CHECKS = 502;
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
  /* ONE ledger for every page the suite opens. The two listeners used to be
     installed on the main page alone, so roughly twenty-two full app boots —
     all fifteen language-detection cases, the stored-choice boot, the Back
     journey, the link-versus-stored pair and both font-swap modes — ran outside
     both "zero page/console errors" brackets. A pageerror thrown just after
     mount on any of them left the narrow property each of those checks asserts
     intact (documentElement.lang was already set), recorded nothing, and both
     bracket checks stayed green. The file's whole CSP enforcement story is that
     "Chrome logs every violation to the console, and this suite asserts zero
     console errors twice" — which was not true on any page but one. */
  const errors = [];
  const ledger = pg => {
    pg.on('pageerror', e => errors.push('pageerror: ' + e.message));
    /* the URL as well as the text: Chrome's "Failed to load resource" message
       does not name what failed, and every deliberate-abort scrub in this file
       has to be able to drop exactly the one it caused and nothing else */
    pg.on('console', m => {
      if (m.type() !== 'error') return;
      const at = (m.location() || {}).url || '';
      errors.push('console: ' + m.text() + (at ? ' @ ' + at : ''));
    });
    return pg;
  };
  const watch = async (pg, abortIf) => {
    ledger(pg);
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
  /* `{ re, gate, done, n }` while a chunk request is being held open, null
     otherwise. `n` counts how many requests were actually parked, which is what
     proves the reader's own view change issued no request of its own and really
     did join the warm's promise. */
  let hold = null;
  const holdChunk = re => {
    let done;
    const gate = new Promise(r => { done = r; });
    hold = { re, gate, done, n: 0 };
    return hold;
  };
  /* `go` true lets the parked requests through, false fails them. Cleared first
     so anything arriving afterwards is answered normally. */
  const releaseChunk = go => { const h = hold; hold = null; if (h) h.done(go); };
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
    /* A chunk PARKED rather than answered, which `blockGeoChunk` cannot produce:
       it aborts instantly, so the window in which a speculative warm is still in
       flight is zero and no check could ever open the view that warm is warming
       while it was still running. That window is the one a reader on a slow
       connection actually meets — see the held-warm check below. */
    if (hold && hold.re.test(u)) { hold.n++; return hold.gate.then(go => (go ? r.continue() : r.abort())); }
    /* `blockGeoChunk` names which payload to drop: the JLS chunk by default, and
       'reg' for the region outlines, whose failure UI had no importers at all. */
    if (blockGeoChunk && new RegExp(blockGeoChunk === 'reg' ? 'geo_regions5' : 'geo_jls').test(u)) return r.abort();
    /* a purged hashed chunk against a cached index.html — the ordinary way the
       first-paint placeholder is left with nothing to replace it */
    if (blockEntry && /\/assets\/index-[\w-]+\.js$/.test(u)) return r.abort();
    return r.continue();
  });
  ledger(page);

  await page.goto(url, { waitUntil: 'networkidle0' });
  await settle(500);
  /* Wait for the target before pressing it, for the same reason fresh() waits for
     the app: `page.click` throws "No element found for selector" the instant
     querySelector returns null, and that throw unwinds the whole run rather than
     failing one check. A viewport change followed by a reload is exactly the
     race — measured, a run died on `click('#helpBtn')` at the third viewport of a
     sweep whose first two had just passed. */
  /* …and the wait has to be load-BEARING, not decorative. It swallowed its own
     timeout and then clicked unconditionally, so when the selector really was
     absent `page.click` threw "No element found for selector" from inside this
     helper and unwound the whole run — exactly the failure the comment above
     says the wait prevents. Measured under CPU contention on HEAD: the run
     stopped at 415/463 with exit 2 on `#segView button[data-v="saldo"]`, and
     the 48 checks after it never ran. Two uncontended runs of the same build
     printed ALL 463 CHECKS PASS, so it is a load flake that silently drops the
     tail of the suite on a shared CI runner, not an app defect.
     A missing control is now recorded and the run continues, so one slow mount
     costs one red line at the end instead of the last tenth of the coverage.
     All 58 call sites and the four raw page.click sites go through here. */
  const missed = [];
  /* A navigation that times out is the same class of flake as a slow mount and
     it lands one frame earlier: `networkidle0` can miss its 30 s budget on a
     contended runner while the page itself is perfectly healthy, and the throw
     unwinds the run from inside the helper. Measured on this build — a run
     aborted at 419/482 on exactly that. Retried once against the weaker
     condition, because a network that will not go quiet is not the same thing as
     a document that will not load; if both fail it is recorded and the mount
     wait below decides whether anything is really wrong. */
  const goTo = async u => {
    for (const waitUntil of ['networkidle0', 'domcontentloaded']) {
      try { await page.goto(u, { waitUntil, timeout: 30000 }); return true; }
      catch { /* fall through to the weaker condition, then give up */ }
    }
    missed.push('goto ' + u.replace(url, '') || '/');
    return false;
  };
  const click = async sel => {
    const el = await page.waitForSelector(sel, { timeout: 10000 }).catch(() => null);
    if (!el) { missed.push('click ' + sel); return false; }
    await el.click();
    await settle(80);
    return true;
  };

  /* fresh boot helper: hash state is read at module init, so force a real reload */
  const fresh = async h => {
    await page.goto('about:blank').catch(() => {});
    await goTo(url + h);
    /* Wait for the app, not for a stopwatch. `networkidle0` says the network went
       quiet, which is not the same as React having mounted — and every block
       after a fresh() reads the DOM straight away, so a slow mount surfaces as
       `Cannot read properties of null` from inside an evaluate, i.e. as a harness
       abort rather than as a failed check. Every view renders svg#map, so it is
       the one marker that means "the tree is up". */
    /* …and one retry before giving up. The swallowed timeout let the suite walk
       into the next evaluate with no app mounted, where the first of ~140
       unguarded `document.querySelector('X').textContent` reads throws on null
       and unwinds to the outer handler: this audit's own baseline run aborted
       that way at #railLab, printing ABORTED after 251/463 with 212 checks never
       evaluated. A second goto costs a second on the rare slow mount and removes
       the flake; a mount that fails twice is recorded and the run carries on, so
       the dependent checks fail individually and the tail of the suite still
       runs. */
    let up = await page.waitForFunction(() => !!document.querySelector('#map'), { timeout: 15000 })
      .then(() => true, () => false);
    if (!up) {
      await goTo(url + h);
      up = await page.waitForFunction(() => !!document.querySelector('#map'), { timeout: 15000 })
        .then(() => true, () => false);
      if (!up) missed.push('mount ' + (h || '/'));
    }
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
  /* The tooltip must carry the number that painted the county. In Regije the
     fill comes from regVal, the legend's tick marks regVal and countyAria speaks
     regVal — three surfaces agree and the fourth is the one under the cursor,
     which showed the county's own decomposition and nothing else. Measured at
     `#v=reg&c=1&y=2024` over Osječko-baranjska: aria −97.195, legend tick
     −97.195, tooltip "migracije · 2011.–2024. −26.517" — 3,7× apart for the same
     element at the same moment, with nothing saying the county figure is not
     what coloured the county. */
  await fresh('#v=reg&c=1&y=2024');
  await page.hover('path[data-iso="HR-14"]');
  await settle(160);
  const regTip = await page.evaluate(() => ({
    tip: document.querySelector('#tip').textContent,
    aria: document.querySelector('path[data-iso="HR-14"]').getAttribute('aria-label') || '',
  }));
  const regNum = (NBSP(regTip.aria).match(/[+−][\d.]+/) || [''])[0];
  ck('the Regije tooltip carries the region figure that painted the county',
    !!regNum && NBSP(regTip.tip).includes(regNum) && /Istočna/.test(regTip.tip),
    JSON.stringify({ regNum, aria: regTip.aria, tip: NBSP(regTip.tip).slice(-80) }));
  await fresh('');

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
  /* …and on a window big enough to matter the canvas is clamped by area rather
     than blindly doubled. .main and .map-wrap carry no max-width, so at 3840×2160
     the map is 3548×1856 and a flat 2× asks for 7096×4060 — 28,8 Mpx, ~110 MB of
     backing store, on top of the ~25 MB decoded <img> drawImage reads from. WebKit
     caps backing store by area at 16.777.216 px and past it toBlob yields a BLANK
     image rather than an error, so the reader downloads an empty frame with no
     message. */
  await page.setViewport({ width: 3840, height: 2160 });
  await fresh('');
  const png4k = await page.evaluate(async () => {
    const r = await window.__exportPNG(false);
    return { w: r.w, h: r.h, px: r.w * r.h, bytes: r.bytes, map: document.querySelector('#map').clientWidth };
  });
  ck('the PNG export is clamped by area on a very large window',
    png4k.px <= 16000000 && png4k.px > 4000000 && png4k.bytes > 50000,
    JSON.stringify(png4k));
  await page.setViewport({ width: 1440, height: 900 });
  await fresh('');

  /* ── SVG export (vector twin) ── */
  const svgDoc = await page.evaluate(() => window.__exportSVG(false));
  ck('exportSVG returns a document with 21 baked county paths',
    typeof svgDoc === 'string' && svgDoc.length > 20000 && (svgDoc.match(/class="cnt/g) || []).length === 21,
    String(svgDoc && svgDoc.length));
  ck('exportSVG carries title band + attribution', svgDoc.includes('MIGRACIJSKI ATLAS') && svgDoc.includes('geoBoundaries'));
  /* The point of exportFonts is that the vector twin *embeds* the faces rather
     than naming them, and nothing checked that it does. exportSVG is synchronous
     by contract, so it can only embed what has already arrived — pressing SVG
     inside the warm-fetch window shipped a figure with zero @font-face rules and
     a band fitted against metrics the opening application does not have. The
     button awaits ensureFonts now; this is what proves the payload lands. */
  const svgFaces = await page.evaluate(() => {
    const doc = window.__exportSVG(false);
    return { faces: (doc.match(/@font-face/g) || []).length,
      b64: (doc.match(/url\(data:font\/woff2;base64,/g) || []).length,
      /* FACES is Mono + Oswald on purpose — exportFonts states that IBM Plex
         Sans is deliberately absent, since the only text asking for it is the
         PNG's canvas legend, which the page draws with the real face. */
      fams: ['IBM Plex Mono', 'IBM Plex Sans', 'Oswald'].filter(f => doc.includes("font-family:'" + f + "'")) };
  });
  ck('the exported vector embeds its faces rather than naming them',
    !!svgFaces && svgFaces.faces >= 6 && svgFaces.b64 === svgFaces.faces
    && svgFaces.fams.includes('IBM Plex Mono') && svgFaces.fams.includes('Oswald'),
    JSON.stringify(svgFaces));

  /* ── header budget (v4: 138 px, default view) ── */
  const hdH = await page.evaluate(() => Math.round(document.querySelector('.hd').getBoundingClientRect().height));
  ck('header height <= 145 px at 1440 (v4 budget 138)', hdH <= 145, String(hdH));

  /* ── rail a11y + legend hover mark + detail card readout ── */
  const nFocus = await page.evaluate(() => document.querySelectorAll('#railList .rrow[tabindex="0"]').length);
  ck('rail rows keyboard-focusable (21)', nFocus === 21, String(nFocus));
  /* Ctrl+P is a plausible thing to do with an atlas, and there was no print
     stylesheet at all. The rail is an overflow-y:auto scroller inside a
     viewport-locked column, so at the A4 landscape content box only 11 of the 21
     county rows were on the sheet — no scrollbar, no ellipsis, nothing saying so,
     and the reader cites a table they believe is the complete ranking. Chrome
     also ships "Background graphics" unchecked, which prints the legend ramp as
     an empty white rectangle beside a full-colour choropleth, since the polygons
     are SVG fill attributes and the ramp is a CSS gradient. */
  await page.setViewport({ width: 1047, height: 718 });
  await fresh('');
  await page.emulateMediaType('print');
  await settle(250);
  const printed = await page.evaluate(() => {
    const l = document.querySelector('.rail-list');
    const rows = [...document.querySelectorAll('#railList .rrow')];
    const lb = document.querySelector('.legend-bar');
    const box = l.getBoundingClientRect();
    return { rows: rows.length,
      inside: rows.filter(r => {
        const a = r.getBoundingClientRect();
        return a.top >= box.top - 1 && a.bottom <= box.bottom + 1;
      }).length,
      pca: lb ? (getComputedStyle(lb).printColorAdjust || getComputedStyle(lb).webkitPrintColorAdjust) : null };
  });
  await page.emulateMediaType(null);
  ck('printing carries the whole ranking and keeps the colour key',
    printed.rows === 21 && printed.inside === 21 && printed.pca === 'exact',
    JSON.stringify(printed));

  /* …and the figure itself, which this block never looked at. It ran on the
     default view and measured the rail; the map was left to the same collapse
     the rail had just been rescued from. Turning `.map-wrap`/`.map-stage` into
     blocks leaves `.map-box{flex:1}` resolving to `auto`, so the box sat on its
     180 px floor and its percentage-height SVG fell back to the 150 px
     replaced-element default. The choropleths merely spilled 20 px, because a
     d3 projection refits to whatever box it is given — but Matrica and Godine
     lay out on a fixed cell geometry already at its 12 px floor, so for them a
     shorter box is a crop. Measured at 1047×718: Matrica drew 352,1×321,1 into a
     150 px SVG and lost 192 px below the fold — sixteen of its twenty-one county
     rows, behind the UA's overflow:hidden, under a complete column axis, so the
     sheet reads as the whole 21×21 matrix and cites five rows. Godine lost
     114 px. All seven views, and the drawn extent against the box it is drawn
     in, because "the rail fits" was never the question the map answers. */
  const printFit = [];
  for (const [v, h] of [['saldo', ''], ['klas', '#v=klas'], ['reg', '#v=reg'],
    ['flow', '#v=flow&s=HR-21&c=0&y=2018'], ['mx', '#v=mx&c=0&y=2018&dir=out'],
    ['jmap', '#v=jmap&dir=net'], ['yrs', '#v=yrs']]) {
    await fresh(h);
    await page.emulateMediaType('print');
    await settle(350);
    printFit.push({ v, ...await page.evaluate(() => {
      const svg = document.querySelector('#map');
      if (!svg) return { over: 9999 };
      const r = svg.getBoundingClientRect();
      let bb = null;
      try { bb = svg.getBBox(); } catch { /* not laid out */ }
      return { svgH: Math.round(r.height),
        drawn: bb ? Math.round(bb.height) : 0,
        over: bb ? Math.max(0, Math.round(bb.y + bb.height - r.height)) : 9999 };
    }) });
    await page.emulateMediaType(null);
  }
  /* …and it has to FILL the band, not merely fit in it. A box that stayed at its
     180 px floor would satisfy `over === 0` while printing the figure the atlas
     exists for as a stamp: measured before the print height, the Saldo
     choropleth drew 161,7 × 160 px inside a 1440 px band — a 3,4× linear, 11,6×
     area reduction against the 555,7 × 550 it draws on screen, with counties
     25–41 px wide and the legend beside it 55 % as tall as the whole map it
     explains, covering 49 % of the box. The ranking bar chart got 508 px of the
     sheet and the map 150. Measured after: 525,4 × 520 in a 540 px band at
     1440×900 and 415,1 × 410,8 in a 431 px band on A4 landscape, with the legend
     down to 16–20 %. 0,6 is well under the 0,85–0,96 every view now draws. */
  ck('every view prints its whole figure instead of cropping it to the box',
    printFit.length === 7
    && printFit.every(p => p.over === 0 && p.drawn > 100 && p.drawn >= p.svgH * 0.6),
    JSON.stringify(printFit.filter(p => p.over > 0 || p.drawn < p.svgH * 0.6).slice(0, 3)));
  await page.setViewport({ width: 1440, height: 900 });
  await fresh('');
  await page.hover('path[data-iso="HR-18"]');
  await settle(80);
  const mark = await page.evaluate(() => !!document.querySelector('#legend .legend-mark'));
  ck('legend shows hover mark on gradient', mark);
  /* The legend must stay inside the box it is anchored to. Under Chrome's
     minimum-font-size setting — what a reader reaches for when nothing else
     raises the type — every box in the header and footer grows and the stage is
     what gives: measured at an ordinary 1440×900, .map-box went 570 → 365 → 299
     → 108 → 0 px as the setting climbed, and at 108 the 201 px legend escaped
     UPWARD and painted 94 px over the Sastavnica group, unreachable because body
     is overflow:hidden and height-locked. Simulated here by shrinking the stage
     directly, which is the condition the setting produces. */
  /* …under the setting itself, not under a geometry that resembles it.
     The simulation set `.map-box{height:150px}`, which the OTHER half of the
     same fix — `min-height:180px` — clamps: measured, the box went 570 → 180,
     never 150. And the suite runs at default type, where the Saldo legend is
     88 px inside a 180 px box, so the cap is never loaded at all. Mutation-
     tested: stripping `max-height` and `overflow-y` from `.legend`, the exact
     revert of the guard this check is named for, left it reporting
     {escapes:false, overCtrls:0, legH:88} and printing ok. Under
     minimumFontSize=24 the identical strip gives {escapes:true,
     overCtrls:6119, legH:201} — the defect this check exists for, exactly
     reproducible and completely invisible to it.
     puppeteer cannot set that preference per page, so it takes a second
     browser, the way the font-swap and language boots already take extra
     pages. `root >= 24` is the floor that proves the flag took effect: a Chrome
     that ignored it would otherwise pass this vacuously at default type. */
  const mfsBrowser = await puppeteer.launch({
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--lang=hr-HR',
      '--blink-settings=minimumFontSize=24,minimumLogicalFontSize=24'],
  });
  let legEscape, mfsRoom;
  try {
    const pg = await watch(await mfsBrowser.newPage());
    await pinHr(pg);
    await pg.emulateTimezone('Europe/Zagreb');
    /* …and the layout the same setting collapses. A root the reader raised
       changes no viewport dimension, so none of index.css's three
       stacked-layout conditions can see it and the pinned one-viewport column
       has nothing to give. Measured at 1280×800 before the fix: .main, .rail
       and .map-stage all 0 px, .map-box holding at its own 180 px floor and
       overflowing that 0 px stage, the stage-anchored chip dock painted over
       the control row (33.069 px² of overlap with .ctrls), and the last 10 px of
       the footer — the sources and licences line — below a viewport whose body
       is overflow:hidden. At minimumFontSize=18 the same window is intact
       (stage 242 px), so the collapse happens between the two. */
    await pg.setViewport({ width: 1280, height: 800 });
    await pg.goto(url + '#v=saldo&c=0&y=2018', { waitUntil: 'networkidle0' });
    await pg.waitForFunction(() => !!document.querySelector('#map'), { timeout: 15000 }).catch(() => {});
    await settle(600);
    mfsRoom = await pg.evaluate(async () => {
      const h = sel => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().height) : -1; };
      const ov = (a, b) => {
        const A = document.querySelector(a), B = document.querySelector(b);
        if (!A || !B) return -1;
        const p = A.getBoundingClientRect(), q = B.getBoundingClientRect();
        return Math.round(Math.max(0, Math.min(p.right, q.right) - Math.max(p.left, q.left))
          * Math.max(0, Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)));
      };
      const ft = document.querySelector('.ft');
      ft.scrollIntoView({ block: 'end' });
      await new Promise(r => setTimeout(r, 300));
      const r = ft.getBoundingClientRect();
      return { root: parseFloat(getComputedStyle(document.documentElement).fontSize),
        main: h('.main'), rail: h('.rail'), stage: h('.map-stage'), box: h('.map-box'),
        bodyOv: getComputedStyle(document.body).overflowY,
        dockOverCtrls: ov('.chipdock', '.ctrls'),
        ftReached: r.bottom <= innerHeight + 1 && r.top < innerHeight };
    });
    await pg.setViewport({ width: 1440, height: 900 });
    await pg.goto(url + '#v=saldo&c=1&y=2024', { waitUntil: 'networkidle0' });
    await pg.waitForFunction(() => !!document.querySelector('#map'), { timeout: 15000 }).catch(() => {});
    await settle(500);
    legEscape = await pg.evaluate(() => {
      const b = document.querySelector('.map-box').getBoundingClientRect();
      const l = document.querySelector('.legend').getBoundingClientRect();
      const c = document.querySelector('.ctrls').getBoundingClientRect();
      const ov = Math.max(0, Math.min(l.right, c.right) - Math.max(l.left, c.left))
        * Math.max(0, Math.min(l.bottom, c.bottom) - Math.max(l.top, c.top));
      return { root: parseFloat(getComputedStyle(document.documentElement).fontSize),
        escapes: l.top < b.top - 1, overCtrls: Math.round(ov),
        legH: Math.round(l.height), boxH: Math.round(b.height) };
    });
    await pg.close();
  } finally { await mfsBrowser.close(); }
  ck('the legend stays inside the map box under the reader’s own minimum font size',
    legEscape.root >= 24 && !legEscape.escapes && legEscape.overCtrls === 0
    && legEscape.legH <= legEscape.boxH, JSON.stringify(legEscape));
  ck('…and the stage still exists there, the dock stays off the controls, and the footer can be reached',
    mfsRoom.root >= 24 && mfsRoom.main >= 180 && mfsRoom.rail >= 180 && mfsRoom.stage >= 180
    && mfsRoom.dockOverCtrls === 0 && mfsRoom.bodyOv !== 'hidden' && mfsRoom.ftReached,
    JSON.stringify(mfsRoom));
  /* …and the type tracks the reader's own font-size preference. All 74
     font-size declarations in index.css were literal px, including the base, so
     Chrome's Appearance → Font size — the single most discoverable text-size
     remedy a browser offers, and the one an OS accessibility guide points at —
     changed nothing: measured at defaultFontSize=32 the root went 16px → 32px and
     all twelve sampled surfaces were byte-identical, with the header, map box and
     footer unchanged to the pixel. 33 of the 74 sizes are under 10 px on an atlas
     whose purpose is reading small numbers. Asserted as a ratio, not as a size,
     so a copy change cannot break it. */
  const fsScale = await page.evaluate(() => {
    const root = document.documentElement;
    const before = ['body', '.rname', '.legend-note'].map(s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize));
    root.style.fontSize = '32px';
    const after = ['body', '.rname', '.legend-note'].map(s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize));
    root.style.fontSize = '';
    /* …and the other 71 declarations, which three named selectors cannot speak
       for. The check's title claims EVERY size and it sampled three: measured,
       injecting `#resetBtn{font-size:11px !important}` left the trio scaling
       14/11/9 → 28/22/18 and the check green, while the reset button stayed at
       11 px through a doubled root — the browser's own Appearance → Font size
       preference dead on that surface, which is the whole defect this check
       exists to prevent. The stylesheet is self-hosted, so its rules are
       readable here: every declaration is swept and its UNIT asserted. The
       ratio test above stays as the behavioural half — a rem size can still be
       defeated by an ancestor px, which the units alone would not catch. */
    const px = [];
    let seen = 0;
    const walk = rules => {
      for (const r of rules) {
        /* The declaration FIRST, then the descent. CSS Nesting made every
           CSSStyleRule a grouping rule as well, so a plain rule now carries an
           empty `cssRules` list — a walk that tested for it and skipped read 0
           of the 61 declarations in the built sheet and reported them all
           clean. */
        const v = r.style && r.style.fontSize;
        /* rem/em/% track the reader's preference, and so does a keyword that
           defers to an ancestor that does — `button{font-size:inherit}` is the
           reset that stops a form control opting out of the whole scheme. */
        if (v) {
          seen++;
          const ok = /(rem|em|%)$/.test(v.trim()) || /^(inherit|unset|revert|initial)$/.test(v.trim());
          if (!ok) px.push((r.selectorText || '?') + ' → ' + v);
        }
        if (r.cssRules) walk(r.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules); }
      catch { /* a cross-origin sheet has no readable cssRules — none is served here */ }
    }
    return { before, after, px, seen };
  });
  ck('every size in the stylesheet tracks the reader’s font-size preference',
    fsScale.before.every((v, i) => Math.abs(fsScale.after[i] / v - 2) < 0.02)
    /* a floor, so a stylesheet that failed to load cannot pass by sweeping nothing */
    && fsScale.seen >= 60 && fsScale.px.length === 0,
    JSON.stringify({ before: fsScale.before, after: fsScale.after, seen: fsScale.seen, px: fsScale.px.slice(0, 4) }));
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
  /* …and each of them names the county it is drawn on. Anchored on the
     area-weighted centroid, two did not: "Zadarska" was painted on the Zadar
     channel (`geoContains` puts that point in no county at all) and
     "Brodsko-pos." on top of Požeško-slavonska. Hit-tested rather than
     recomputed, so this measures what a reader's eye lands on. */
  const labHost = await page.evaluate(() => [...document.querySelectorAll('#map .clab')].map(t => {
    const b = t.getBoundingClientRect();
    const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return { name: t.textContent, iso: el ? el.getAttribute('data-iso') : null,
      /* the host county's own name, as the app itself prints it: everything
         before the colon of the path's accessible label */
      host: el ? (el.getAttribute('aria-label') || '').split(':')[0] : '' };
  }));
  /* `name` was collected and then thrown away — the filter read `!l.iso` alone,
     so what the check actually asked was "does every label sit on SOME county",
     which is neither its title nor either defect its comment cites. Measured:
     rotating all sixteen rendered labels onto their neighbours, so that not one
     names the county under it, left labMiss empty and the check green. Only the
     Zadarska class (a label on open water, iso null) was ever caught; the
     "Brodsko-pos. printed across Požeško-slavonska" class — the map naming one
     county with another's name — was invisible to it.
     The drawn name is an elision of the county's own ("Osječko-bar." of
     "Osječko-baranjska", "Grad Zagreb" of itself), so the comparison is a prefix
     test once the elision dot is dropped. */
  const labMiss = labHost.filter(l => !l.iso || !l.host
    || !l.host.startsWith(String(l.name).replace(/\.$/, '')));
  ck('every county label is drawn on the county it names',
    labHost.length >= 12 && labMiss.length === 0,
    JSON.stringify(labMiss.slice(0, 4)));
  /* The gate used to compare the county's bbox against a constant 70 px while
     the drawn name runs 43–92 px, so the longest overflowed and nothing dropped
     the loser: measured, "Virovitičko-podr." sat on "Bjelovarsko-bil." over
     almost its full height. Overlap is measured pairwise on the rendered boxes,
     halo included. */
  const labOver = await page.evaluate(() => {
    const L = [...document.querySelectorAll('#map .clab')].map(t => t.getBoundingClientRect());
    const hits = [];
    for (let i = 0; i < L.length; i++) {
      for (let j = i + 1; j < L.length; j++) {
        const ox = Math.min(L[i].right, L[j].right) - Math.max(L[i].left, L[j].left);
        const oy = Math.min(L[i].bottom, L[j].bottom) - Math.max(L[i].top, L[j].top);
        if (ox > 0 && oy > 0) hits.push(i + '×' + j + ' ' + ox.toFixed(1) + 'x' + oy.toFixed(1));
      }
    }
    return hits;
  });
  ck('no two county labels overlap', labOver.length === 0, labOver.slice(0, 3).join(' | '));
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


  /* Focus must PLACE the tip, not merely show it. moveTip replays the last
     pointer position and there may not have been one: measured on a fresh load
     with the pointer never moved, focusing a county painted its 260×242 readout
     at 0,0 — over the app header — while the county sits at (575,598). After a
     hover it is quieter and worse: the tip keeps the previous county's position
     and swaps its content, anchoring one county's numbers over another ~420 px
     away. Both grid views and the JLS path already place it. */
  await fresh('');
  const focTip = await page.evaluate(async () => {
    const c = document.querySelector('.cnt[data-iso="HR-19"]');
    c.focus();
    await new Promise(r => setTimeout(r, 250));
    const t = document.querySelector('#tip').getBoundingClientRect();
    const b = c.getBoundingClientRect();
    return { tip: { x: Math.round(t.x), y: Math.round(t.y) },
      county: { x: Math.round(b.x), y: Math.round(b.y) },
      shown: document.querySelector('#tip').classList.contains('show'),
      near: Math.hypot(t.x - b.right, t.y - b.bottom) < 320 };
  });
  ck('focusing a county places its tooltip beside it, not at the origin',
    focTip.shown && focTip.near && (focTip.tip.x > 0 || focTip.tip.y > 0),
    JSON.stringify(focTip));

  /* …and the rail, which is the same highlight reached the other way. This check
     read one county path, so it stayed green while the rail — whose own comment
     says focus there "is the only way to reach that highlight from a keyboard" —
     never called moveTip at all. Measured at 1440×900 with the mouse never
     moved: focusing rail row 0 on a fresh load painted a 260×302 panel at (0,0)
     over the header with style.left and style.top both empty, while the row it
     describes sat at (1149,196); after tabbing through the counties first, "Grad
     Zagreb" and then "Istarska" both froze the tip at left 790,234px top 384px —
     Istarska's numbers painted over eastern Slavonia, 359 px from the row that
     named them. Two rows, because one row cannot show the tip MOVED, which is
     the stale-position half of the defect. */
  const railTip = await page.evaluate(async () => {
    const read = async i => {
      const r = [...document.querySelectorAll('#railList .rrow')][i];
      if (!r) return { absent: true };
      r.focus();
      await new Promise(x => setTimeout(x, 250));
      const el = document.querySelector('#tip');
      const t = el.getBoundingClientRect(), b = r.getBoundingClientRect();
      return { shown: el.classList.contains('show'), left: el.style.left,
        tip: [Math.round(t.x), Math.round(t.y)], row: [Math.round(b.x), Math.round(b.y)],
        near: Math.hypot(t.x + t.width / 2 - (b.x + b.width / 2), t.y + t.height / 2 - (b.y + b.height / 2)) < 320,
        inside: t.x >= 0 && t.y >= 0 && t.right <= innerWidth && t.bottom <= innerHeight };
    };
    return { a: await read(0), b: await read(5) };
  });
  ck('and focusing a rail row places it beside that row, and moves it between rows',
    railTip.a.shown && railTip.a.near && railTip.a.inside && railTip.a.left !== ''
    && railTip.b.shown && railTip.b.near && railTip.b.inside
    && railTip.a.tip[1] !== railTip.b.tip[1],
    JSON.stringify(railTip));

  /* …and the toggle is mounted only where something consumes it. `labelG` is
     rendered by the two geometry branches, and Godine renders YearsView, which
     never reads S.labels — so in that view the button flipped to .on, announced
     "pressed", appended `lb=1` to the shared permalink, and changed nothing on
     screen. The old check exercised only the default Saldo view and counted only
     `#map .clab`, so it excluded the culprit view by construction. */
  const labViews = [];
  for (const [h, want] of [['#v=saldo', true], ['#v=klas', true], ['#v=reg', true],
    ['#v=flow&s=HR-21', true], ['#v=jmap', true], ['#v=mx&y=2018&c=0', false], ['#v=yrs', false]]) {
    await fresh(h);
    const has = await page.evaluate(() => !!document.querySelector('#labBtn'));
    if (has !== want) labViews.push(h + ' has=' + has + ' want=' + want);
  }
  ck('the labels toggle is mounted exactly in the views that draw labels',
    labViews.length === 0, labViews.join(' | '));
  await fresh('');

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
  /* …and none of the flow ink may grow with the zoom. Every stroke in this svg
     is inside the zoom transform: the county borders take non-scaling-stroke and
     the labels are counter-scaled, and the arcs were the one exception — at KMAX
     the widest rendered 13 × 8 = 104 px across, 18 % of the default box, with a
     198 px arrowhead and a ~72 px hub dot, burying the county a reader had
     zoomed in to read while it stayed hoverable (.arc is pointer-events:none).
     Measured on screen, through getScreenCTM, not on the attribute. */
  const arcMeas = () => page.evaluate(() => {
    const a = [...document.querySelectorAll('.arc')];
    const m = a[0].getScreenCTM();
    const heads = [...document.querySelectorAll('.arch')]
      .map(x => { const b = x.getBoundingClientRect(); return Math.hypot(b.width, b.height); });
    return { k: +m.a.toFixed(2),
      w: Math.max(...a.map(x => parseFloat(x.getAttribute('stroke-width')) * m.a)),
      h: Math.max(...heads), hub: document.querySelector('.hubdot').getBoundingClientRect().width,
      dash: (a[0].getAttribute('stroke-dasharray') || '').split(' ').map(v => +v * m.a).join(' ') };
  });
  const arcAt1 = await arcMeas();
  for (let i = 0; i < 25; i++) await page.keyboard.press('Equal');
  await settle(300);
  const arcAtMax = await arcMeas();
  await page.keyboard.press('Digit0');
  await settle(200);
  const arcSame = (a, b) => Math.abs(a - b) <= 0.6;
  ck('arcs, arrowheads, the hub dot and the dash hold their screen size at KMAX',
    arcAtMax.k >= 7.9 && arcSame(arcAt1.w, arcAtMax.w) && arcSame(arcAt1.h, arcAtMax.h)
    && arcSame(arcAt1.hub, arcAtMax.hub) && arcAt1.dash === arcAtMax.dash,
    JSON.stringify({ one: arcAt1, max: arcAtMax }));

  /* …and in a cumulative view it is scoped to that window. The row read the raw
     annual ODM cell and hardcoded `false` for cum in both flowKind and flowBadge,
     while every sibling passes S.cum. Measured at
     `#v=mx&c=1&y=2024&s=HR-14&pp=HR-21`: the rail docked directly above the card
     reads +5.539 and the legend "2011.–2024.", while the card printed
     "2024. · → 463 · ← 213 · neto −250" — 22× smaller, with the cumulative figure
     the reader clicked on no surface of the card, under a solid IZMJERENO pill
     two centimetres from a legend calling the view an estimate. */
  await fresh('#v=mx&c=1&y=2024&s=HR-14&pp=HR-21');
  const pairCum = await page.evaluate(() => (document.querySelector('#pairRow') || {}).textContent || '');
  ck('the corridor card is scoped to the window the view is in',
    /2011\.–2024\./.test(NBSP(pairCum)) && NBSP(pairCum).includes('7.948')
    && NBSP(pairCum).includes('2.409') && NBSP(pairCum).includes('−5.539')
    && /kumulativna procjena/.test(pairCum), pairCum);

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

  /* …and the other half of that sentence, which nothing asserted: that the app
     WRITES the direction it is showing. The check above drives a hand-typed
     literal hash and reads a segment button, so it exercises decodeHash alone,
     and the Nalaz round-trip battery is blind by construction — all three
     direction-bearing presets set dir:'net', which equals BASE.dir and is
     therefore never emitted. Measured: deleting `if (S.dir !== BASE.dir)
     p.set('dir', S.dir)` from encodeHash — one of the six fields that define a
     view — left the whole suite green while every shared Odlasci or Dolasci link
     silently became Neto. A reader who picks Odlasci and copies the address
     hands every recipient, and their own next reload, a different map: Tokovi
     renders "Neto tokovi: Grad Zagreb ↔ partneri" instead of "Grad Zagreb →
     ostale županije", Matrica "neto za redak" instead of "dolasci (stupac →
     redak)", the JLS map "neto po JLS" instead of "odlasci iz JLS" — different
     arcs, different ramp, different numbers.
     Pressed, copied, re-booted: the direction has to survive the round trip in
     each of the three views where it is the whole subject. */
  const dirTrip = [];
  for (const [v, d, want] of [['flow&s=HR-21', 'out', 'ostale'],
    ['mx&s=HR-21&pp=HR-01', 'in', 'dolasci'], ['jmap', 'out', 'odlasci']]) {
    await fresh('#v=' + v + '&c=0&y=2018');
    await click(`#segDir button[data-v="${d}"]`);
    await settle(200);
    const h = await page.evaluate(() => location.hash);
    await fresh(h);
    const seen = await page.evaluate(() => ({
      title: (document.querySelector('.legend-title') || {}).textContent || '',
      dir: (document.querySelector('#segDir button[aria-pressed="true"]') || {}).dataset?.v ?? '',
    }));
    dirTrip.push({ v, d, hash: h, ok: h.includes('dir=' + d) && seen.dir === d
      && seen.title.toLowerCase().includes(want), title: seen.title.slice(0, 46) });
  }
  ck('a direction the reader picked survives into the link and back out of it',
    dirTrip.length === 3 && dirTrip.every(r => r.ok), JSON.stringify(dirTrip));

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
  /* Both routes into a corridor must be the same action. MatrixView re-derived
     App.openCorridor's toggle and dropped its `playing: false`, so pressing a
     cell mid-playback left the film running under the card it had just opened —
     #play stayed pressed and the readout stepped a year every 1,4 s, the badge
     flipping as 2018 went past — while the identical corridor in the rail 40 px
     away stopped it. */
  const drillStop = await page.evaluate(async () => {
    document.querySelector('#play').click();
    await new Promise(r => setTimeout(r, 250));
    const playing = document.querySelector('#play').getAttribute('aria-pressed');
    document.querySelector('.mxc[data-a="HR-21"][data-b="HR-01"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return { playing, after: document.querySelector('#play').getAttribute('aria-pressed'),
      card: !!document.querySelector('#pair') };
  });
  ck('opening a corridor from a matrix cell stops playback, like every other route',
    drillStop.playing === 'true' && drillStop.after === 'false' && drillStop.card,
    JSON.stringify(drillStop));
  await fresh('#v=mx&y=2018&c=0&dir=out');  /* No in-cell number may be wider than the cell it belongs to. `cell >= 22` asks
     whether a number could fit and never whether *this* number does — a
     cumulative −12.169 is seven glyphs where an annual 87 is two. Measured at
     1920×1080 in Kumulativno + Neto, 20 of the 420 numbers rendered wider than
     their own cell and two pairs of adjacent numbers overlapped glyph boxes; the
     figure carried the collision into both export formats. */
  const mxFit = [];
  for (const [vw, vh, h] of [[1920, 1080, '#v=mx&c=1&y=2024&dir=net'],
    [1680, 1050, '#v=mx&c=1&y=2024&dir=net'], [1680, 1050, '#v=mx&c=1&y=2024&dir=out'],
    [1440, 900, '#v=mx&c=1&y=2024&dir=net']]) {
    await page.setViewport({ width: vw, height: vh });
    await fresh(h);
    const r = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('.mxc')];
      const cw = cells[0].getBoundingClientRect().width;
      const wide = [...document.querySelectorAll('.mxnum')]
        .map(t => ({ t: t.textContent, w: t.getBBox().width }))
        .filter(o => o.w > cw);
      return { cw: +cw.toFixed(1), n: document.querySelectorAll('.mxnum').length,
        wide: wide.length, worst: wide.sort((a, b) => b.w - a.w)[0] || null };
    });
    if (r.wide > 0) mxFit.push(vw + 'x' + vh + ' ' + h.slice(1, 12) + ' ' + JSON.stringify(r));
  }
  ck('no matrix in-cell number is drawn wider than its own cell',
    mxFit.length === 0, mxFit.slice(0, 2).join(' | '));
  await page.setViewport({ width: 1440, height: 900 });
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
  /* …and the column closes. The list is the top 12 by arrivals and the row under
     it is the national total, printed adjacently with nothing between them: the
     12 arrival values sum to 43.365 against 56.665 — 13.300 people, 23,5 % — and
     departures 27.322 against 37.485. The sibling Skupine tab teaches the
     opposite, its six group rows summing to its total exactly in all five
     published years, so the pattern a reader learns there misled them here. */
  const zemSum = await page.evaluate(() => {
    const num = t => Number(String(t).replace(/[^\d]/g, '')) || 0;
    const rows = [...document.querySelectorAll('#zemList .jrow')];
    const body = rows.filter(r => !r.classList.contains('zt'));
    const tot = rows.find(r => r.classList.contains('zt'));
    const vals = r => [...r.querySelectorAll('.jv')].map(v => num(v.textContent));
    const sum = body.reduce((a, r) => { const v = vals(r); return [a[0] + v[0], a[1] + v[1]]; }, [0, 0]);
    return { rows: body.length, sum, tot: vals(tot), label: tot.querySelector('.jn').textContent };
  });
  ck('the zemlje column sums to its own total row',
    zemSum.rows === 13 && zemSum.sum[0] === zemSum.tot[0] && zemSum.sum[1] === zemSum.tot[1]
    && /sve zemlje/i.test(zemSum.label), JSON.stringify(zemSum));

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
  /* signed, like every other surface that states this threshold. The legend
     title printed it bare ("prag 4.500" / "prag 1,5 % popisa 2011.") while the
     export caption, the glossary and the aria-valuetext all carry the minus — on
     the one control whose whole job is "how far below zero counts as losing". */
  ck('klas rel legend states % prag', relLeg.includes('−1,5 % popisa 2011.'), relLeg);

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

  /* …and the map has to obey the sentence the check above asserts it prints.
     Nothing in this file tied a colour to the value it encodes. Four lines read
     a data colour at all, and every one is RELATIONAL — the Godine cell equals
     the Saldo county, the matrix rail bar equals the matrix cell — or a bare
     count of distinct legend swatches, so a global inversion satisfies all of
     them. Measured: reversing the three-stop range in divScale, one line, paints
     Grad Zagreb (+41.986, the largest gainer) rgb(186,64,41) and
     Osječko-baranjska rgb(122,138,175) across Saldo, Regije, Godine and
     Matrica-net, under a legend still labelled −44.383 · 0 · +44.383, while
     Klasifikacija still paints Grad Zagreb blue and the glossary still prints
     "Plavo — županija dobiva stanovnike" — two views of the same county
     disagreeing, and the stated rule false — and the suite printed ALL CHECKS
     PASS. Swapping KCOL's gain/loss did too, and so did swapping the sequential
     ramp's endpoints.
     Compared against the stylesheet's own --gain/--loss so the palette keeps one
     source of truth and a deliberate re-skin moves both together, and decided
     here rather than in the page so the arithmetic is written once. Nearest-of-
     two rather than exact: the ramp is an Lab interpolation and only its
     DIRECTION is the claim being made — the relational checks cover the rest. */
  const rgb = c => {
    const m = /(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(String(c));
    if (m) return [+m[1], +m[2], +m[3]];
    const h = /^#?([0-9a-fA-F]{6})$/.exec(String(c).trim());
    return h ? [0, 2, 4].map(i => parseInt(h[1].slice(i, i + 2), 16)) : null;
  };
  /* 'gain' | 'loss' | null — which of the two tokens the fill sits nearer */
  const side = (fill, gain, loss) => {
    const f = rgb(fill), g = rgb(gain), l = rgb(loss);
    if (!f || !g || !l) return null;
    const d = q => Math.hypot(f[0] - q[0], f[1] - q[1], f[2] - q[2]);
    return d(g) < d(l) ? 'gain' : 'loss';
  };
  const tokens = () => page.evaluate(() => {
    const t = getComputedStyle(document.documentElement);
    return { gain: t.getPropertyValue('--gain').trim(), loss: t.getPropertyValue('--loss').trim() };
  });
  /* The tilt of a colour: blue minus red. A sequential ramp runs from the same
     near-white to one end or the other, so every county on it is faintly tinted
     and the LIGHTNESS carries the value while the tilt carries the direction —
     which is the claim under test. Averaged over the counties rather than taken
     from the extreme one, because at these tints the plain RGB distance between
     the two tokens is only ~11 units apart and would decide the question on
     noise. */
  const tilt = c => { const q = rgb(c); return q ? q[2] - q[0] : 0; };
  const meanTilt = async () => {
    const cs = await page.evaluate(() => [...document.querySelectorAll('.cnt')].map(e => getComputedStyle(e).fill));
    return cs.length ? cs.reduce((a, c) => a + tilt(c), 0) / cs.length : 0;
  };

  await fresh('#v=saldo&c=1&y=2024');
  const pal = await tokens();
  const divCol = await page.evaluate(() => ({
    /* the largest gainer and the largest loser on this exact view */
    hr21: getComputedStyle(document.querySelector('.cnt[data-iso="HR-21"]')).fill,
    hr14: getComputedStyle(document.querySelector('.cnt[data-iso="HR-14"]')).fill,
  }));
  const divSide = { up: side(divCol.hr21, pal.gain, pal.loss), down: side(divCol.hr14, pal.gain, pal.loss) };
  ck('a gaining county is painted the gain colour and a losing one the loss colour',
    !!pal.gain && !!pal.loss && divSide.up === 'gain' && divSide.down === 'loss',
    JSON.stringify({ ...pal, ...divCol, ...divSide }));

  /* …and the three-class palette, a second scale making the same claim in words:
     the swatch beside "pobjednice" has to be the gain colour. */
  await fresh('#v=klas&c=1&y=2024');
  const klasSw = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#legend *')].filter(r => r.querySelector
      && r.querySelector('.legend-sw') && r.querySelectorAll('.legend-sw').length === 1);
    const pick = re => {
      const r = rows.find(x => re.test(x.textContent));
      return r ? getComputedStyle(r.querySelector('.legend-sw')).backgroundColor : '';
    };
    return { rows: rows.length, win: pick(/pobjednice/), lose: pick(/gubitnice/) };
  });
  const klasSide = { w: side(klasSw.win, pal.gain, pal.loss), l: side(klasSw.lose, pal.gain, pal.loss) };
  ck('the “pobjednice” swatch is the gain colour and “gubitnice” the loss colour',
    klasSw.rows >= 3 && klasSide.w === 'gain' && klasSide.l === 'loss',
    JSON.stringify({ ...klasSw, ...klasSide }));

  /* …and the sequential ramp, whose whole meaning is which end it runs to. */
  await fresh('#v=flow&s=HR-21&c=0&y=2018&dir=in');
  const rampIn = await meanTilt();
  await fresh('#v=flow&s=HR-21&c=0&y=2018&dir=out');
  const rampOut = await meanTilt();
  const want = { gain: Math.sign(tilt(pal.gain)), loss: Math.sign(tilt(pal.loss)) };
  ck('the arrivals ramp runs to the gain colour and the departures ramp to the loss colour',
    want.gain !== 0 && want.loss !== 0 && want.gain !== want.loss
    && Math.sign(rampIn) === want.gain && Math.sign(rampOut) === want.loss,
    JSON.stringify({ rampIn: Math.round(rampIn), rampOut: Math.round(rampOut), ...want }));
  /* The page must opt out of the browser's own dark-mode rewrite. Without a
     declaration Chrome applies Auto Dark Theme to an Android reader in dark
     mode, which inverts the HTML and leaves the SVG alone: measured under
     force-dark, the 21 county fills are byte-identical while .legend-bar is
     darkened in its light half only — 40 % rgb(236,203,190) → rgb(81,56,46),
     50 % rgb(240,237,233) → rgb(46,44,41) — so the diverging key's zero point
     renders near-black while the counties it decodes render near-white. */
  const cs = await page.evaluate(() => ({
    root: getComputedStyle(document.documentElement).colorScheme,
    body: getComputedStyle(document.body).colorScheme,
  }));
  /* Chrome normalises the computed value's word order, so match on both tokens
     rather than on the authored spelling. */
  ck('the page declares its colour scheme, so a browser cannot re-tint the key alone',
    /only/.test(cs.root) && /light/.test(cs.root) && !/dark/.test(cs.root), JSON.stringify(cs));  /* An empty live region must still be IN the accessibility tree. `:empty
     {display:none}` is equivalent to not being in the DOM for live-region
     registration, so the mitigation StoryBar's own comment describes — "a live
     region that enters the DOM already populated is not guaranteed to announce" —
     was cancelled by the stylesheet. Measured with CDP: empty, #storyBar and
     #citzClamp and #jstatus each reported {role:"none", ignored:true,
     reason:["notRendered"]}. So picking a Nalaz, or hitting a failed geometry
     chunk — which surfaces the only retry button in the app — announced nothing. */
  const probeLive = sels => page.evaluate(sels => sels.map(sel => {
    const e = document.querySelector(sel);
    return { sel, there: !!e, display: e ? getComputedStyle(e).display : null,
      role: e ? e.getAttribute('role') : null,
      empty: e ? e.textContent.trim() === '' : null };
  }), sels);
  await fresh('#cz=1');
  const liveEmpty = await probeLive(['#storyBar', '#citzClamp']);
  /* …and the third region, which is the one the comment above is really about.
     #jstatus is mounted only in the JLS map and Regije, so a probe run at
     `#cz=1` could never see it — two of the three regions the :empty rules cover
     were sampled, and the one guarding the app's ONLY retry affordance was not.
     Measured: re-merging the two rules into `display:none` — the pre-cc8bec5
     shape, and the obvious CSS tidy — leaves #jstatus computing display:none
     while empty and this check green, so a reader in Regije on a failing
     connection gets an error and a #jretry button rendered into a region that
     enters the AX tree already populated, which is exactly the case the
     always-mounted design exists to prevent. */
  await fresh('#v=reg&c=1&y=2024');
  const liveGeo = await probeLive(['#jstatus']);
  ck('an empty live region stays rendered, so it is registered before it speaks',
    [...liveEmpty, ...liveGeo].length === 3
    && [...liveEmpty, ...liveGeo].every(r => r.there && r.empty && r.display !== 'none' && r.role === 'status'),
    JSON.stringify([...liveEmpty, ...liveGeo]));
  await fresh('');
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
  /* The row label, read off the table rather than off the whole tip: the caveat
     under it now runs unconditionally (it describes a row that is drawn in every
     view), and it says the words — "nije ukupna promjena broja stanovnika" — in
     order to deny them. Asserting their absence over the whole tip therefore
     failed on the sentence that makes the point. Both halves are checked: the
     row is renamed, and the caveat is still there saying what it is not. */
  const tipRows = await page.evaluate(() => (document.querySelector('#tip table') || {}).textContent || '');
  ck('tooltip renames "ukupna promjena" to the honest sum label',
    tipRows.includes('mig. + prirodno') && !tipRows.includes('ukupna promjena')
    && /nije ukupna promjena broja stanovnika/.test(pctTip),
    JSON.stringify({ rows: tipRows.slice(-40), tip: pctTip.slice(-60) }));

  /* …and it names the denominator the reader actually chose. `countyBlock` did
     not read S.den at all: in `d=relest` the legend's axis ended at ±20,6 %, the
     rail row read Vukovarsko-srijemska −20,6 % and so did the path's aria-label,
     while the tooltip under the cursor said −15,8 % — the darkest county on the
     map reporting the wrong number, and switching Vrijednosti recoloured
     everything except the readout. */
  await fresh('#v=saldo&d=relest&c=1&y=2024');
  await page.hover('path[data-iso="HR-16"]');
  await settle(150);
  const pctRel = await page.evaluate(() => ({
    tip: document.querySelector('#tip').textContent,
    aria: document.querySelector('path[data-iso="HR-16"]').getAttribute('aria-label'),
  }));
  const relPct = (NBSP(pctRel.aria).match(/−[\d,]+ %/) || [''])[0];
  ck('the tooltip percentage uses the denominator the reader chose',
    !!relPct && NBSP(pctRel.tip).includes(relPct) && NBSP(pctRel.tip).includes('% tek. procjene'),
    JSON.stringify({ relPct, aria: pctRel.aria, tip: NBSP(pctRel.tip).slice(-70) }));

  /* ── a grid taller than its box is recoverable, and exports whole ──
     Matrica and Godine lay out on a fixed cell geometry with a 12 px hit floor
     rather than fitting a projection to the box, so on a short window the grid
     is taller than the box and #map's overflow:hidden crops it. That trade is
     documented in three places, and all three pay for it with the same promise:
     "the shared zoom/pan recovers an off-box grid". It did not. `fit` clamped
     the pan to the VIEWPORT — `y ≥ h − k*h` — so a row below the box painted no
     higher than `k*u + h − k*h`, which exceeds h for every u > h at every k ≥ 1,
     and panBy is a no-op at k = 1. Measured at 1366×657: 14 of 21 rows on
     screen, and five zoom-ins with twenty pans down each took the last row's top
     from 330 px to 820 px against a 260 px box, 2 rows left. Six counties were
     on the page, focusable and arrow-reachable, and unreachable by eye. At
     1280×610 it was eleven.
     The exported figure inherited the same crop from `clientHeight`: 140 of 420
     cells — seven whole counties — cut flush at the frame under a title that
     still says MATRICA TOKOVA, beside a complete column axis. */
  await page.setViewport({ width: 1366, height: 657 });
  await fresh('#v=mx&c=0&y=2018&dir=out');
  const tallGrid = await page.evaluate(async () => {
    const rowsIn = () => {
      const svg = document.querySelector('#map'), sr = svg.getBoundingClientRect();
      const cells = [...document.querySelectorAll('.mxc')];
      const vis = cells.filter(c => {
        const b = c.getBoundingClientRect();
        return b.top >= sr.top - 1 && b.bottom <= sr.bottom + 1;
      });
      return { all: new Set(cells.map(c => c.getAttribute('data-a'))).size,
        vis: new Set(vis.map(c => c.getAttribute('data-a'))).size };
    };
    const at1 = rowsIn();
    /* one press of the zoom-out key — the affordance a reader has */
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const out = rowsIn();
    const badge = !!document.querySelector('#zoomRst');
    /* and the export, back at 1× where the crop was silent */
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const s = window.__exportSVG(false);
    const d = new DOMParser().parseFromString(s, 'image/svg+xml');
    const inner = d.querySelector('svg[y]');
    const ih = inner ? +inner.getAttribute('height') : 0;
    const cells = [...d.querySelectorAll('.mxc')];
    const clipped = cells.filter(c => +c.getAttribute('y') + +c.getAttribute('height') > ih + 0.5);
    return { at1, out, badge, expCells: cells.length, expClipped: clipped.length,
      expRowsClipped: new Set(clipped.map(c => c.getAttribute('data-a'))).size };
  });
  ck('a matrix taller than its box is recoverable by one zoom-out, and exports whole',
    tallGrid.at1.all === 21 && tallGrid.at1.vis < 21 && tallGrid.out.vis === 21
    && tallGrid.badge && tallGrid.expCells === 420 && tallGrid.expClipped === 0,
    JSON.stringify(tallGrid));
  await page.setViewport({ width: 1440, height: 900 });

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
  /* …and says which of the two it is. countyAria exists because "the map's
     tooltip is a visual-only div" — it is the AT rendering of the very tooltip
     that appends the measured/estimate pill — and neither it nor cellAria ever
     carried the badge. At #v=mx&y=2003 all 420 gridcells announced an IPF-fitted
     number as a bare figure, under a glossary that says these are the atlas's
     own computation and must not be passed on as CBS figures. */
  const ariaBadge = [];
  for (const [h, sel, want] of [
    ['#v=mx&y=2018&c=0&dir=out', '.mxc[tabindex="0"]', 'izmjereno'],
    ['#v=mx&y=2003&c=0&dir=out', '.mxc[tabindex="0"]', 'procjena'],
    ['#v=mx&y=2018&c=1', '.mxc[tabindex="0"]', 'kumulativna procjena'],
    ['#v=flow&s=HR-21&y=2018&c=0&dir=out', '.cnt[data-iso="HR-01"]', 'izmjereno'],
    ['#v=flow&s=HR-21&y=2003&c=0&dir=out', '.cnt[data-iso="HR-01"]', 'procjena'],
  ]) {
    await fresh(h);
    const lab = await page.evaluate(x => (document.querySelector(x) || {}).getAttribute?.('aria-label') || '', sel);
    if (!lab.includes(want)) ariaBadge.push(h + ' want=' + want + ' got=' + lab.slice(-40));
  }
  ck('the accessible name carries the same honesty badge the tooltip shows',
    ariaBadge.length === 0, ariaBadge.slice(0, 3).join(' | '));
  /* the loop above ends on a Tokovi hash; put the matrix back for the block below */
  await fresh('#v=mx&y=2018&c=0&dir=out');
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

  /* ── one detent is one detent, whatever unit the engine reports it in ──
     UI Events defines three units for deltaY and the handler read only one.
     Gecko reports an ordinary wheel mouse in LINES on Windows and Linux
     (deltaMode 1, ~3 per notch) and in PAGES under "scroll one screen at a
     time" (deltaMode 2, 1 per notch); Blink, and Gecko on macOS, report pixels
     (~100). Fed raw into the exponent, one line notch multiplied k by
     2^(3/400) = 1,0052 against a pixel notch's 1,1892 — measured on the shipped
     build, the twelve notches that carry Blink from 1× to KMAX reached 1,064 in
     line mode, a 6 % change nobody can see, and the full range took about 400
     notches (1.200 in page mode). The wheel is preventDefault-ed either way, so
     the page would not scroll under the cursor instead: the glossary's "isto
     radi kotačić miša" simply read as dead in the second-largest desktop
     engine.
     No check could ever have seen it: both of the suite's wheel synthesisers
     construct a WheelEvent without deltaMode, so every wheel it has ever
     dispatched was in pixels. This one spins all three. */
  const wheelUnits = {};
  for (const [mode, dy, label] of [[0, -100, 'px'], [1, -3, 'line'], [2, -1, 'page']]) {
    await fresh('#v=saldo&c=1&y=2024');
    wheelUnits[label] = await page.evaluate(async (mode, dy) => {
      const svg = document.querySelector('#map');
      const r = svg.getBoundingClientRect();
      for (let i = 0; i < 12; i++) {
        svg.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, deltaMode: mode,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
        await new Promise(x => setTimeout(x, 25));
      }
      await new Promise(x => setTimeout(x, 150));
      const g = svg.querySelector('g[transform]');
      return +(/scale\(([\d.]+)\)/.exec(g.getAttribute('transform')) || [0, '1'])[1];
    }, mode, dy);
  }
  /* twelve notches is exactly the range in pixels, so the other two units have
     to arrive within a notch of it rather than at some fraction of it */
  ck('the wheel zooms the same per detent in pixel, line and page units',
    wheelUnits.px >= 7.9 && wheelUnits.line >= 7 && wheelUnits.page >= 7,
    JSON.stringify(wheelUnits));

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
    return { bad, n: els.length, ids: els.map(e => e[0]) };
  });
  const zr = await overlaps();
  const zrHas = await page.evaluate(() => !!document.querySelector('#zoomRst'));
  ck('zoom reset is mounted while zoomed and clears the corridor card',
    zrHas && zr.bad.length === 0, zr.bad.join(' | ') + ' (' + zr.n + ' overlays)');
  /* A count floor cannot see an element that was never admitted — the same
     circularity this file already diagnoses for allOv(): `zr.n` comes from the
     very list `zr.bad` is derived from, so an id the filter drops can neither
     raise `bad` nor lower `n` below the floor. Measured in this state the real
     set is six — #labBtn, #helpBtn, #zoomRst, #pair, #jcard, #legend — so a
     >= 4 floor tolerated losing two more, and losing #pair is losing the very
     element whose collision with #zoomRst this block exists for. Name the ids. */
  ck('the overlay sweep compared a real set of overlays',
    zr.n >= 4 && ['#labBtn', '#helpBtn', '#zoomRst', '#pair', '#legend'].every(i => zr.ids.includes(i)),
    JSON.stringify(zr.ids));

  /* …and it compared them at ONE root font size, which is the size at which the
     top strip happened to fit. `.helpbtn{right:108px}` reserved a literal for a
     labels button whose own width is rem-driven, so the reserve was fixed and
     the box it reserved for was not. Measured at 1440×900 as the gap between
     #labBtn's left edge and the "?"'s right: +15,9 px at Chrome's default 16 px
     root, +1,3 px at "Large" (20 px), −13,2 px at "Very large" (24 px) — where
     elementFromPoint at the centre of #helpBtn returned #labBtn and the glossary
     handed its click to the labels toggle. Both locales, and a coarse pointer
     overlapped from 20 px on.
     Every preset the browser offers, then, on both pointer types, and asserting
     the hit as well as the geometry: an 8 px sliver that still overlaps is not a
     button. #labBtn is display:none below 900 px and under the coarse rule, so
     its absence is a pass and only the two that remain are compared. */
  const stripCdp = await page.createCDPSession();
  const strip = [];
  for (const touch of [false, true]) {
    for (const fs of [16, 20, 24]) {
      await page.setViewport({ width: 1440, height: 900, hasTouch: touch, isMobile: false });
      await stripCdp.send('Page.setFontSizes', { fontSizes: { standard: fs, fixed: fs } });
      await fresh('#v=saldo&c=1&y=2024');
      await page.evaluate(() => document.querySelector('#map').dispatchEvent(
        new WheelEvent('wheel', { deltaY: -300, clientX: 400, clientY: 300, bubbles: true, cancelable: true })));
      await settle(350);
      strip.push({ fs, touch, ...await page.evaluate(() => {
        const box = id => { const e = document.querySelector(id); if (!e) return null;
          const b = e.getBoundingClientRect(); return b.width ? b : null; };
        const hit = id => { const b = box(id); if (!b) return 'absent';
          const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return h ? (h.id || h.tagName) : null; };
        const help = box('#helpBtn'), lab = box('#labBtn'), zr2 = box('#zoomRst');
        return { gapLab: lab && help ? +(lab.left - help.right).toFixed(1) : null,
          gapZr: zr2 && help ? +(help.left - zr2.right).toFixed(1) : null,
          hits: [hit('#helpBtn'), hit('#labBtn'), hit('#zoomRst')] };
      }) });
    }
  }
  await stripCdp.detach();
  await page.setViewport({ width: 1440, height: 900 });
  ck('the map top strip keeps its three controls apart at every browser font preset',
    strip.length === 6 && strip.every(r =>
      (r.gapLab === null || r.gapLab >= 0) && r.gapZr !== null && r.gapZr >= 0
      && r.hits[0] === 'helpBtn' && (r.hits[1] === 'absent' || r.hits[1] === 'labBtn')
      && r.hits[2] === 'zoomRst'),
    JSON.stringify(strip));

  /* ── help panel: the one stable glossary ── */
  await fresh('');
  await click('#helpBtn');
  const help = await page.evaluate(() => document.querySelector('#helpCard')?.textContent || '');
  ck('help panel defines saldo, IPF and JLS in one place',
    help.includes('saldo') && help.includes('iterativno') && help.includes('gradovi i općine'), help.slice(0, 60));
  ck('help panel states the mig+prirodno caveat',
    help.includes('nije jednako ukupnoj promjeni'), '');
  /* …and while it is open the year slider says so. App's keydown returns on
     `s.help` before it reaches the #spark jump keys or the bare-arrow year step,
     and #spark has no handler of its own — but above 900 px the dialog is
     non-modal, so it stayed reachable with tabindex="0", role="slider",
     aria-valuenow and no aria-disabled. Measured: focus it with the glossary
     open, press ArrowRight then End, and #bigYear does not move. */
  const sparkFrozen = await page.evaluate(async () => {
    const sp = document.querySelector('#spark');
    const before = document.querySelector('#bigYear').textContent;
    return { dis: sp.getAttribute('aria-disabled'), ti: sp.getAttribute('tabindex'),
      before, after: (await new Promise(r => setTimeout(() => r(document.querySelector('#bigYear').textContent), 50))) };
  });
  ck('the year slider reports itself disabled while the glossary owns the keyboard',
    sparkFrozen.dis === 'true' && sparkFrozen.ti === '-1', JSON.stringify(sparkFrozen));
  /* The page mounts Vercel Web Analytics and Speed Insights and said so nowhere
     a reader could see it: grepping every source file for privatnost|privacy|
     GDPR|cookie|consent|analytics returned the package name and the two mounts
     and nothing else. A page that names four upstream sources, three licences, a
     DOI, the author and the copyright year had no line saying it collects
     anything. Both surfaces are checked, because the point is that they agree. */
  const privacy = await page.evaluate(() => ({
    help: document.querySelector('#helpCard')?.textContent || '',
    foot: document.querySelector('.ft')?.textContent || '',
  }));
  ck('the glossary and the footer both disclose what the page measures',
    /Privatnost/.test(privacy.help) && /Vercel Web Analytics/.test(privacy.help)
    && /kolači/i.test(privacy.help) && /fragmentu URL-a/.test(privacy.help)
    && /Vercel Web Analytics/.test(privacy.foot),
    JSON.stringify({ help: privacy.help.length, foot: privacy.foot.slice(-90) }));

  /* …and the sentence has to be TRUE, which the check above cannot ask. Both
     beacons ship `location.href`, fragment and all: measured against the real
     deployed scripts, with the vendor's automation guard masked, every beacon
     URL read
     `http://…/#v=flow&c=0&y=2018&s=HR-21&pp=HR-01` — the view, the year, the hub
     and the corridor partner — on the page-view POST and on all three Web
     Vitals, to the same edge the note says derives a country from the IP, while
     the glossary promised the fragment is one "a browser never sends to a
     server". The platform routes are stubbed to a comment here, so no beacon can
     be observed; what CAN be observed is the redaction the app installs. Both
     packages queue it on window before their script loads, so it is called with
     a real fragment-bearing URL and the result is asserted to carry none. */
  const redact = await page.evaluate(() => {
    const run = q => {
      const e = (q || []).find(x => Array.isArray(x) && x[0] === 'beforeSend');
      if (!e || typeof e[1] !== 'function') return null;
      const out = e[1]({ type: 'pageview', url: location.origin + '/#v=flow&c=0&y=2018&s=HR-21&pp=HR-01' });
      return out && typeof out.url === 'string' ? out.url : null;
    };
    return { hash: location.hash, va: run(window.vaq), si: run(window.siq) };
  });
  ck('and neither beacon can carry the view state off the device',
    redact.hash.length > 10 && typeof redact.va === 'string' && !redact.va.includes('#')
    && typeof redact.si === 'string' && !redact.si.includes('#'),
    JSON.stringify(redact));

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
  /* Driven from the picker rather than from a literal 15. Nothing asserted
     STORIES.length, so deleting a preset simply meant the loop stopped at the
     one before it and the check went on printing "all 15" over 14. */
  await fresh('');
  const nStory = await page.evaluate(() => document.querySelectorAll('#story option').length - 1);
  const trip = [];
  for (let i = 0; i < nStory; i++) {
    await fresh('');
    await page.select('#story', String(i));
    await settle(260);
    const h = await page.evaluate(() => location.hash);
    await fresh(h);
    const kept = await page.evaluate(() => !!document.querySelector('#storyCap'));
    if (!kept) trip.push((i + 1) + ':' + h);
  }
  ck('every Nalaz round-trips through its own permalink, and there are still 15',
    trip.length === 0 && nStory === 15, nStory + ' presets · ' + trip.join(' | '));

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

  /* …and the docked one has to live inside the rail's height budget. It was
     given `max-height:none;overflow-y:visible` on the reasoning that "docked in
     the rail there is no dock to clear" — true, and it dropped the rail's own
     budget with the chip dock's. As a flex item its `min-height:auto` resolves
     to min-content, so it never shrank: measured 236 px at every window from
     1024×600 to 1920×1080, with .rail-list absorbing the whole deficit. At
     1440×900 that left 6 of the 20 corridor rows, at 1366×768 one, and at
     1366×657, 1280×720 and 1280×609 the ranking was a 4 px strip with none —
     while all 20 rows stayed tabbable, so focusing the fourth left 4 px of a
     29 px row inside the scroller (2.4.11). Worse, the rail leaked: #railYear,
     which states the period and the honesty badge, ended 21 px BELOW the rail
     box and .rail-hint 71 px below it, painted under svg#spark — a control that
     sets the year on pointerdown. Measured at the tightest window the sweeps
     use. */
  await page.setViewport({ width: 1366, height: 657 });
  await fresh('#v=mx&c=0&y=2018&dir=net&s=HR-14&pp=HR-21');
  const railBudget = await page.evaluate(async () => {
    const rail = document.querySelector('.rail').getBoundingClientRect();
    const list = document.querySelector('.rail-list').getBoundingClientRect();
    const card = document.querySelector('.paircard');
    const rows = [...document.querySelectorAll('#railList .rrow')];
    const vis = rows.filter(r => {
      const b = r.getBoundingClientRect();
      return b.top >= list.top - 1 && b.bottom <= list.bottom + 1;
    }).length;
    rows[3].focus();
    await new Promise(r => setTimeout(r, 150));
    const fb = rows[3].getBoundingClientRect();
    const inside = Math.max(0, Math.min(list.bottom, fb.bottom) - Math.max(list.top, fb.top));
    const below = sel => {
      const e = document.querySelector(sel);
      return e ? Math.round(e.getBoundingClientRect().bottom - rail.bottom) : -999;
    };
    return { rows: rows.length, vis, list: Math.round(list.height),
      cardScrolls: card.scrollHeight > card.clientHeight + 1 || card.getBoundingClientRect().height < 236,
      focusInside: Math.round(inside), rowH: Math.round(fb.height),
      yr: below('#railYear'), hint: below('.rail-hint') };
  });
  ck('the docked corridor card leaves the ranking a share of the rail, and nothing below it',
    railBudget.rows === 20 && railBudget.vis >= 1 && railBudget.list >= 50
    && railBudget.cardScrolls && railBudget.focusInside >= railBudget.rowH - 1
    && railBudget.yr <= 0 && railBudget.hint <= 0,
    JSON.stringify(railBudget));
  await page.setViewport({ width: 1440, height: 900 });

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
  /* 901×800 and 901×760 are in the list for a reason the others are not: they
     are where `.map-stage` is squeezed BELOW `.map-box`'s own 180 px floor by a
     corridor card in flow, so a guard keyed on the box could not see it.
     Measured before the fix, 901×800 touch: stage 140 px against a floored
     180 px box, the stage-anchored dock at y=459 inside the top strip's 445–489
     lane, and elementFromPoint at the centre of #ageHd returning #helpBtn. */
  const shortStage = [];
  for (const [w, h, touch] of [[1024, 768, true], [1024, 768, false], [1280, 700, false],
    [901, 800, true], [901, 760, true], [930, 800, true],
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
  /* …and the outcome, not only the hit test: a real touchscreen tap on the
     centre of "Dob i spol" has to open the age panel. Measured before the fix at
     901×800 with a coarse pointer and a corridor open, it opened the GLOSSARY —
     the strip is z-index 6 against the dock's 4, so it took the tap — while the
     `stage-tight` class that reflows the dock could never apply, because its
     114/174 px thresholds sat under a floor the measured box could not go below.
     The threshold also read `pointer:coarse` while every 44 px token it is sized
     against reads `any-pointer:coarse`; on a touch laptop those disagree. */
  await page.setViewport({ width: 901, height: 800, isMobile: false, hasTouch: true });
  await fresh('#v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0');
  const tightTap = await page.evaluate(() => {
    const e = document.querySelector('#ageHd');
    const b = e.getBoundingClientRect();
    return { at: [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)],
      cls: document.querySelector('.map-wrap').className,
      stageH: Math.round(document.querySelector('.map-stage').getBoundingClientRect().height),
      boxH: Math.round(document.querySelector('.map-box').getBoundingClientRect().height) };
  });
  await page.touchscreen.tap(tightTap.at[0], tightTap.at[1]);
  await settle(300);
  const tightOpened = await page.evaluate(() => ({
    help: !!document.querySelector('#helpCard'),
    age: document.querySelector('#agec').classList.contains('open') }));
  ck('a tap on the age chip opens the age panel where the stage is squeezed under the box’s floor',
    tightTap.stageH < tightTap.boxH && tightTap.cls.includes('stage-tight')
    && tightOpened.age && !tightOpened.help,
    JSON.stringify({ ...tightTap, ...tightOpened }));
  await page.setViewport({ width: 1440, height: 900 });

  /* ── a finger on a device whose PRIMARY pointer is a mouse ──
     A touch laptop, a Surface, an iPad with a trackpad: `(pointer:coarse)` is
     false because the primary pointer is fine, while `(any-pointer:coarse)` is
     true — which is the device class index.css says it moved its 44 px tokens to.
     Every JS touch affordance keyed on the primary flag, decided once at module
     init, so all of them were off on exactly that device while the coarse layout
     was on. Measured at 1440×900 with the primary-pointer query pinned false:
     a tap on a matrix cell painted the readout Tooltip's own note calls "the only
     value readout" as a 238×118 panel at (0,0) over the header, describing a cell
     651 px away; the same tap in Godine gave 260×272 at (0,0) and on a county
     260×302 — the tip that on a finger is meant to be dropped outright. And each
     tap ACTED: the matrix drill fired, taking the hash to `…&s=HR-18&pp=HR-09`,
     and the Godine tap changed the year — the navigation both views document as
     pointer-only because "a tap that navigates is a tap that misfires" on a
     15,7 px cell.
     matchMedia is patched rather than emulated because puppeteer cannot serve
     the two pointer queries different answers, and that disagreement IS the
     device. */
  const hybrid = await (async () => {
    const pg = await watch(await browser.newPage());
    await pinHr(pg);
    await pg.emulateTimezone('Europe/Zagreb');
    await pg.setViewport({ width: 1440, height: 900, hasTouch: true, isMobile: false });
    await pg.evaluateOnNewDocument(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = q => (/\(\s*pointer\s*:\s*coarse\s*\)/.test(q) && !/any-pointer/.test(q)
        ? { matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
        : real(q));
    });
    const cdp = await pg.createCDPSession();
    const out = [];
    for (const [h, sel, label] of [
      ['#v=mx&c=1&y=2018', '.mxc[data-a="HR-18"][data-b="HR-09"]', 'mx'],
      ['#v=yrs&c=1&y=2024', '.yrc[data-iso="HR-21"][data-y="2011"]', 'yrs'],
      ['#v=saldo&c=1&y=2024', '.cnt[data-iso="HR-18"]', 'cnt']]) {
      await pg.goto(url + h, { waitUntil: 'networkidle0' });
      await pg.waitForFunction(() => !!document.querySelector('#map'), { timeout: 15000 }).catch(() => {});
      await settle(500);
      const env = await pg.evaluate(() => ({ ptr: matchMedia('(pointer:coarse)').matches,
        any: matchMedia('(any-pointer:coarse)').matches }));
      const at = await pg.evaluate(q => {
        const e = document.querySelector(q);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      }, sel);
      if (!at) { out.push({ label, absent: true }); continue; }
      const before = await pg.evaluate(() => location.hash);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at[0], y: at[1] }] });
      await settle(150);
      const tip = await pg.evaluate(() => {
        const t = document.querySelector('#tip'), r = t.getBoundingClientRect();
        return { show: t.classList.contains('show'), left: t.style.left,
          x: Math.round(r.x), y: Math.round(r.y) };
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await settle(200);
      const after = await pg.evaluate(() => location.hash);
      out.push({ label, ...env, at, tip, acted: before !== after,
        placed: tip.show && tip.left !== '' && Math.abs(tip.x - at[0]) < 400 && Math.abs(tip.y - at[1]) < 400 });
    }
    await pg.close();
    return out;
  })();
  const hy = Object.fromEntries(hybrid.map(r => [r.label, r]));
  ck('a finger on a hybrid device places the readout it summons, and does not navigate with it',
    hybrid.length === 3 && hybrid.every(r => !r.absent && r.ptr === false && r.any === true)
    /* the two grids: the tip is their only readout, so it must be placed — and
       the tap must not fire the drill they call pointer-only */
    && hy.mx.placed && !hy.mx.acted
    && hy.yrs.placed && !hy.yrs.acted
    /* the county map: the tip is deliberately dropped for a finger, because the
       detail card carries the same numbers and opens above the map */
    && !hy.cnt.tip.show,
    JSON.stringify(hybrid));

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
  /* Widened in both dimensions and across both pointer types. This ran 901-960 x
     700-820 with the suite's default fine pointer, so it was blind to every width
     above 960 and to the coarse pointer entirely — where --hbw and --chiph both
     double and the two lanes collide far sooner. Measured before the shared
     budget, coarse: 901x600 #helpBtn x #citzHd = 1.452 px2 and #labBtn x #citzHd
     = 1.728; 960x600 = 1.848; 1024x600 #helpBtn x #ageHd = 1.012; 1280x600 and
     1440x600 = 440; 1920x500 = 1.056; and 901x700 — inside this sweep's own band
     — 396 px2. The strip is z-index 6 against the dock's 4, so it took the tap:
     at 1024x600 coarse, pressing the centre of "Dob i spol" opened the glossary. */
  const labBand = [];
  for (const [w, h, touch] of [[901, 700, false], [921, 700, false], [941, 700, false],
    [960, 700, false], [901, 768, false], [941, 820, false],
    [901, 600, true], [960, 600, true], [1024, 600, true], [1280, 600, true],
    [1440, 600, true], [901, 700, true], [1024, 700, true], [1440, 700, true]]) {
    await page.setViewport({ width: w, height: h, hasTouch: touch, isMobile: touch });
    await fresh('#v=flow&s=HR-21&pp=HR-01&dir=net&y=2018&c=0');
    const reach = await page.evaluate(() => {
      const out = {};
      for (const id of ['#labBtn', '#ageHd', '#citzHd']) {
        const e = document.querySelector(id);
        /* `display:none` in the scrolling layout is absent, not covered — and in
           that layout the dock is in normal flow, so a control can simply be
           below the fold. elementFromPoint is viewport-relative, so bring it into
           view first, which is what a reader does. */
        if (!e || !e.getClientRects().length) { out[id] = 'absent'; continue; }
        e.scrollIntoView({ block: 'center' });
        const b = e.getBoundingClientRect();
        out[id] = [[0.1, 0.5], [0.3, 0.5], [0.5, 0.5], [0.7, 0.5], [0.9, 0.5]].filter(([fx, fy]) => {
          const hit = document.elementFromPoint(b.left + b.width * fx, b.top + b.height * fy);
          return hit && (hit === e || e.contains(hit));
        }).length;
      }
      const lb = document.querySelector('#labBtn');
      const b = (lb || document.querySelector('#helpBtn')).getBoundingClientRect();
      out.at = [b.left + b.width / 2, b.top + b.height / 2];
      return out;
    });
    await page.mouse.click(reach.at[0], reach.at[1]);
    await settle(280);
    const after = await page.evaluate(() => ({ hash: location.hash,
      lb: (document.querySelector('#labBtn') || {}).getAttribute?.('aria-pressed') ?? null }));
    /* `.labbtn` is display:none in the scrolling layout, which some of the coarse
       viewports below now take — so the rule is "every control that IS mounted
       takes its own click", and the labels assertions only apply where the
       button exists. */
    const mounted = k => reach[k] === 'absent' || reach[k] === 5;
    const hasLab = reach['#labBtn'] !== 'absent';
    if (!mounted('#labBtn') || !mounted('#ageHd') || !mounted('#citzHd')
      || reach['#ageHd'] === 'absent' || reach['#citzHd'] === 'absent'
      || (hasLab && (after.lb !== 'true' || !/lb=1/.test(after.hash)))
      || /[&#](ag|cz)=/.test(after.hash)) {
      labBand.push(`${w}x${h}${touch ? ' touch' : ''} lab${reach['#labBtn']} age${reach['#ageHd']} citz${reach['#citzHd']} → ${after.hash}`);
    }
  }
  ck('the labels toggle and both chip headers each take their own click, fine and coarse',
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

  /* …and scrubbing it must not write history faster than an engine will take.
     WebKit's budget is 100 pushState+replaceState calls per rolling 30 s — 3,3 a
     second — and it THROWS SecurityError past it, from inside the hash-sync
     effect, which React routes to the root ErrorBoundary: the whole working
     atlas replaced by the render-failure card after a few seconds of the app's
     central interaction. Chrome and Firefox drop the excess silently instead,
     which is the same bug one register quieter — the address bar stops tracking
     the view, so a link copied off it is a permalink to the wrong year.
     Measured unthrottled on this build: 334 replaceState calls in 4 s of held
     arrow keys and 180 in a 5 s drag, i.e. 36–83 a second. The rate is asserted
     against the budget, and the URL is asserted to have caught up afterwards —
     a throttle that never lands the last state would be the Firefox bug with
     extra steps. */
  await fresh('#v=saldo&c=0&y=1998');
  const histRate = await page.evaluate(async () => {
    let R = 0, P = 0;
    const ts = [];
    const r0 = history.replaceState.bind(history), p0 = history.pushState.bind(history);
    history.replaceState = (...a) => { R++; ts.push(performance.now()); return r0(...a); };
    history.pushState = (...a) => { P++; ts.push(performance.now()); return p0(...a); };
    const sp = document.querySelector('#spark');
    const b = sp.getBoundingClientRect();
    const at = x => {
      const o = { clientX: b.x + x, clientY: b.y + b.height / 2, bubbles: true, pointerId: 1, isPrimary: true, buttons: 1 };
      sp.dispatchEvent(new PointerEvent('pointermove', o));
    };
    sp.dispatchEvent(new PointerEvent('pointerdown', { clientX: b.x + 10, clientY: b.y + b.height / 2, bubbles: true, pointerId: 1, isPrimary: true, buttons: 1 }));
    const t0 = Date.now();
    let x = 10, dir = 1;
    while (Date.now() - t0 < 4000) {
      x += dir * 14;
      if (x > b.width - 10) dir = -1;
      if (x < 10) dir = 1;
      at(x);
      await new Promise(r => setTimeout(r, 8));
    }
    sp.dispatchEvent(new PointerEvent('pointerup', { clientX: b.x + x, clientY: b.y + b.height / 2, bubbles: true, pointerId: 1, isPrimary: true }));
    void t0;
    /* past the trailing timer, so the last state of the burst has landed */
    await new Promise(r => setTimeout(r, 800));
    history.replaceState = r0; history.pushState = p0;
    /* The SPACING, not a rate over the sample. WebKit's cap is a count over a
       rolling 30 s window, and the throttle fires on the leading edge, so one
       lone change lands at once and only a burst is spaced — dividing the total
       by the sample length would charge that free first write against every
       second of it. The gap floor is what bounds the window, and it is the whole
       assertion: `worst30s` below is `30000 / minGap`, i.e. the same statement in
       the units the engine documents, printed so a failure reads as a budget
       rather than as a number of milliseconds. This drag is 4 s, so no rolling
       30 s window is measured here; the 32 s measurement that closes the gap
       between the two is in the App.tsx note.
       Both ends of HIST_MS are pinned from here: below ~300 ms this floor fails,
       and above ~800 ms the trailing flush misses the settle two lines down and
       the URL assertion fails instead. */
    const gaps = ts.slice(1).map((t, i) => t - ts[i]);
    const minGap = gaps.length ? Math.min(...gaps) : 0;
    return { R, P, gaps: gaps.length, minGap: Math.round(minGap),
      perWindow: minGap ? Math.ceil(30000 / minGap) : 0,
      year: sp.getAttribute('aria-valuetext'), hash: location.hash };
  });
  ck('scrubbing spaces its history writes under the engine’s 100-per-30 s budget, and the URL still catches up',
    histRate.R >= 5 && histRate.perWindow <= 100
    && histRate.hash.includes('y=' + String(histRate.year).replace('.', '')),
    JSON.stringify(histRate));

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
    /* the honesty badge is part of the accessible name now — the tooltip has
       always carried it and this string is the AT rendering of that tooltip */
    ck(`Tokovi county label reads 2.311 from the hub and 1.977 to it (dir=${dir})`,
      NBSP(fLab) === 'Zagrebačka: iz Grad Zagreb 2.311, u Grad Zagreb 1.977, neto (Grad Zagreb) −334 · 2018. · izmjereno', fLab);
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
    /* Two holes. `!fill && !stroke` calls a shape naked only when BOTH are
       missing, so a class whose stroke comes from the stylesheet alone — which
       .mxband rect is, exactly — ships strokeless and therefore invisible the
       moment a bake sets fill="none" and drops the stroke attribute, with this
       green. And `naked.length === 0` had no population floor: if __exportSVG
       ever emitted malformed XML, DOMParser returns a parsererror document,
       querySelectorAll finds nothing, and the check prints ok having inspected
       nothing at all. So: count what was inspected, refuse a parse failure, and
       require an explicit stroke on the classes whose stroke IS the mark. */
    const shapes = [...doc.querySelectorAll('rect,path,circle,line')].filter(e => !e.closest('defs'));
    const naked = shapes
      .filter(e => !e.hasAttribute('fill') && !e.hasAttribute('stroke'))
      .map(e => e.tagName + '.' + (e.parentElement?.getAttribute('class') || '?'));
    const strokeOnly = ['.mxband rect', '.regline', '.jbord', '.arccase'];
    const unstroked = strokeOnly.flatMap(sel => [...doc.querySelectorAll(sel)]
      .filter(e => !e.getAttribute('stroke')).map(() => sel));
    const parseErr = !!doc.querySelector('parsererror');
    /* …and prove it by rasterising. The old probe read ONE pixel at the band's
       centre and asked whether any channel cleared 60 — a floor calibrated to
       the historical rgb(0,0,0), i.e. the whole bake missing. No such floor can
       work while the bake's own `opacity="0.5"` survives: half of anything over
       this pale figure ground lands around rgb(120,118,116), so a band painted
       SOLID BLACK sails through. Measured — delete only the `fill="none"`
       statement, the one line the check's own title is about, and the export
       ships a 50 %-black bar across a whole row and column of the heatmap while
       the check prints ok. The neighbouring self-containment sweep misses it too:
       its `naked` filter needs both fill AND stroke absent, and the stroke is
       still there.
       So compare the figure against itself instead: rasterise with the corridor
       focused and again with nothing focused, and count the pixels that differ.
       The band is a 1,1 px outline, so what changes is its perimeter — a fill
       changes its whole area. Layout-independent, so a header that grows a line
       cannot drift the probe onto background the way a live-y + 86 offset could
       (measured: every offset from −52 to +120 px passed on both exports). */
    const rast = async src => {
      const im = new Image();
      await new Promise(r => { im.onload = r; im.onerror = r; im.src = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' })); });
      const c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      c.getContext('2d').drawImage(im, 0, 0);
      return { d: c.getContext('2d').getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
    };
    const A = await rast(s);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    await new Promise(r => setTimeout(r, 300));
    const sOff = window.__exportSVG(false);
    const B = await rast(sOff);
    const bands = [...doc.querySelectorAll('.mxband rect')];
    /* the bake's own values, not merely the presence the sweep above tests */
    const bandAttr = bands.map(r => ({ fill: r.getAttribute('fill'), stroke: r.getAttribute('stroke'), op: +r.getAttribute('opacity') }));
    const bandArea = bands.reduce((a, r) => a + +r.getAttribute('width') * +r.getAttribute('height'), 0);
    let diff = 0;
    if (A.w === B.w && A.h === B.h) {
      for (let i = 0; i < A.d.length; i += 4) {
        if (Math.abs(A.d[i] - B.d[i]) > 8 || Math.abs(A.d[i + 1] - B.d[i + 1]) > 8
          || Math.abs(A.d[i + 2] - B.d[i + 2]) > 8) diff++;
      }
    }
    /* the unfocused export must actually have no band, or the diff is measuring
       two identical pictures and would pass on anything */
    const offBands = new DOMParser().parseFromString(sOff, 'image/svg+xml').querySelectorAll('.mxband rect').length;
    return { naked, n: shapes.length, unstroked, parseErr,
      bands: bands.length, bandAttr, bandArea: Math.round(bandArea), diff,
      ratio: bandArea ? diff / bandArea : 99, offBands, sameSize: A.w === B.w && A.h === B.h };
  });
  ck('exported document is self-contained (no CSS-only fill/stroke left)',
    !baked.parseErr && baked.n >= 100 && baked.naked.length === 0 && baked.unstroked.length === 0,
    JSON.stringify({ n: baked.n, naked: baked.naked.slice(0, 5), unstroked: baked.unstroked.slice(0, 5), parseErr: baked.parseErr }));
  ck('matrix trace band exports as an outline, not a filled bar',
    baked.bands === 2 && baked.offBands === 0 && baked.sameSize && baked.ratio < 0.5,
    JSON.stringify({ bands: baked.bands, offBands: baked.offBands, area: baked.bandArea, diff: baked.diff, ratio: +baked.ratio.toFixed(3) }));
  ck('…and its baked paint says so in the document itself',
    baked.bandAttr.length === 2 && baked.bandAttr.every(a => a.fill === 'none' && !!a.stroke && a.op > 0 && a.op <= 0.5),
    JSON.stringify(baked.bandAttr));

  /* …and the other five exports, which is where the classes this guard names
     actually live. The sweep ran on the Matrica export alone, and three of its
     four stroke-only selectors match nothing there: measured, .regline 0,
     .jbord 0, .arccase 0. They belong to exports the suite never parsed — 21
     .jbord in the JLS figure, 20 .arccase in Tokovi, 5 .regline in Regije — so
     the bake could stop writing `stroke` on any of them and every exported
     figure would ship with invisible borders while this check, whose own comment
     says it exists to "require an explicit stroke on the classes whose stroke IS
     the mark", stayed green on the one document those classes cannot appear in.
     Godine's 321 shapes and Saldo's 24 were never swept for nakedness at all.
     Each view carries a floor on the population it inspected, so a selector
     rename cannot make an export pass by sweeping nothing. */
  const expSweep = [];
  for (const [h, sel, want, floor] of [
    ['#v=jmap&dir=net', '.jbord', 21, 500],
    ['#v=flow&s=HR-21&pp=HR-01&c=0&y=2018&dir=net', '.arccase', 20, 60],
    ['#v=reg&c=1&y=2024', '.regline', 5, 20],
    ['#v=yrs&c=1&y=2024', '', 0, 300],
    ['#v=saldo&c=1&y=2024', '', 0, 15]]) {
    await fresh(h);
    expSweep.push({ h: h.slice(0, 16), want, floor, ...await page.evaluate(sel => {
      const s = window.__exportSVG(false);
      const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
      const shapes = [...doc.querySelectorAll('rect,path,circle,line')].filter(e => !e.closest('defs'));
      return {
        n: shapes.length,
        naked: shapes.filter(e => !e.hasAttribute('fill') && !e.hasAttribute('stroke'))
          .map(e => e.tagName + '.' + (e.parentElement?.getAttribute('class') || '?')).slice(0, 3),
        found: sel ? doc.querySelectorAll(sel).length : 0,
        unstroked: sel ? [...doc.querySelectorAll(sel)].filter(e => !e.getAttribute('stroke')).length : 0,
        parseErr: !!doc.querySelector('parsererror'),
      };
    }, sel) });
  }
  /* …and two different figures must not land on disk under one name. `fname`
     carried the view, the period, and the direction for two of the three views
     that have one. Measured over 22 states, each exported document hashed with
     its random uid prefix stripped so the payloads are provably different: 22
     figures arrived under 9 names, 5 of them colliding. A researcher building a
     four-panel Saldo figure — unutarnje, vanjske, prirodno, ukupno — got
     migracijski-atlas_saldo_2024 four times over, and the eight abs/rel11 ×
     component combinations collapsed onto that one name; Matrica's three
     directions onto another, which is the very collision fname's own note says
     was fixed for Tokovi and the JLS map; Klasifikacija's three thresholds onto
     a third. */
  const fnames = new Map();
  for (const h of ['#v=saldo&f=int&d=abs&c=0&y=2024', '#v=saldo&f=ext&d=abs&c=0&y=2024',
    '#v=saldo&f=int&d=rel11&c=0&y=2024', '#v=mx&dir=in&c=1&y=2018', '#v=mx&dir=out&c=1&y=2018',
    '#v=klas&c=1&y=2024&t=4500', '#v=klas&c=1&y=2024&t=2000',
    '#v=reg&f=int&c=1&y=2024', '#v=reg&f=ext&c=1&y=2024',
    '#v=yrs&f=int&c=0&y=2024', '#v=yrs&f=ext&c=0&y=2024']) {
    await fresh(h);
    const r = await page.evaluate(() => {
      let name = null;
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { name = this.download; };
      const doc = window.__exportSVG(true);
      HTMLAnchorElement.prototype.click = orig;
      const body = String(doc).replace(/id="[a-z0-9]+/g, 'id="').replace(/url\(#[a-z0-9]+/g, 'url(#');
      let x = 0;
      for (let i = 0; i < body.length; i++) x = (x * 31 + body.charCodeAt(i)) >>> 0;
      return { name, hash: x.toString(16) };
    });
    if (!fnames.has(r.name)) fnames.set(r.name, new Set());
    fnames.get(r.name).add(r.hash);
  }
  const collide = [...fnames].filter(([, h]) => h.size > 1).map(([n, h]) => n + ' ×' + h.size);
  ck('two different figures never export under one filename',
    fnames.size === 11 && collide.length === 0, JSON.stringify(collide));

  ck('every view exports a self-contained document, including the classes whose stroke is the mark',
    expSweep.length === 5 && expSweep.every(x => !x.parseErr && x.n >= x.floor
      && x.naked.length === 0 && x.found === x.want && x.unstroked === 0),
    JSON.stringify(expSweep.map(x => ({ h: x.h, n: x.n, found: x.found, naked: x.naked, un: x.unstroked }))));

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
    let seen = 0;
    for (const seg of document.querySelectorAll('.ctrls .seg')) {
      if (!seg.offsetParent) continue;   /* .only groups hidden in this view */
      const sr = seg.getBoundingClientRect();
      for (const b of seg.querySelectorAll('button')) {
        const br = b.getBoundingClientRect();
        /* both edges, not just the right one: `.seg` is overflow:hidden, so a
           button pushed off the LEFT is clipped exactly as completely, and the
           ≤560 grid is where a group can be pushed either way */
        seen++;
        if (br.right > sr.right + 0.5 || br.left < sr.left - 0.5 || br.width < 24) {
          segBad.push((b.dataset.v || b.id) + ':' + Math.round(br.width));
        }
      }
    }
    return {
      overflow: de.scrollWidth - de.clientWidth,
      segBad, seen,
      coarse: matchMedia('(pointer:coarse)').matches,
      viewBtns: document.querySelectorAll('#segView button').length,
    };
  });
  ck('390: page never scrolls sideways', m390.overflow <= 0, String(m390.overflow));
  ck('390: emulated device reports a coarse pointer', m390.coarse);
  /* …and a floor, so an empty set cannot pass: every `.seg` group is in the DOM
     in every view and six or seven are visible at 390, so ~19 buttons is the real
     population. Without it a selector rename made this print ok having measured
     nothing. */
  ck('390: every segment button stays inside its group and is not clipped',
    m390.segBad.length === 0 && m390.viewBtns === 7 && m390.seen >= 15,
    m390.segBad.join(' | ') + ' (seen ' + m390.seen + ')');

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
    /* the MINIMUM over the whole set, and the size of that set. `querySelector`
       took the first `#map text` — one of 42 axis labels, and not the smallest —
       so a floor that only the sampled label happened to clear read as green, and
       a selector rename would have read as green over nothing at all. */
    const labs = [...document.querySelectorAll('#map text')];
    const sizes = labs.map(t => parseFloat(getComputedStyle(t).fontSize));
    return {
      overflow: de.scrollWidth - de.clientWidth,
      cells: document.querySelectorAll('.mxc').length,
      fs: sizes.length ? Math.min(...sizes) : 0,
      nLab: labs.length,
      hit: document.querySelectorAll('.mxhit').length,
    };
  });
  ck('390: matrix renders all 420 cells without sideways scroll',
    mx390.cells === 420 && mx390.overflow <= 0, mx390.cells + ' / ' + mx390.overflow);
  ck('390: matrix axis labels stay at or above the 6.5 px floor',
    mx390.fs >= 6.5 && mx390.nLab >= 42, mx390.fs + ' px over ' + mx390.nLab + ' labels');
  ck('390: matrix gets the coarse-pointer tap overlay', mx390.hit === 1, String(mx390.hit));

  /* …and the JLS map's tip, which had no such route at all. The suite asserted
     that tooltip's TEXT and never its box, so it was green while the panel was
     painted 1.074 px below the bottom of a 844 px viewport. A tap fires
     pointerover, pointerenter, pointerdown, pointerup and pointerleave and NO
     pointermove, and `onPointerMove={moveTip}` was the path's only positioning
     input: `last` stayed null, placeTip() was a no-op, and .tip's position:fixed
     with auto insets left the box at its static flow position. On the one device
     class Tooltip says this readout exists for — where it is the JLS map's ONLY
     per-municipality value — tapping any of the 556 municipalities produced
     nothing a reader could see. The box, then, not the text: measured before the
     fix at rect (0,1918) here and (0,0) at 1024×768, both with style.left and
     style.top empty. */
  await fresh('#v=jmap&dir=net');
  await page.evaluate(() => { const m = document.querySelector('#map'); if (m) m.scrollIntoView({ block: 'center' }); });
  await settle(400);
  const jTap = await page.evaluate(() => {
    for (const e of document.querySelectorAll('.jl')) {
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
      if (x < 4 || y < 4 || x > innerWidth - 4 || y > innerHeight - 4) continue;
      /* not under the fixed scrubber or the header, or the tap never reaches it */
      if (document.elementFromPoint(x, y) !== e) continue;
      return { x, y, name: (e.getAttribute('aria-label') || '').slice(0, 30) };
    }
    return null;
  });
  if (jTap) await page.touchscreen.tap(jTap.x, jTap.y);
  await settle(250);
  const jTip = await page.evaluate(() => {
    const t = document.querySelector('#tip');
    const r = t.getBoundingClientRect();
    return { show: t.classList.contains('show'), left: t.style.left, top: t.style.top,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      inside: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      text: (t.textContent || '').trim().length };
  });
  ck('390: a tap on the JLS map places its tooltip inside the viewport, not only fills it',
    !!jTap && jTip.show && jTip.inside && jTip.left !== '' && jTip.top !== '' && jTip.text > 10,
    JSON.stringify({ jTap, ...jTip }));
  /* back to the matrix the rest of this block measures */
  await fresh('#v=mx&c=0&y=2018&dir=out');

  /* The box and the paint, not the `display` keyword. `display !== 'none'` is
     true of an element with zero height, zero opacity, visibility:hidden, or one
     scrolled entirely out of its own container — and this hint is the ONLY thing
     telling a touch reader that the rail, not the grid, is the way through. */
  const hint390 = await page.evaluate(() => {
    const h = document.querySelector('.rail-hint');
    if (!h) return { absent: true };
    const cs = getComputedStyle(h), r = h.getBoundingClientRect();
    return { display: cs.display, vis: cs.visibility, op: +cs.opacity,
      w: Math.round(r.width), h: Math.round(r.height), text: h.textContent.trim().length };
  });
  ck('390: the rail hint that explains touch navigation is visible',
    !hint390.absent && hint390.display !== 'none' && hint390.vis !== 'hidden'
    && hint390.op > 0.1 && hint390.w > 40 && hint390.h > 8 && hint390.text > 10,
    JSON.stringify(hint390));

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
    /* The population is its own conjunct, not a condition on allZero. Folded in,
       `vals.length > 0 &&` made the strictly WORSE outcome — the rail rendering
       no rows at all, a swallowed throw or a renamed selector — indistinguishable
       from success: allZero went false, `!allZero` true, and the two remaining
       conjuncts are hash and subtitle strings that hold either way. 21 rows for
       saldo, 5 for reg. */
    const allZero = boot.vals.every(v => v === '0');
    ck(`truncated pre-2011 link (${why}) is repaired, not booted into an all-zero atlas`,
      boot.vals.length >= 5 && !allZero && /y=2011/.test(boot.hash)
      && !/2011\.–20(0|10)/.test(boot.sub),
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
  /* `?.` short-circuits the whole chain to '' when the Grad Zagreb row is not in
     the rail — it failed to render, the repair changed the sort, dataset.iso got
     renamed — and then `'' !== '0'` is true and `includes('')` is true of ANY
     tooltip, including an empty one. The check printed ok having compared
     nothing, which is worse than the divergence it exists to catch. Require the
     operand to exist before comparing it. */
  const agreeNum = NBSP(agree.rail).replace(/^\+/, '');
  ck('map, rail and tooltip cannot disagree about a repaired year',
    /\d/.test(agreeNum) && agree.rail !== '0' && agree.tip.length > 0
    && NBSP(agree.tip).includes(agreeNum),
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
    NBSP(aOut) === 'Grad Zagreb → Zagrebačka: 2.311 · izmjereno', aOut);
  ck('matrix cell label flips direction for Dolasci (1.977 is Zagrebačka → Grad Zagreb)',
    NBSP(aIn) === 'Zagrebačka → Grad Zagreb: 1.977 · izmjereno', aIn);
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

  /* Two figures in one document — a notebook, a page — is what a "vector twin
     … publication-ready" is for, and every id in the export was fixed: `lg` for
     the legend ramp, `mxhatch`/`yrhatch` cloned out of the live grid, and `map`
     on the clone itself. A fragment reference resolves to the FIRST matching id
     in the host, so the second figure's legend bar painted the first figure's
     ramp — two grids with different domains under one colour key, with nothing
     on screen saying so. Inlined for real here rather than pattern-matched. */
  const twin = {};
  for (const [tag, h] of [['mx', '#v=mx&dir=in&y=2018&c=0'], ['yrs', '#v=yrs&dir=net&y=2024&c=0']]) {
    await fresh(h);
    twin[tag] = await page.evaluate(() => window.__exportSVG(false));
  }
  const ids = await page.evaluate(([a, b]) => {
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-9999px;top:0';
    holder.innerHTML = `<div id="figA">${a}</div><div id="figB">${b}</div>`;
    document.body.appendChild(holder);
    const seen = new Set(), dup = [];
    /* the two wrappers are this check's own scaffolding, not the figures' ids */
    for (const fig of ['figA', 'figB']) {
      holder.querySelector('#' + fig).querySelectorAll('[id]')
        .forEach(e => { if (seen.has(e.id)) dup.push(e.id); seen.add(e.id); });
    }
    /* every url(#…) must resolve, and inside the figure that wrote it */
    const stray = [];
    for (const fig of ['figA', 'figB']) {
      const root = holder.querySelector('#' + fig);
      root.querySelectorAll('*').forEach(el => {
        for (const at of ['fill', 'stroke', 'clip-path', 'mask']) {
          const m = /^url\(#(.+)\)$/.exec(el.getAttribute(at) || '');
          if (!m) continue;
          const t = holder.querySelector('#' + CSS.escape(m[1]));
          if (!t || !root.contains(t)) stray.push(fig + ' ' + at + ' ' + m[1]);
        }
      });
    }
    const r = { dup, stray, ids: [...seen], map: !!holder.querySelector('#map') };
    holder.remove();
    return r;
  }, [twin.mx, twin.yrs]);
  ck('two exported figures inlined into one document keep their own ids',
    ids.dup.length === 0 && ids.stray.length === 0 && !ids.map && ids.ids.length >= 4
    && ids.ids.every(i => /^ma[a-z0-9]{6}-/.test(i)),
    JSON.stringify({ dup: ids.dup.slice(0, 3), stray: ids.stray.slice(0, 3), map: ids.map, ids: ids.ids }));
  await fresh('');

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

  /* `f=` and `d=` are the same shape of dead flag, and were the two the repairs
     missed. Klasifikacija, Tokovi, Matrica and JLS karta read their own metric
     and disable both controls, so `#v=klas&f=nat&d=rel11&c=1&y=2024` rendered
     byte-identically to the link without them while the disabled Sastavnica
     group reported "Prirodno" pressed. Pressing Saldo then repainted every
     county through it: legend MIGRACIJSKI SALDO → PRIRODNI PRIRAST — % POPISA
     2011., top rail row Grad Zagreb +41.986 → Međimurska −1,6 %. That press is
     what the first leg measures, because the pressed label alone is cosmetic.
     Second leg: the click path in the other direction, which must clamp on the
     way in AND hand the lens back on the way out — the reader's choice is not
     the URL's to discard. */
  await fresh('#v=klas&f=nat&d=rel11&c=1&y=2024');
  const lensFD = await page.evaluate(async () => {
    const on = id => (document.querySelector('#' + id + ' button[aria-pressed="true"]') || {}).dataset?.v;
    const rail = () => (document.querySelector('#railList .rrow') || {}).textContent;
    const boot = { flow: on('segFlow'), den: on('segDen'), hash: location.hash };
    document.querySelector('#segView button[data-v="saldo"]').click();
    await new Promise(r => setTimeout(r, 350));
    const out = { rail: rail(), hash: location.hash };
    /* and now the click path: pick a lens where it is live, carry it into a
       locked view, come back */
    document.querySelector('#segFlow button[data-v="nat"]').click();
    document.querySelector('#segDen button[data-v="rel11"]').click();
    await new Promise(r => setTimeout(r, 350));
    document.querySelector('#segView button[data-v="jmap"]').click();
    await new Promise(r => setTimeout(r, 400));
    const locked = { flow: on('segFlow'), den: on('segDen'), hash: location.hash };
    document.querySelector('#segView button[data-v="saldo"]').click();
    await new Promise(r => setTimeout(r, 400));
    return { boot, out, locked, back: { flow: on('segFlow'), den: on('segDen') } };
  });
  ck('a locked view neither carries a lens the reader never chose nor eats the one they did',
    lensFD.boot.flow === 'tot' && lensFD.boot.den === 'abs'
    && !/[&#]f=|[&#]d=/.test(lensFD.boot.hash)
    && /\+41\.986/.test(lensFD.out.rail) && !/[&#]f=|[&#]d=/.test(lensFD.out.hash)
    && lensFD.locked.flow === 'int' && lensFD.locked.den === 'abs'
    && !/[&#]f=|[&#]d=/.test(lensFD.locked.hash)
    && lensFD.back.flow === 'nat' && lensFD.back.den === 'rel11',
    JSON.stringify(lensFD));
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
      role: c.getAttribute('role'), exp: c.getAttribute('aria-expanded'),
      /* "their OWN expanded state" is the claim, and reading one path in the one
         state where 'true' is right cannot check it: a refactor computing the
         prop from `!!sel` rather than `iso === sel` announces 21 expanded buttons
         on the map, leaving a screen reader no way to tell which county's card is
         open, and this passed. The matrix twin already floors exactly this. */
      expandedElsewhere: document.querySelectorAll('.cnt[aria-expanded="true"]').length,
      total: document.querySelectorAll('.cnt[aria-expanded]').length };
  });
  ck('Space on a focused county opens its card and does not start playback',
    cntSpace.card && cntSpace.playing === 'false', JSON.stringify(cntSpace));
  ck('county paths claim role=button and report their own expanded state',
    cntSpace.role === 'button' && cntSpace.exp === 'true'
    && cntSpace.expandedElsewhere === 1 && cntSpace.total === 21, JSON.stringify(cntSpace));

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
  /* Parsed and counted per element, not regexed over the whole string. `baked`
     was `/class="mxnum"[^>]*paint-order="stroke"/ || /paint-order="stroke"/`,
     whose second alternative subsumes the first — so it was true if that
     substring appeared anywhere in the document, on the eyebrow, a legend label,
     a title line. `whiteStroke` likewise only needed SOME single tag to carry
     both attributes. Change the bake loop's selector (a refactor that renames the
     class, or one that starts haloing the legend caption instead) and all 419
     in-cell numbers ship bare — ink on indigo at ~2,5:1, the exact contrast
     failure this block was written for — while one haloed text anywhere keeps
     both flags true. `livePaint` does not cover the gap either: it reads the
     stylesheet the exported document deliberately does not ship. */
  const halo = await page.evaluate(() => {
    const svg = window.__exportSVG(false) || '';
    const live = document.querySelector('.mxnum');
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const nums = [...doc.querySelectorAll('.mxnum')];
    const haloed = nums.filter(t => t.getAttribute('paint-order') === 'stroke'
      && t.getAttribute('stroke') === '#fff' && +t.getAttribute('stroke-width') > 0);
    return { livePaint: live ? getComputedStyle(live).paintOrder : null,
      total: nums.length, haloed: haloed.length };
  });
  ck('matrix numbers carry a white halo on screen and baked into the export',
    halo.livePaint === 'stroke' && halo.total >= 100 && halo.haloed === halo.total,
    JSON.stringify(halo));
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
  const tabWalk = async (steps, cardSel = '#helpCard') => {
    const stops = [];
    for (let i = 0; i < steps; i++) {
      await page.keyboard.press('Tab');
      stops.push(await page.evaluate(cardSel => {
        const a = document.activeElement, card = document.querySelector(cardSel);
        if (!a || a === document.body) return { body: true, who: 'BODY' };
        if (!card) return { body: true, who: 'NO-CARD' };
        const r = a.getBoundingClientRect(), c = card.getBoundingClientRect();
        return {
          inDialog: card.contains(a),
          covered: !card.contains(a) && r.left >= c.left - 0.5 && r.right <= c.right + 0.5
            && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5,
          who: a.id || a.getAttribute('data-iso') || String(a.getAttribute('class') || a.tagName),
        };
      }, cardSel));
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

  /* …and the same property arrived at by permalink rather than by pressing the
     chip. Every suspension check above opens its overlay in-session, and the two
     routes were not the same thing: the hook keyed on `S.view` alone, so on a
     boot it ran against an empty #map — everything focusable in there is gated
     on the stage having been measured, and the 556 municipalities additionally
     on an async chunk — snapshotted nothing, and never ran again, because
     neither dependency changes after that. Measured at 1000×800 before the fix:
     `#v=saldo&cz=1` and `#v=reg&cz=1` left all 21 county paths tabbable under an
     open panel; `#v=flow&…&jl=1` left 21, ten of them drawn entirely behind the
     JLS card, each one role=button with its ring painted under the card and
     Enter still re-selecting a county the reader cannot see; `#v=jmap&cz=1` left
     its roving stop live among the covered municipalities. Opening those same
     panels by hand at the same size left none — identical geometry, so the
     arrival is the whole of what this exercises. */
  await page.setViewport({ width: 1000, height: 800 });
  const bootSuspend = [];
  for (const [h, sel] of [['#v=saldo&cz=1', '.cnt'],
    ['#v=flow&s=HR-21&pp=HR-01&c=0&y=2018&dir=net&jl=1', '.cnt'],
    ['#v=jmap&dir=net&cz=1', '.jl'], ['#v=reg&cz=1', '.cnt']]) {
    await fresh(h);
    await page.waitForFunction(s => document.querySelectorAll(s).length > 0, { timeout: 10000 }, sel).catch(() => {});
    bootSuspend.push({ h: h.slice(0, 22), ...await page.evaluate(s => {
      const f = [...document.querySelectorAll(s)];
      return { feats: f.length, live: f.filter(e => e.getAttribute('tabindex') !== '-1').length };
    }, sel) });
  }
  /* the feature floor matters: a selector that matched nothing would otherwise
     report zero live stops and pass having measured an empty page */
  ck('a permalink that boots with a panel open suspends the map’s tab stops too',
    bootSuspend.length === 4 && bootSuspend.every(b => b.feats > 0 && b.live === 0),
    JSON.stringify(bootSuspend));

  /* …and proved by pressing Tab, on the two overlays that can actually boot
     open. The bbox walk above — the one whose own comment records that an
     attribute test is foolable, `inert` on `svg#map` matching `[inert]` while
     doing nothing to the map — runs only on the glossary, and `help` is not a
     hash field at all, so the guarded overlay is the one that is structurally
     incapable of booting open. `cz` and `jl` do round-trip, so the JLS card and
     the chip pair, which are what the suspension was written for, had only the
     tabindex read above: it cannot see a stop that is focusable without the
     attribute, and it never asks where the stop is drawn. Same walk, same
     coverage test, entered by URL and aimed at the open chip card. */
  const bootWalk = [];
  for (const h of ['#v=flow&s=HR-21&pp=HR-01&c=0&y=2018&dir=net&jl=1', '#v=jmap&dir=net&cz=1']) {
    await fresh(h);
    await settle(400);
    bootWalk.push({ h: h.slice(0, 22), ...await tabWalk(60, '.chipcard.open') });
  }
  ck('and Tab proves it: a boot-opened panel has no stop drawn underneath it',
    bootWalk.length === 2 && bootWalk.every(w => w.covered === 0 && w.moved >= 5 && w.outside > 10),
    JSON.stringify(bootWalk));
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

  /* …dispatched FROM THE FOCUSED FEATURE, in every view that has one. The probe
     above fires at `window`, where no focused control can intercept it — and
     three views intercepted it. Matrica, Godine and the JLS map each contribute
     exactly one tab stop (a roving cell or municipality), so a keyboard reader
     who zooms is standing on one by construction; their key handlers matched on
     `e.key` alone, so Shift+ArrowRight moved the roving cell and ran
     preventDefault + stopPropagation before useZoom's window listener could see
     it. Measured in Matrica at k=2,56: three presses left
     `translate(-895.44,-402.48) scale(2.56)` byte-identical while focus walked
     Zagrebačka → Međimurska — and the focused cell was by then 172 px above the
     top of the map box, which is what the pan exists to reach. The glossary
     promises this chord in the same sentence that says + and − zoom "the map and
     the matrix"; it was true in one of the views it names. */
  const panFrom = [];
  for (const [h, sel, label] of [
    ['#v=mx&y=2018&c=0&dir=out', '.mxc[tabindex="0"]', 'mx'],
    ['#v=yrs&c=1&y=2024', '.yrc[tabindex="0"]', 'yrs'],
    ['#v=jmap&dir=net', '.jl[tabindex="0"]', 'jmap'],
    ['#v=saldo&c=1&y=2024', '.cnt[data-iso="HR-18"]', 'saldo']]) {
    await fresh(h);
    panFrom.push({ label, ...await page.evaluate(async sel => {
      const tr = () => { const g = document.querySelector('#map g[transform]'); return g ? g.getAttribute('transform') : null; };
      const el = document.querySelector(sel);
      if (!el) return { absent: true };
      el.focus();
      for (let i = 0; i < 2; i++) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
        await new Promise(r => setTimeout(r, 120));
      }
      const before = tr();
      for (let i = 0; i < 3; i++) {
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
        await new Promise(r => setTimeout(r, 120));
      }
      return { zoomed: before !== 'translate(0,0) scale(1)', panned: tr() !== before };
    }, sel) });
  }
  ck('Shift + arrow pans from a focused feature too, in every view that has one',
    panFrom.length === 4 && panFrom.every(p => !p.absent && p.zoomed && p.panned),
    JSON.stringify(panFrom));

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
      /* the matrix twin asserts this and this did not: a regression that moved
         the roving marker but stopped calling .focus() leaves DOM focus and the
         dashed ring on feature 0, so a keyboard reader pressing End sees and
         hears nothing move, while j1 !== j0 and one === 1 both hold */
      focused: document.activeElement === now,
      role: now.getAttribute('role') };
  });
  ck('End jumps the JLS roving stop across the 556-feature list',
    jJump.j1 !== jJump.j0 && jJump.one === 1 && jJump.focused, JSON.stringify(jJump));
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
    /* Presence recorded separately from the dash. `outs && getAttribute(...)`
       yields undefined when the solid series is not findable at all — swap
       PairCard's stroke="#B5341F" for a custom property, delete its lineG, or
       retune the colour — and `!pairShape.outs` is true either way, so a card
       rendering only ONE series printed "corridor series differ by dash". These
       lines are the only place in the file that inspects #pairSvg's encoding. */
    return { n: paths.length, hasIns: !!ins, hasOuts: !!outs,
      insDash: ins ? ins.getAttribute('stroke-dasharray') : null,
      outsDash: outs ? outs.getAttribute('stroke-dasharray') : null,
      cap: document.querySelector('#pair .card-sub').textContent };
  });
  ck('corridor series differ by dash, and the caption names shape not colour',
    pairShape.hasIns && pairShape.hasOuts && !!pairShape.insDash && pairShape.outsDash === null
    && /crtkano/.test(pairShape.cap) && !/crvena/.test(pairShape.cap), JSON.stringify(pairShape));

  /* ── P3: `den` — a whole segment group that had zero coverage ── */
  /* …and then no VALUE coverage, which is a different hole. "a % in the rail",
     "the caption in the legend" and "a % in the aria-label" are satisfied just
     as happily by a build computing the wrong denominator, and both halves of
     `den` are one token deep: `peAt` returning `D[iso].p` collapses relest onto
     the 2011 census, and regVal dividing by 'rel11' unweights the five regions.
     Each of those rewrites every "% tekuće procjene" figure the atlas prints,
     and each passed the whole suite. The literals below are the two
     denominators' only distinguishing evidence — Vukovarsko-srijemska reads
     −15,8 % against −20,6 %, 4,8 pp apart on the darkest county on the map, and
     the rail leader +10,8 % against +11,1 %. HR-16 replaces HR-21 as the sampled
     path for exactly that reason: Grad Zagreb's two figures are 0,1 pp apart
     (+5,3 / +5,4), which is nearly no evidence at all.
     Regije gets its own leg because it never calls val(): regVal sums the
     members' numerators and denominators separately, so a census-weighted build
     printed every county correctly and still handed the view a different
     WINNER — Zagrebačka regija +5,0 % where the estimate says Sjevernojadranska
     +5,3 %. */
  for (const [d, label, top, hr16, regLead, regPct] of [
    ['rel11', '% popisa 2011.', '+10,8 %', '−15,8 %', 'Zagrebačka regija', '+5,0 %'],
    ['relest', '% tek. procjene', '+11,1 %', '−20,6 %', 'Sjevernojadranska', '+5,3 %']]) {
    await fresh('#v=saldo&c=1&y=2024&d=' + d);
    const rel = await page.evaluate(() => {
      const v = document.querySelector('#railList .rrow .rval');
      return { val: v ? v.textContent : '', lab: document.querySelector('#legend').textContent,
        aria: document.querySelector('.cnt[data-iso="HR-16"]').getAttribute('aria-label') };
    });
    ck(`den=${d} renders its own numbers in the rail, legend and county labels`,
      NBSP(rel.val) === top && rel.lab.includes(label) && NBSP(rel.aria).includes(hr16),
      JSON.stringify({ v: rel.val, a: rel.aria.slice(0, 50) }));
    await fresh('#v=reg&c=1&y=2024&d=' + d);
    const regRows = await railTexts();
    ck(`den=${d} ranks the regije rail on its own denominator`,
      regRows[0].n === regLead && NBSP(regRows[0].v) === regPct,
      JSON.stringify(regRows.slice(0, 2)));
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

  /* …and an invalid *enumerated* value is ignored rather than acted on. `c` was
     decoded by presence, not by value: `#c=true`, `#c=2`, `#c=on`, an empty `#c=`
     and a bare `#c` all passed the `!= null` test and none equals '1', so every
     one booted the ANNUAL view. Measured, `#v=saldo&c=true&y=2024` read Grad
     Zagreb +7.010 against the cumulative +41.986 — every county, rail row and
     aria-label on the page — and the hash-sync effect then rewrote it to a clean
     `c=0`, laundering the malformed link into a shareable permalink to the wrong
     reading. Nothing in the file covered enumerated-field rejection at all. */
  const enumBad = [];
  for (const h of ['#v=saldo&c=true&y=2024', '#v=saldo&c=2&y=2024', '#v=saldo&c=&y=2024',
    '#v=saldo&c&y=2024', '#v=saldo&cz=banana&y=2024', '#v=saldo&lb=yes&y=2024']) {
    await fresh(h);
    const r = await page.evaluate(() => ({
      top: (document.querySelector('#railList .rrow .rval') || {}).textContent,
      cum: (document.querySelector('#segMode button[aria-pressed="true"]') || {}).textContent,
      panel: !!document.querySelector('#citz.open'),
      lab: (document.querySelector('#labBtn') || {}).getAttribute?.('aria-pressed'),
    }));
    /* BASE is cumulative 2011.–2024., whose top rail row is Grad Zagreb +41.986 */
    if (NBSP(r.top) !== '+41.986' || r.cum !== 'Kumulativno' || r.panel || r.lab === 'true') {
      enumBad.push(h + ' ' + JSON.stringify(r));
    }
  }
  ck('an invalid enumerated field is ignored, not acted on',
    enumBad.length === 0, enumBad.slice(0, 3).join(' | '));

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
  /* …and it stops advancing while nobody is looking. Measured with Chrome's own
     background throttling on: hidden at 1998 with playback running, 40 s later
     the year was 2025 and #play released — the loop had run to the end and
     terminated, so the reader saw none of it, and every step took the hash-sync
     effect's replaceState branch, rewriting the `y=2005` entry they arrived on.
     Driven here with a real visibilitychange, since CDP cannot hide a headless
     page: the effect keys on document.hidden, which the override moves. */
  await fresh('#v=saldo&f=int&c=0&y=2005');
  const bgPlay = await page.evaluate(async () => {
    document.querySelector('#play').click();
    await new Promise(r => setTimeout(r, 200));
    const y0 = document.querySelector('#bigYear').textContent;
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 2000));
    const yHidden = document.querySelector('#bigYear').textContent;
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 900));
    const yBack = document.querySelector('#bigYear').textContent;
    document.querySelector('#play').click();
    return { y0, yHidden, yBack };
  });
  ck('a hidden tab does not burn through the year sequence',
    bgPlay.yHidden === bgPlay.y0 && bgPlay.yBack !== bgPlay.y0, JSON.stringify(bgPlay));

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

  /* …and the largest motion in the app has to follow it too. The pair above
     asserts the class and the transition duration, and its own comment frames
     the property as "a reader who flips the OS switch mid-session with the
     animations they asked to stop" — which autoplay did not honour.
     `setInterval(fn, period)` reads the period ONCE, so routing the pace through
     a ref made the value current without making it read: with deps
     [S.playing, visible], a live preference change re-rendered and updated
     paceRef without re-creating the interval. Measured on the shipped build,
     sampling the scrubber every 10 ms: six steps ran at 648–651 ms with
     body.reduced ALREADY true, and only pausing and pressing play again picked
     up 1.400 ms. The cadence is measured across the flip here, not the class. */
  await fresh('#v=saldo&c=0&y=1998');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await settle(200);
  const paceSteps = await (async () => {
    await page.evaluate(() => document.querySelector('#play').click());
    const steps = [];
    const t0 = Date.now();
    let prev = null, flipped = false;
    while (Date.now() - t0 < 9000) {
      const s = await page.evaluate(() => ({ y: document.querySelector('#bigYear').textContent,
        red: document.body.classList.contains('reduced') }));
      if (prev !== null && s.y !== prev) steps.push([Date.now() - t0, s.red]);
      prev = s.y;
      if (!flipped && Date.now() - t0 > 2600) {
        flipped = true;
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      }
      await settle(10);
    }
    await page.evaluate(() => document.querySelector('#play').click());
    return steps;
  })();
  const paceGaps = paceSteps.slice(1).map((s, i) => ({ ms: s[0] - paceSteps[i][0], red: s[1] }));
  const fast = paceGaps.filter(g => !g.red).map(g => g.ms);
  /* the step already in flight when the switch flips keeps its own period —
     re-creating the timer would cut it short — so the LAST few are the test */
  const slow = paceGaps.filter(g => g.red).slice(-3).map(g => g.ms);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  ck('and so does the playback cadence, without a pause and a replay',
    fast.length >= 2 && slow.length >= 2
    && fast.every(m => m < 900) && slow.every(m => m > 1100),
    JSON.stringify({ fast, slow }));

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
    const leg = document.querySelector('#legend');
    return { err: !!document.querySelector('#jerror'), retry: !!document.querySelector('#jretry'),
      stillLoading: !!document.querySelector('#jloading'),
      live: st ? st.getAttribute('role') : null,
      /* the key, and whether it is claiming a domain it cannot know */
      bar: !!(leg && leg.querySelector('.legend-bar')),
      lbls: leg ? (leg.querySelector('.legend-lbls') || {}).textContent || '' : '' };
  });
  ck('a failed geometry chunk reports an error instead of an eternal spinner',
    geoFail.err && geoFail.retry && !geoFail.stillLoading, JSON.stringify(geoFail));
  /* …and no figure can be minted from a map that has no geometry. An export
     leaves the app under CC BY, and with the chunk blocked pressing SVG produced
     a 265.934-byte document headed "GRADOVI I OPĆINE: NETO PO JLS · UNUTARNJA
     MIGRACIJA (IZMJERENO)" holding 21 unfilled county outlines and none of the
     556 municipalities its title names — while the app two hundred pixels away
     read "Geometrija JLS nije učitana." */
  const expLocked = await page.evaluate(() => ({
    png: document.querySelector('#pngBtn').disabled,
    svg: document.querySelector('#svgBtn').disabled,
    said: (document.querySelector('#expLive') || {}).textContent || '',
  }));
  ck('both exporters are held while the geometry the figure claims is absent',
    expLocked.png && expLocked.svg && /geometrija/i.test(expLocked.said),
    JSON.stringify(expLocked));
  ck('and it says so through a live region, not silent SVG text',
    geoFail.live === 'status', String(geoFail.live));
  /* A failure the reader never asked for must not latch the failure UI. The warm
     timer fires both chunks at t=1,5 s whether or not those views are ever
     opened, and its rejection used to run through the same catch as a real
     request — so a reader in a tunnel or a Wi-Fi-to-cell handover at that moment
     had BOTH flags latched while sitting in Saldo seeing nothing, and pressing
     Regije seconds later on a healthy connection got "Geometrija regija nije
     učitana." for the rest of the session, because a failed module fetch is
     cached in the module map. Blocked only over the warm window here, then
     released before the view is opened. */
  blockGeoChunk = 'reg';
  await page.goto('about:blank');
  await page.goto(url, { waitUntil: 'networkidle0' });
  await settle(2200);
  blockGeoChunk = false;
  /* Still in Saldo, which needs neither chunk. Before the speculative flag the
     warm's rejection ran through the same catch as a real request and latched
     regErr here, so the reader was carrying a failure for a view they had not
     opened. (Opening it afterwards still fails, and correctly shows the error
     and the retry: a rejected module fetch is cached in the browser's module
     map, which is why retryGeo reloads. What this asserts is that the app does
     not claim a failure nobody has asked it to have.) */
  /* …and the Saldo probe alone could not fail. MapView gates the whole geostat
     region on `S.view === 'jmap' || S.view === 'reg'`, and #jerror lives inside
     it, so in Saldo both selectors return null BY CONSTRUCTION: the three
     clauses held on a healthy boot with nothing blocked, and held identically on
     a document whose region failure was genuinely latched and had merely been
     navigated away from. Nothing about the behaviour could turn it red.
     So the absence is still asserted — and named as an absence, `geostat`, so
     the file says out loud that that arm proves nothing on its own — and the
     discrimination comes from what Regije paints FIRST when it is opened. A
     failed module fetch is cached in the module map, so the view fails either
     way and the end state is identical; what differs is the frame before it.
     Unlatched, the real call is a fresh request as far as the app knows, so the
     first geostat state is the spinner. Pre-latched, `regFailed()` is already
     true at that first render and the error is painted with no spinner at all.
     Measured: fixed → first {loading:true, err:false}; with the speculative flag
     removed → first {loading:false, err:true}, and no spinner state ever. */
  const warmLatch = await page.evaluate(async () => {
    const seen = [];
    const snap = () => {
      if (!document.querySelector('#jstatus')) return;
      seen.push({ loading: !!document.querySelector('#jloading'), err: !!document.querySelector('#jerror') });
    };
    const mo = new MutationObserver(snap);
    mo.observe(document.body, { childList: true, subtree: true });
    const at = {
      view: (document.querySelector('#segView button[aria-pressed="true"]') || {}).textContent,
      err: !!document.querySelector('#jerror'),
      status: (document.querySelector('#jstatus') || {}).textContent || '',
      geostat: !!document.querySelector('#jstatus'),
    };
    document.querySelector('#segView button[data-v="reg"]').click();
    await new Promise(r => setTimeout(r, 1200));
    mo.disconnect();
    return { ...at, first: seen[0] || null, states: seen.length };
  });
  ck('a failed speculative warm does not latch the failure UI for a view nobody opened',
    warmLatch.view === 'Saldo' && !warmLatch.err && warmLatch.status.trim() === '' && !warmLatch.geostat
    && !!warmLatch.first && warmLatch.first.loading && !warmLatch.first.err,
    JSON.stringify(warmLatch));
  /* …and the third state, between the two above: a real request that JOINS the
     warm. Both checks so far abort instantly, so one exercises a warm that
     failed with nobody watching and the other a request made at mount with
     nobody warming — and the state in between is the one a reader on a slow
     connection actually meets. `jlsP ??=` hands a view change that arrives
     mid-warm the warm's own promise, so no second request is issued, and the
     speculative flag used to belong to that promise rather than to the caller:
     the failure took the speculative branch, latched nothing, and the view the
     reader had explicitly asked for sat under "Učitavanje geometrije JLS…" for
     ever — no #jerror, no #jretry, both exporters held, and no second request to
     recover on. Held across the warm window, opened while it is held, and only
     then failed. */
  {
    const h = holdChunk(/geo_jls/);
    await page.goto('about:blank');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    /* the warm fires at t=1,5 s; wait for the request itself rather than for a
       stopwatch, so a slow runner does not open the view before it exists */
    const armed = await new Promise(res => {
      const t0 = Date.now();
      const poll = setInterval(() => {
        if (h.n > 0 || Date.now() - t0 > 15000) { clearInterval(poll); res(h.n > 0); }
      }, 50);
    });
    /* the reader presses "JLS 2018." while that fetch is still open */
    await page.evaluate(() => document.querySelector('#segView button[data-v="jmap"]').click());
    await settle(300);
    const joined = { armed, reqs: h.n, spinning: await page.evaluate(() => !!document.querySelector('#jloading')) };
    releaseChunk(false);
    await page.waitForFunction(() => !!document.querySelector('#jerror'), { timeout: 15000 }).catch(() => {});
    const held = await page.evaluate(() => ({
      view: (document.querySelector('#segView button[aria-pressed="true"]') || {}).dataset?.v ?? '',
      err: !!document.querySelector('#jerror'),
      retry: !!document.querySelector('#jretry'),
      stillLoading: !!document.querySelector('#jloading'),
    }));
    ck('a warm the reader joins mid-flight reports its failure to them, not silently',
      joined.armed && joined.reqs === 1 && joined.spinning
      && held.view === 'jmap' && held.err && held.retry && !held.stillLoading,
      JSON.stringify({ ...joined, ...held }));
    /* the abort was ours; keep it out of the two zero-error assertions, the same
       targeted splice the geo_regions5 scrub above uses */
    for (let i = errors.length - 1; i >= 0; i--) {
      if (/geo_jls/.test(errors[i]) && /ERR_FAILED|net::/.test(errors[i])) errors.splice(i, 1);
    }
  }
  {
    const before = errors.length;
    for (let i = errors.length - 1; i >= 0; i--) {
      if (/geo_regions5/.test(errors[i])) errors.splice(i, 1);
    }
    void before;
  }
  /* Back into the blocked jmap state the retry below needs: the speculative-warm
     probe above navigated away from it, and #jretry only exists while the chunk
     is failing. blockGeoChunk is still true at this point, so this reload
     reproduces the failure the section is about. */
  blockGeoChunk = true;
  await page.goto('about:blank');
  await page.goto(url + '#v=jmap&dir=net', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#jerror'), { timeout: 15000 })
    .catch(() => {});
  /* jmapMax()'s `if (!g) return 1` is a harmless domain for a map that draws
     nothing, and the legend rendered it as a real axis: "0" and "1" under
     "Gradovi i općine · dolasci u JLS · 2018.", a published claim that the
     largest municipal inflow measured in 2018 was one person — against 9.606 in,
     6.193 out and ±3.413 net. A failed module fetch is cached, so this was not a
     flash: the false key sat permanently beside the error message, and both
     exporters read the same scale. */
  ck('a JLS map with no geometry draws no colour key at all',
    !geoFail.bar && !/1/.test(geoFail.lbls), JSON.stringify({ bar: geoFail.bar, lbls: geoFail.lbls }));
  blockGeoChunk = false;
  /* The retry reloads, because a failed module fetch is cached in the browser's
     module map and a second import() of the same specifier never hits the
     network (measured: 0 of 556 with the promise slot cleared). */
  await click('#jretry');
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
  /* The rows wrap now, so their count depends on the width; what does not
     change is the rhythm and the clearance. Bottom-up: source credit, figure
     licence, study reference, revision caveat — at least four rows for a study
     view, 14 px apart, clear of the legend above them.
     The clearance is measured on rendered ink. It used to be `noteRows[0] -
     swatch >= 12` where `swatch` was the y ATTRIBUTE of the legend's colour
     chip — but the legend's label sits on a baseline 9 px below that, and the
     8,5 px credit glyphs rise ~6,5 px above their own baseline. Algebraically
     the whole condition collapsed to `legendBottom >= 10`, because
     noteRows[0] − swatch is exactly legendBottom + 2 whatever the row count:
     tune exportPng's legendBottom from 40 down to 10 and this printed ok while
     the credit's ascenders sat 3 px above the legend label's baseline, i.e. the
     two runs of text overlapped. Boxes now, in the same offscreen holder the
     title-fit check builds, over both study views — Regije is the tighter one
     (8 px of air against Klasifikacija's 21). */
  const inkGap = await page.evaluate(([a, b]) => {
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-9999px;top:0';
    document.body.appendChild(holder);
    const of = doc => {
      holder.innerHTML = doc;
      const svg = holder.querySelector('svg');
      const inner = svg.querySelector('svg').getBBox();
      const below = [...svg.querySelectorAll(':scope > text, :scope > rect')]
        .map(el => ({ el, b: el.getBBox() }))
        .filter(o => o.b.y >= inner.y + inner.height - 1);
      const credit = below.filter(o => o.el.getAttribute('font-size') === '8.5');
      const legend = below.filter(o => !credit.includes(o));
      return +(Math.min(...credit.map(o => o.b.y))
        - Math.max(...legend.map(o => o.b.y + o.b.height))).toFixed(1);
    };
    const r = { klas: of(a), reg: of(b) };
    holder.remove();
    return r;
  }, [eKlas.svg, eReg.svg]);
  ck('the exported disclaimer is a line of its own, clear of the legend and the credit',
    noteRows.length >= 4 && noteRows.every((y, i) => i === 0 || y - noteRows[i - 1] === 14)
    && inkGap.klas >= 6 && inkGap.reg >= 6,
    JSON.stringify({ noteRows, inkGap }));

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
      await click('#railList .rrow');
    } else {
      await click(selCell);
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
  await click('.mxc[data-a="HR-21"][data-b="HR-01"]');
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
  /* The split the note attributes to the paper is derived from PAPER_KLAS now,
     not written out — so this compares the sentence against the table rather than
     against a literal. Before, correcting a transcription (moving one county
     between classes, making the study's split 7/6/8) left the legend stating a
     false fact about the paper while the county names in the same sentence, which
     ARE data-derived, updated around it — and this check still passed, because it
     only grepped for the copy. The atlas side of the comparison was pinned to
     ground truth all along; the study side was pinned to its own prose. */
  const paperSplit = await page.evaluate(() => {
    const g = window.__PAPER_KLAS;
    return g ? `${g.gain.length} / ${g.neu.length} / ${g.loss.length}` : null;
  });
  ck('the klasifikacija legend names the counties that differ from the published split',
    !!paperSplit && klasCmp.note.includes(paperSplit) && /2011\.–2024\./.test(klasCmp.note)
    && /Karlova/.test(klasCmp.note) && /Koprivni/.test(klasCmp.note),
    paperSplit + ' · ' + klasCmp.note);
  ck('and the counts it qualifies are still the 7 / 5 / 9 that made it necessary',
    /pobjednice · 7/.test(klasCmp.counts[0]) && /neutralne · 5/.test(klasCmp.counts[1])
    && /gubitnice · 9/.test(klasCmp.counts[2]), JSON.stringify(klasCmp.counts));
  /* …and the exported twin of that legend has to be readable on a machine that
     has none of the app's fonts installed. It asked for IBM Plex Sans, which
     exportFonts deliberately does not embed — its comment says the only text
     wanting that family is the PNG's canvas legend, drawn by the page with the
     real face, which was not true of the SVG. So the three swatch labels fell
     back to a substitute while every other string in the same figure came from
     an embedded face, and the advance estimate they were laid out with
     (`t.length * 5.6`, Plex Sans at 10 px) under-measured a wider substitute
     enough to run a label into the next swatch. Measured on the rendered ink,
     in both languages, since the English labels sit at different offsets. */
  const klasSvg = [];
  for (const h of ['#v=klas&c=1&y=2024', '#l=en&v=klas&c=1&y=2024']) {
    await fresh(h);
    const r = await page.evaluate(() => {
      const doc = window.__exportSVG(false);
      const holder = document.createElement('div');
      holder.style.cssText = 'position:absolute;left:-9999px;top:0';
      holder.innerHTML = doc;
      document.body.appendChild(holder);
      const svg = holder.querySelector('svg');
      const chips = [...svg.querySelectorAll(':scope > rect')]
        .filter(x => x.getAttribute('width') === '11');
      const swatch = chips.map(x => +x.getAttribute('x'));
      /* the three swatch labels, by position rather than by size: they sit on
         the baseline 9 px under their own chip. Filtering on the font-size or
         on the · separator would also catch the credit rows, which carry both. */
      const base = chips.length ? +chips[0].getAttribute('y') + 9 : NaN;
      const labs = [...svg.querySelectorAll(':scope > text')]
        .filter(t => Math.abs(+t.getAttribute('y') - base) < 1);
      const over = labs.filter((t, i) => swatch[i + 1] !== undefined
        && t.getBBox().x + t.getBBox().width > swatch[i + 1]).map(t => t.textContent);
      const naked = labs.filter(t => !/IBM Plex Mono|Oswald/.test(t.getAttribute('font-family') || ''))
        .map(t => t.getAttribute('font-family'));
      holder.remove();
      return { n: labs.length, over, naked, sans: /IBM Plex Sans/.test(doc) };
    });
    if (r.n !== 3 || r.over.length || r.naked.length || r.sans) klasSvg.push(h + ' ' + JSON.stringify(r));
  }
  ck('the exported klasifikacija legend draws in an embedded face and clears its swatches',
    klasSvg.length === 0, klasSvg.join(' | '));
  /* One note, never two — the klas legend is the tallest in the app and both
     .helpcard and .jcard reserve a lane for it. The bound said 164, which was the
     reserve BEFORE index.css raised it to 176 for the English string; the panels
     sit at top:14, so what the legend may occupy is 176 − 14 = 162. And the
     measurement ran in Croatian only, while the note above the reserve says the
     ENGLISH klas legend is the tall one — 148,4 px off the map's bottom edge
     against Croatian's 137,4 — so the binding case was the one not measured. */
  const klasLane = {};
  for (const [lang, pre] of [['hr', '#'], ['en', '#l=en&']]) {
    await fresh(pre + 'v=klas&y=2024');
    klasLane[lang] = await page.evaluate(() => ({
      notes: document.querySelectorAll('#legend .legend-note').length,
      h: document.querySelector('#legend').getBoundingClientRect().height,
    }));
  }
  ck('exactly one klasifikacija legend note, and the legend still fits its 162 px lane',
    klasLane.hr.notes === 1 && klasLane.en.notes === 1
    && klasLane.hr.h <= 162 && klasLane.en.h <= 162, JSON.stringify(klasLane));
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
        /* all three anchors. `middle` was folded into the start branch, which
           reports a centred run starting where it is actually centred — so its
           left edge was over-reported by half its length and its right edge
           under-reported by the same, and a centred run overflowing either margin
           by up to half its width measured as fitting. */
        const a = t.getAttribute('text-anchor');
        return a === 'end' ? { ...base, l: x - len, r: x }
          : a === 'middle' ? { ...base, l: x - len / 2, r: x + len / 2 }
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
      /* WHICH column it rings, not merely that one exists. `selC` is
         `cols.indexOf(S.yi)` over a cumulative column set offset by +13 from the
         YEARS index — exactly the mapping an off-by-one or a raw-S.yi regression
         corrupts — and the ring still renders when selC runs off the grid.
         Measured: moving both ring rects three columns left, so the teal marker
         sits on 2021 while the scrubber reads 2024, left `sel === 1` and the
         check green. This grid IS the app's year picker, so a ring on the wrong
         column tells the reader the wrong year is selected. Compared as boxes
         rather than as x attributes, so a move to transform-based positioning
         cannot slip past it. */
      selOn: (() => {
        const ring = document.querySelector('#map .yrsel rect');
        const cell = document.querySelector('#map .yrc[data-y="2024"]');
        if (!ring || !cell) return null;
        const a = ring.getBoundingClientRect(), b = cell.getBoundingClientRect();
        return Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1;
      })(),
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
  ck('the selected year is marked on its own column, and no pre-2007 hatch appears in cumulative mode',
    yg.sel === 1 && yg.selOn === true && yg.pre === 0,
    JSON.stringify({ sel: yg.sel, selOn: yg.selOn, pre: yg.pre }));
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

  /* …and only for a series that has an inter-county margin. The gap lives in the
     `ii`/`oi` arrays: Σ(doseljeni) − Σ(odseljeni) is −550…−490 for 2002–06 and
     exactly 0 from 2007. `ext` is cross-border and balances against nothing;
     `nat` is a separate table whose county sums equal the national figure in all
     28 years — yet Nalaz 15 opens this grid on `nat` and it drew the hatch, the
     legend clause and the exported caption anyway. The corridor views, drawn from
     the very matrix that does not close, carried no caveat at all. */
  const preGate = [];
  for (const [h, want] of [['#v=yrs&c=0&y=2024&f=nat', false], ['#v=yrs&c=0&y=2024&f=ext', false],
    ['#v=yrs&c=0&y=2024&f=int', true], ['#v=saldo&c=0&y=2004&f=nat', false],
    ['#v=saldo&c=0&y=2004', true], ['#v=flow&s=HR-21&c=0&y=2004&dir=out', true],
    ['#v=mx&c=0&y=2004&dir=out', true]]) {
    await fresh(h);
    const r = await page.evaluate(() => ({
      note: document.querySelector('#legend .legend-note').textContent || '',
      hatch: document.querySelectorAll('#map .yrpre').length,
    }));
    const said = /margine ne zatvaraju/.test(r.note);
    if (said !== want || (/v=yrs/.test(h) && (r.hatch > 0) !== want)) {
      preGate.push(h + ' said=' + said + ' hatch=' + r.hatch + ' want=' + want);
    }
  }
  ck('the pre-2007 margin caveat is shown exactly where it is true',
    preGate.length === 0, preGate.slice(0, 3).join(' | '));

  /* …and the number the glossary puts on it has to be the payload's. The IPF
     paragraph quantified the caveat as "464–550 osoba" for 1998.–2006. —
     measured from src/data/atlas_data2.json, four of those nine years are 218,
     122, 61 and 27, and two of them run the OTHER WAY (more arrivals than
     departures), so the stated floor is seventeen times the 2001 gap and of the
     wrong sign. Only 2002–06 fall inside 464–550, which is what Legend's own
     comment and the commit that wrote the sentence both already recorded — and
     three paragraphs later the same panel states the bound correctly, so one
     glossary carried both the true figure and a false range for it.
     Derived from the data rather than pinned as literals: a DZS revision moves
     these nine numbers, and then the sentence has to move with them. */
  const gaps = (() => {
    const D = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/atlas_data2.json'), 'utf8'));
    const isos = Object.keys(D.c);
    const out = [];
    D.years.forEach((y, i) => {
      let oi = 0, ii = 0;
      for (const iso of isos) { oi += D.c[iso].oi[i]; ii += D.c[iso].ii[i]; }
      out.push({ y, gap: oi - ii });
    });
    const span = (a, b) => {
      const g = out.filter(r => r.y >= a && r.y <= b).map(r => Math.abs(r.gap));
      return [Math.min(...g), Math.max(...g)];
    };
    return { all: span(1998, 2006), late: span(2002, 2006),
      zero: out.filter(r => r.y >= 2007).every(r => r.gap === 0) };
  })();
  await fresh('');
  await click('#helpBtn');
  const gapCopy = await page.evaluate(() => document.querySelector('#helpCard').textContent || '');
  await click('#helpX');
  ck('the glossary’s pre-2007 margin figures are the ones the payload carries',
    gaps.zero && gaps.all[0] < gaps.late[0]
    && [gaps.all[0], gaps.all[1], gaps.late[0], gaps.late[1]]
      .every(v => gapCopy.includes(String(v))),
    JSON.stringify({ ...gaps, has: [gaps.all[0], gaps.all[1], gaps.late[0], gaps.late[1]]
      .map(v => [v, gapCopy.includes(String(v))]) }));

  /* clicking a cell is how the grid doubles as a year picker: it drives the same
     S.yi the scrubber and every other view read.
     The caveat sweep above ends on the matrix, so the grid this block reads has
     to be re-opened — without this the querySelector below returned null and
     `.dispatchEvent` threw *inside* an evaluate, which aborts the run rather
     than failing one check. */
  await fresh('#v=yrs&c=0&y=2024');
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
    const pos = d ? getComputedStyle(d).position : null;
    /* union, not the dock's own rect: the open body is anchored above the
       header stack and is outside it — see the same note in the overlay sweep */
    const bs = !d ? [] : [...d.querySelectorAll('.chipcard, .chipcard.open .chip-body')]
      .filter(c => c.getClientRects().length).map(c => c.getBoundingClientRect());
    const b = { left: Math.min(...bs.map(r => r.left)), right: Math.max(...bs.map(r => r.right)),
      top: Math.min(...bs.map(r => r.top)), bottom: Math.max(...bs.map(r => r.bottom)) };
    const c0 = document.querySelector('#map .yrc').getBoundingClientRect();
    return {
      pos,
      /* the two things that made this vacuous: a dock that stopped being
         absolute took the `skip` escape and asserted nothing, and an EMPTY box
         list left Math.min/Math.max at ±Infinity, so `r.left < -Infinity` is
         false for every cell and `under` came out 0 with a legitimate-looking
         diagnostic */
      boxes: bs.length,
      open: d ? d.querySelectorAll('.chipcard.open').length : 0,
      under: [...document.querySelectorAll('#map .yrc')].filter(c => {
        const r = c.getBoundingClientRect();
        return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
      }).length,
      cw: c0.width, ch: c0.height,
    };
  });
  ck('an open chip panel covers no cell, and the grid keeps a usable cell',
    ydock.pos === 'absolute' && ydock.open === 1 && ydock.boxes >= 3
    && ydock.under === 0 && ydock.cw >= 12 && ydock.ch >= 12, JSON.stringify(ydock));

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
        /* the dock must be floating AND have rendered cards, or there is nothing
           for the sweep above to have compared the cells against — a zero-area
           rect overlaps nothing and would report a clean sweep */
        return d && getComputedStyle(d).position === 'absolute'
          && [...d.querySelectorAll('.chipcard')].filter(c => c.getClientRects().length).length >= 2
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
  ck('and its Sitemap line names a sitemap that parses and lists both languages',
    /^https:\/\/\S+\/sitemap\.xml$/.test(smPath) && sitemap.status === 200 && !sitemap.err
    && sitemap.root === 'urlset' && sitemap.ns === 'http://www.sitemaps.org/schemas/sitemap/0.9'
    /* Two entries, not one: the English UI is a complete translation and `?l=en`
       is the only address it has — a fragment is never crawled. One origin
       across both, and the same origin the Sitemap line names. */
    && sitemap.locs.length === 2 && sitemap.locs.every(l => /^https:\/\//.test(l))
    && sitemap.locs.some(l => /\?l=en$/.test(l))
    && new Set(sitemap.locs.map(l => new URL(l).origin)).size === 1
    && smPath.startsWith(new URL(sitemap.locs[0]).origin),
    JSON.stringify({ smPath, ...sitemap }));

  /* …and the third copy of that origin. The suite had no assertion on <head>
     at all — no canonical, no og:, no twitter:, no meta description — so
     deleting the canonical, letting it drift to a stale origin, or dropping
     og:title printed ALL CHECKS PASS. The block above even compared the
     sitemap's <loc> origin against the robots.txt Sitemap line and never
     against index.html, which is where the same origin is written a third time.
     That is the same file-agreement pattern this suite already enforces between
     credits.ts and the <noscript>, applied to the one place a deployment
     mistake actually shows up.
     Presence, absoluteness and agreement — never the strings themselves, or
     every copy edit would be a suite failure. Both locales, because the
     canonical is per-locale and the hreflang set has to be reciprocal on each. */
  const headMeta = {};
  for (const [lang, h] of [['hr', ''], ['en', '?l=en']]) {
    await page.goto('about:blank');
    await page.goto(url + h, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => !!document.querySelector('#map'), { timeout: 15000 }).catch(() => {});
    await settle(300);
    headMeta[lang] = await page.evaluate(() => {
      const at = sel => (document.querySelector(sel) || {}).getAttribute?.('href')
        || (document.querySelector(sel) || {}).content || '';
      return {
        lang: document.documentElement.lang,
        canon: at('link[rel="canonical"]'),
        alts: [...document.querySelectorAll('link[rel="alternate"]')]
          .map(l => l.hreflang + '=' + l.getAttribute('href')).sort(),
        og: ['og:type', 'og:title', 'og:description', 'og:locale', 'og:locale:alternate']
          .map(k => (document.querySelector(`meta[property="${k}"]`) || {}).content || ''),
        tw: at('meta[name="twitter:card"]'),
        desc: at('meta[name="description"]'),
        author: at('meta[name="author"]'),
        title: document.title,
      };
    });
  }
  const origin = new URL(sitemap.locs[0]).origin;
  const headBad = [];
  for (const [lang, hd] of Object.entries(headMeta)) {
    if (hd.lang !== lang) headBad.push(lang + ' documentElement.lang=' + hd.lang);
    /* absolute, on the sitemap's origin, and self-referential per locale */
    if (!hd.canon.startsWith(origin)) headBad.push(lang + ' canonical=' + hd.canon);
    if ((lang === 'en') !== /\?l=en$/.test(hd.canon)) headBad.push(lang + ' canonical not self-referential: ' + hd.canon);
    /* the hreflang set is the same on both pages and covers both plus x-default */
    if (hd.alts.length !== 3 || !hd.alts.every(a => a.includes(origin))
      || !hd.alts.some(a => a.startsWith('x-default='))
      || !hd.alts.some(a => a === 'en=' + origin + '/?l=en')) headBad.push(lang + ' alts=' + hd.alts.join(' '));
    /* every locs entry has to be reachable from the head, and vice versa */
    for (const loc of sitemap.locs) {
      if (!hd.alts.some(a => a.endsWith('=' + loc))) headBad.push(lang + ' sitemap loc unlinked: ' + loc);
    }
    if (hd.og.some(v => !v)) headBad.push(lang + ' og=' + JSON.stringify(hd.og));
    if (hd.og[3] !== (lang === 'en' ? 'en_GB' : 'hr_HR')) headBad.push(lang + ' og:locale=' + hd.og[3]);
    if (hd.og[4] === hd.og[3]) headBad.push(lang + ' og:locale:alternate = og:locale');
    if (!hd.tw || !hd.desc || !hd.author || !hd.title) headBad.push(lang + ' empty head field');
  }
  /* and the two locales must not be serving each other's copy */
  if (headMeta.hr.desc === headMeta.en.desc || headMeta.hr.title === headMeta.en.title) headBad.push('hr and en share head copy');
  ck('the head carries a per-locale canonical, an hreflang set and complete cards, on one origin',
    headBad.length === 0, headBad.slice(0, 3).join(' | '));
  await fresh('');

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
  /* …in EVERY view, and as a ratchet rather than as a bar the app clears.
     This ran after `fresh('')`, i.e. in Saldo alone — and Saldo is one of the
     views that passes. Re-run verbatim in each of the seven at the same 390×844:
     saldo 69,04 %, klas 65,12 %, jmap 63,38 %, flow 60,02 %, reg 56,92 %,
     yrs 56,06 %, mx 31,86 %. Four of the six it skipped are under the 60 % it
     asserts, and on a phone two thirds of Matrica's characters are below 12 px.
     Those four are not a bug to be fixed here. The characters are the atlas's
     own chart and chrome type, every size of it deliberate and documented —
     Matrica's 6,5 px axis labels and its rail's 9,5 px corridor names, the 9 px
     legend title, the 10 px legend note, the 11,5 px segment buttons — and
     index.css says as much where it notes that 33 of its 74 sizes are under
     10 px "on an atlas whose purpose is reading small numbers". Raising them is
     a type-scale decision, not a check fix, and the grids' own floors are
     asserted separately at 6,5 px.
     So what is pinned is that no view gets WORSE: a per-view baseline two points
     under what each measures today. A regression in any of the seven is caught,
     and the check no longer claims a Lighthouse pass the app does not have. The
     name says ratchet for the same reason. */
  const legibleFloor = { saldo: 67, klas: 63, reg: 55, flow: 58, mx: 30, jmap: 61, yrs: 54 };
  const legible = [];
  for (const [v, h] of [['saldo', ''], ['klas', '#v=klas'], ['reg', '#v=reg'],
    ['flow', '#v=flow&s=HR-21&c=0&y=2018'], ['mx', '#v=mx&c=0&y=2018&dir=out'],
    ['jmap', '#v=jmap&dir=net'], ['yrs', '#v=yrs']]) {
    await fresh(h);
    legible.push({ v, floor: legibleFloor[v], ...await page.evaluate(() => {
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
      return { pct: +(big / total * 100).toFixed(2), total, clipped: clipped.length };
    }) });
  }
  ck('no view loses ground on phone type, and no rail cell is clipped to fit',
    legible.length === 7
    && legible.every(r => r.pct >= r.floor && r.total > 500 && r.clipped === 0),
    JSON.stringify(legible.filter(r => r.pct < r.floor || r.clipped > 0)) + ' ' + JSON.stringify(legible.map(r => r.v + ':' + r.pct)));
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
  /* All FOUR coordinates, and the interior. This returned [top, height] of four
     page-level containers, and CLS counts horizontal movement and movement
     INSIDE a container exactly as heavily. The fallback faces bind only the
     advance width, to ~2 % here — so a regressed size-adjust moves centred and
     right-aligned children sideways (the control row, the rail's values, the
     legend rows) and moves elements inside `main`, whose own box is stage-derived
     and therefore never changes, while all four measured pairs stay identical
     and both checks print ok. Two of the four box coordinates were simply never
     read. Keyed by selector rather than by index, so an element that legitimately
     disappears reports as missing instead of shifting every later comparison. */
  const swapBox = `(() => {
    const SEL = ['header.hd', 'main.main', '.ft', '#scrubBox',
      '.ctrls', '#segView', '#segView button:last-child', '#legend',
      '#railList .rrow:first-child', '#railList .rrow:last-child',
      '#railLab', '#bigYear', '.rail-hd', '#map'];
    const out = {};
    for (const s of SEL) {
      const e = document.querySelector(s);
      if (!e) { out[s] = null; continue; }
      const r = e.getBoundingClientRect();
      out[s] = [r.left, r.top, r.width, r.height].map(v => +v.toFixed(1));
    }
    return out;
  })()`;
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
        /* Whether the wrapped face exists on THIS machine, measured two ways
           that must agree: the font API's own answer, and whether the family
           still measures as the browser's default (i.e. resolved to nothing).
           `SENT` is a family that cannot exist, so it is what "no face" looks
           like. */
        const SENT = 'ZZ no such family 12345';
        const out = cases.map(([real, loc, wt, s]) => ({
          f: real + ' ' + wt,
          fb: +Math.abs(w(real + ' Fallback', wt, s) / w(real, wt, s) - 1).toFixed(4),
          raw: +Math.abs(w(loc, wt, s) / w(real, wt, s) - 1).toFixed(4),
          /* the real webfont itself — self-hosted, so it must load everywhere */
          webfont: w(real, wt, s) !== w(SENT, wt, s),
          loaded: document.fonts.check(wt + ' 100px "' + real + ' Fallback"')
            && w(real + ' Fallback', wt, s) !== w(SENT, wt, s),
        }));
        el.remove();
        return out;
      });
    }
    await p2.close();
  }
  /* The fallback pass aborts every .woff2 on purpose, and now that every page
     feeds the one ledger those aborts land in it like any other error. Scrubbed
     by URL and counted, the way the geo and entry-chunk scrubs are, so this can
     only ever remove what it minted — and the count proves the abort predicate
     is still doing something, which is the half a blanket wipe would lose. */
  {
    const had = errors.length;
    for (let i = errors.length - 1; i >= 0; i--) {
      if (/\.woff2/.test(errors[i]) && /ERR_FAILED|net::/.test(errors[i])) errors.splice(i, 1);
    }
    ck('the font-swap pass aborted the faces it meant to, and nothing else',
      had - errors.length >= 1 && errors.length === 0,
      JSON.stringify({ dropped: had - errors.length, left: errors.slice(0, 2) }));
  }
  /* The largest coordinate delta per element, on both axes, between the two
     loads. The four page-level containers must not move AT ALL — that is the
     0,1038 CLS this pair of checks was written for. Inside them the bar is 1 px:
     a metric-matched fallback binds the ADVANCE to ~2 %, so a text-sized box
     reflowing by a fraction of a pixel is what "matched" means, and anything
     past that is a real shift — as #bigYear's 12,5 px horizontal move was until
     its box was stretched rather than shrink-to-fit. */
  const CONTAIN = ['header.hd', 'main.main', '.ft', '#scrubBox'];
  const boxDiff = (a, b) => Object.keys(a).map(k => {
    if (!a[k] || !b[k]) return { k, d: a[k] === b[k] ? 0 : 99, fallback: a[k], real: b[k] };
    return { k, d: +Math.max(...a[k].map((v, i) => Math.abs(v - b[k][i]))).toFixed(1),
      fallback: a[k], real: b[k] };
  }).filter(x => x.d > (CONTAIN.includes(x.k) ? 0 : 1));
  const swapMoved = boxDiff(swap.fallback, swap.real);
  const swapNarrowMoved = boxDiff(swapNarrow.fallback, swapNarrow.real);
  /* …on a machine that HAS the faces these three rules wrap. Each one is
     `src:local('Arial')` / `local('Courier New')` / `local('Arial Narrow')`, and
     index.css states the other case: "if local() resolves to nothing — Arial
     Narrow is frequently absent on Linux — the face is skipped and the stack
     behaves exactly as it did before." On a Linux CI runner that is every one of
     them, and not because the fonts are missing: `font-family: Arial` goes
     through fontconfig's aliasing and finds Liberation Sans, while `local()`
     matches an installed face by name and finds nothing. Measured on
     ubuntu-latest and reproduced here by rewriting only those three names in the
     built CSS — identical width errors to four decimal places, 0,0787 / 0,0487 /
     0,2708 / 0,3124, as all four Fallback families fall through to the browser's
     default font.
     So the swap guarantee is a claim about a machine with those faces, and
     asserting it everywhere made a green CI impossible for a reason that is not
     a defect. It is asserted where it applies; where it does not, what is
     asserted instead is the degradation index.css promises — never a skip, and
     the detail line says which of the two ran. */
  const fbHere = swap.widths.every(x => x.loaded);
  const fbMode = fbHere ? 'metric-matched faces present'
    : 'absent: ' + swap.widths.filter(x => !x.loaded).map(x => x.f).join(', ');
  /* with the faces absent the swap moves things by definition; what still has to
     hold is that the stack degrades to something usable rather than to nothing */
  const laidOut = snap => ['header.hd', 'main.main', '.ft', '#scrubBox']
    .every(k => snap[k] && snap[k][3] > 0);
  ck('and it moves nothing at 390 px either, where the type scale changes',
    fbHere ? swapNarrowMoved.length === 0
      : laidOut(swapNarrow.fallback) && laidOut(swapNarrow.real),
    fbMode + ' ' + JSON.stringify(swapNarrowMoved.slice(0, 3)));
  /* the population floor moves with the selector list: a probe that measured
     nothing would otherwise report nothing moved */
  ck('the font swap moves nothing: no box on the page changes on either axis',
    Object.keys(swap.fallback).length >= 12
    && (fbHere ? swapMoved.length === 0 : laidOut(swap.fallback) && laidOut(swap.real)),
    fbMode + ' ' + JSON.stringify(swapMoved.slice(0, 3)));
  /* PER FACE, because that is the contract index.css states: "if local()
     resolves to nothing — Arial Narrow is frequently absent on Linux — the face
     is skipped and the stack behaves exactly as it did before". The gate was
     all-or-nothing on both arms, so a machine in the ordinary mixed state failed
     the suite on a configuration the stylesheet explicitly supports: measured
     with only local('Arial Narrow') broken, the two Plex faces load and measure
     0,0023–0,0031 while Oswald does not, `fbHere` goes false, and the else-arm's
     `every(x => !x.loaded)` is false too — red, with the app and the CSS
     behaving exactly as documented. A face that resolved is held to the bar; a
     face that did not is skipped, and the detail line names it. */
  ck('and each fallback face is closer to its webfont’s width than doing nothing',
    swap.widths.length === 4 && swap.widths.every(x => x.webfont)
    && swap.widths.every(x => (x.loaded ? x.fb <= x.raw && x.fb < 0.02 : true)),
    fbMode + ' ' + JSON.stringify(swap.widths));

  /* …and the RULES, not only their effect. Every clause above infers "this
     machine lacks the faces" from the exact observation a broken rule produces,
     so the two are indistinguishable: measured, mistyping the three local()
     names in the built CSS — local('Arial') → local('Ariall') and the rest —
     turns all four `loaded` flags false and every font-swap check passes, on a
     Windows machine that HAS the faces as readily as on a Linux runner that does
     not. The CLS guarantee they exist to pin is then asserted by nothing
     anywhere. A declaration cannot be satisfied by a face being absent, so the
     names are read back out of the stylesheet the page actually served. */
  const faceSrc = await page.evaluate(() => {
    const out = [];
    for (const sh of document.styleSheets) {
      try {
        for (const r of sh.cssRules) {
          if (r.constructor.name === 'CSSFontFaceRule' && /Fallback/.test(r.style.getPropertyValue('font-family'))) {
            out.push(r.style.getPropertyValue('src'));
          }
        }
      } catch { /* an unreadable sheet — none is served here */ }
    }
    return out;
  });
  const wantLocal = { "local(\"Arial\")": 3, "local(\"Courier New\")": 2, "local(\"Arial Narrow\")": 2 };
  const gotLocal = {};
  for (const src of faceSrc) {
    const k = (src.match(/local\([^)]*\)/) || [''])[0].replace(/'/g, '"');
    gotLocal[k] = (gotLocal[k] || 0) + 1;
  }
  ck('the metric-matched fallbacks still name the faces they are adjusted to',
    faceSrc.length === 7
    && Object.entries(wantLocal).every(([k, v]) => gotLocal[k] === v),
    JSON.stringify({ n: faceSrc.length, got: gotLocal }));

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
  /* A real set comparison, not one name. `en1.top === 'Grad Zagreb'` re-asserts a
     conjunct the check two blocks up already makes, and samples 1 of the 577
     place names the claim covers — so 20 counties and all 556 municipalities
     could be translated and this printed ok. Both lists, element for element,
     against the same lists read in Croatian. */
  const namesHr = {};
  for (const [k, h, sel] of [['rail', '#v=saldo&c=1&y=2024', '#railList .rname'],
    ['jls', '#v=jmap&dir=net', '.jl']]) {
    await fresh(h);
    namesHr[k] = await page.evaluate(x => x === '.jl'
      ? [...document.querySelectorAll('.jl')].map(e => (e.getAttribute('aria-label') || '').split(',')[0])
      : [...document.querySelectorAll(x)].map(e => e.textContent.trim()), sel);
  }
  const namesEn = {};
  for (const [k, h, sel] of [['rail', '#l=en&v=saldo&c=1&y=2024', '#railList .rname'],
    ['jls', '#l=en&v=jmap&dir=net', '.jl']]) {
    await fresh(h);
    namesEn[k] = await page.evaluate(x => x === '.jl'
      ? [...document.querySelectorAll('.jl')].map(e => (e.getAttribute('aria-label') || '').split(',')[0])
      : [...document.querySelectorAll(x)].map(e => e.textContent.trim()), sel);
  }
  ck('county names are left in Croatian, because they are identifiers',
    namesHr.rail.length === 21 && namesEn.rail.length === 21
    && namesHr.jls.length === 556 && namesEn.jls.length === 556
    && namesHr.rail.every((n, i) => n === namesEn.rail[i])
    && namesHr.jls.every((n, i) => n === namesEn.jls[i]),
    JSON.stringify({ rail: namesHr.rail.length, jls: namesHr.jls.length,
      firstDiff: namesHr.jls.find((n, i) => n !== namesEn.jls[i]) || null }));
  await fresh('#l=en&v=saldo&c=1&y=2024');

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
      /* …but only for text. An aria-label on a lang="hr" element is a *mixed*
         string — place name plus a locale-formatted year and number — and the
         year in it still has to follow the UI language. Marking the county
         paths, the rail rows and the two grids' rows as Croatian place names
         (which is what a screen reader needs) would otherwise have taken 735
         cell labels and 21 rail rows out of this sweep. */
      const exemptLabel = el => !!(el && el.closest && el.closest('.paper-link, .help-cite, noscript'));
      const out = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const s = (n.textContent || '').trim();
        if (!s || !isOrd(s) || exempt(n.parentElement)) continue;
        out.push('text «' + s.slice(0, 50) + '»');
      }
      for (const el of document.querySelectorAll('[aria-label],[title]')) {
        if (exemptLabel(el)) continue;
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

  /* The other half of the same problem: a Croatian place name inside a lang="en"
     document is voiced with English phonemes unless the element that carries it
     says otherwise, and an aria-label cannot annotate itself. The rule was
     applied on four surfaces — county paths, JLS paths, rail names and the study
     citation — and missing everywhere else a place name reaches the
     accessibility tree: both card headings, the Tokovi legend, the JLS corridor
     rows, and every row and cell of the two grids, which is 756 labels and the
     only practical way to read those views with a screen reader.
     Resolved the way a screen reader resolves it, by walking ancestors. */
  const langSweep = [];
  for (const [h, sel, min] of [
    ['#l=en&v=saldo&c=1&y=2024&s=HR-14', '#cardName', 1],
    ['#l=en&v=mx&y=2018&c=0', '#map .mxc', 420],
    ['#l=en&v=mx&y=2018&c=0', '#map g[role="row"]', 21],
    ['#l=en&v=yrs&c=1&y=2024', '#map .yrc', 315],
    ['#l=en&v=yrs&c=1&y=2024', '#map g[role="row"]', 21],
    ['#l=en&v=mx&y=2018&c=0&s=HR-14&pp=HR-21', '#pairName', 1],
    ['#l=en&v=flow&s=HR-13&y=2018&dir=out&c=0', '.legend-title span[lang]', 1],
    ['#l=en&v=saldo&c=1&y=2024', '#railList .rrow', 21],
  ]) {
    await fresh(h);
    const r = await page.evaluate(sl => {
      const els = [...document.querySelectorAll(sl)];
      const lang = e => { const a = e.closest('[lang]'); return a ? a.getAttribute('lang') : document.documentElement.lang; };
      return { n: els.length, hr: els.filter(e => lang(e) === 'hr').length };
    }, sel);
    if (r.n < min || r.hr !== r.n) langSweep.push(`${h} ${sel} ${r.hr}/${r.n} want >=${min}`);
  }
  /* the JLS corridor rows need the card opened */
  await fresh('#l=en&v=flow&s=HR-21&y=2018&dir=out&c=0');
  await click('#jcardHd');
  const jLang = await page.evaluate(() => {
    const e = document.querySelector('#jcardList .jn');
    const a = e && e.closest('[lang]');
    return { got: !!e, lang: a ? a.getAttribute('lang') : document.documentElement.lang };
  });
  if (!jLang.got || jLang.lang !== 'hr') langSweep.push('jcard .jn ' + JSON.stringify(jLang));
  ck('every surface that voices a place name is marked lang="hr" in English',
    langSweep.length === 0, langSweep.slice(0, 3).join(' | '));
  await fresh('');

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
  /* The Zemlje tab rendered its twelve rows straight from the Croatian data keys,
     so an English reader met Njemačka, Filipini, Sjeverna Makedonija and
     Švicarska under an English caption and English column totals — in a panel
     whose other tab translates the group labels and the ISO codes inside them.
     They are exonyms, not identifiers: i18n's exemption covers county and
     municipality names, DZS table numbers and the study's citation. */
  await fresh('#l=en&cz=2');
  const enZem = await page.evaluate(() => [...document.querySelectorAll('#zemList .jrow .jn')]
    .map(e => e.textContent.trim()));
  ck('the Zemlje tab reads in English too',
    enZem.length >= 13 && enZem.includes('Germany') && enZem.includes('Philippines')
    && enZem.includes('North Macedonia') && enZem.includes('Switzerland')
    && !enZem.some(x => /Njemačka|Filipini|Švicarska|Sjeverna Makedonija/.test(x)),
    JSON.stringify(enZem.slice(0, 6)));
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

  /* …and the glossary, which is the largest body of prose in the app and which
     no sweep above can reach: the panel has no hash parameter, so every
     `fresh('#l=en&…')` in this block opens a document whose help card is shut.
     It has to be clicked open, and its tabs walked.
     What that hid: the English half of the colour rule named eight controls by
     their CROATIAN labels — "That holds for Saldo, Regije, Godine and the Neto
     direction. In Odlasci and Dolasci (Tokovi, Matrica) …" — while those
     segments read Net / Regions / Years and Out / In / Net on the English
     screen. The one sentence telling an English reader when the colour means
     gain-versus-loss and when it means magnitude-only pointed at controls that
     are not on the page, and the paragraph's own comment records that it was
     their only source for the Odlasci/Dolasci case.
     CRO is widened with the view and direction labels, which is what makes the
     glossary sweep able to see this class at all. */
  const CROCTL = /\b(saldo|klasifikacij\w*|regije|godine|tokovi|matrica|odlasc\w*|dolasc\w*)\b/i;
  await fresh('#l=en&v=saldo&c=1&y=2024');
  await click('#helpBtn');
  const enHelp = await page.evaluate(async () => {
    const card = document.querySelector('#helpCard');
    if (!card) return { absent: true };
    const tabs = [...card.querySelectorAll('[role="tab"]')];
    const seen = [];
    for (const tb of tabs.length ? tabs : [null]) {
      if (tb) { tb.click(); await new Promise(r => setTimeout(r, 160)); }
      seen.push(card.textContent || '');
    }
    return { tabs: tabs.length, text: seen.join(' · ') };
  });
  const helpBad = enHelp.absent ? ['#helpCard absent']
    : [...(enHelp.text.match(CRO) || []), ...(enHelp.text.match(CROCTL) || [])].slice(0, 5);
  await click('#helpX');
  ck('the glossary reads in English too, including the control names it cites',
    !enHelp.absent && enHelp.text.length > 2000 && helpBad.length === 0,
    JSON.stringify({ tabs: enHelp.tabs, len: enHelp.text.length, bad: helpBad }));

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
    /* The head fields below are written by an effect, so the app has to have
       mounted before they can be read — the same wait the <head> block upstream
       makes, for the same reason. `l` alone survived without it: setLang runs at
       module init, long before React commits anything. */
    await pg.waitForFunction(() => !!document.querySelector('#map'), { timeout: 15000 }).catch(() => {});
    await settle(250);
    const r = await pg.evaluate(() => ({
      l: document.documentElement.lang, hash: location.hash,
      canon: (document.querySelector('link[rel="canonical"]') || {}).getAttribute?.('href') || '',
      ogl: (document.querySelector('meta[property="og:locale"]') || {}).content || '',
    }));
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
  /* `hash` was collected, stringified into the failure extra and never asserted,
     while this check's own name promises it. A change that wrote the *detected*
     language into the encoded hash whenever it differs from the Croatian default
     would give every German and English reader abroad `#l=en` in every link they
     copy — forcing English on a Croatian recipient, the exact harm the note above
     argues against — and this stayed green. The two sibling checks that do assert
     it cover only in-region readers and the stored-choice case. */
  ck('hr/sr/bs readers get Croatian, everyone else English, with no l= in the link',
    detect[0].l === 'hr' && detect[1].l === 'hr' && detect[2].l === 'hr'
    && detect[3].l === 'en' && detect[4].l === 'en'
    && detect.every(r => !/l=/.test(r.hash)),
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
    outR.every(r => r.l === r.want && !/l=/.test(r.hash)), JSON.stringify(outR));

  /* An explicit act beats an inference, always. A reader sitting in Zagreb who
     once pressed EN gets English on the next visit — the region must not
     silently undo the one signal that is not a guess. */
  const stored = await bootLang(['hr-HR', 'hr'], 'Europe/Zagreb', 'en');
  ck('a stored choice still outranks both signals, and is that reader’s own default',
    /* no l= either: BASE.lang resolves from the stored choice, so English *is*
       this reader's default and a link they share must not force it on anyone */
    stored.l === 'en' && !/l=/.test(stored.hash), JSON.stringify(stored));

  /* Every page in the four blocks above was opened at the bare `/`, and the bare
     `/` is the address the head has to describe — not whoever happens to be
     reading it. The canonical was written from S.lang, i.e. from the reader: a
     rendering crawler reports navigator.languages ['en-US'] and a US timezone,
     which is exactly the de-DE, en-GB and ja-JP rows above, and for every one of
     them the bare URL rendered `canonical …/?l=en`. That is the hreflang `hr`
     target and the x-default telling a crawler the Croatian half of the atlas is
     a duplicate of the English page — the de-indexing the per-locale scheme
     exists to prevent — from the one address that renders the bare canonical for
     a Croatian reader. Nothing else in the file could see it: every other page is
     pinned to hr-HR and Europe/Zagreb at launch, so the <head> block's
     self-referential assertion only ever runs with the reader's language already
     equal to the URL's. */
  const bareHead = [...detect, ...inR, ...outR, stored];
  const bareBad = bareHead.filter(r => !/^https:\/\/[^?#]+\/$/.test(r.canon) || r.ogl !== 'hr_HR');
  ck('and the bare / still calls itself the Croatian page however the reader is configured',
    bareBad.length === 0 && bareHead.length >= 15, JSON.stringify(bareBad.slice(0, 3)));

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
  /* …and so does the description. index.html ships the Croatian one because it
     is static markup parsed before any script runs — the same reason the title is
     corrected in an effect — and nothing ever moved it, so an English reader
     sharing a link handed the recipient a preview card written in Croatian, and a
     crawler that renders the page indexed the same. */
  const metaDesc = {};
  for (const [lang, h] of [['hr', '#'], ['en', '#l=en&']]) {
    await fresh(h + 'v=saldo&c=1&y=2024');
    metaDesc[lang] = await page.evaluate(() =>
      (document.querySelector('meta[name="description"]') || {}).getAttribute?.('content') || '');
  }
  ck('the meta description follows the language too',
    /županija/.test(metaDesc.hr) && /counties/.test(metaDesc.en)
    && metaDesc.hr !== metaDesc.en, JSON.stringify({ hr: metaDesc.hr.slice(0, 40), en: metaDesc.en.slice(0, 40) }));

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

  /* …in the pointer mode the band was actually measured in. index.css re-pads
     every control to 44 px under (pointer:coarse), which takes the row
     1391 → 1522 in Saldo and 1646,6 → 1789,6 in Klasifikacija and moves the
     shared-line band to 2148–2415 — but every sweep above sets only width and
     height, so `@media (pointer:coarse)` matched at no width above 390 and the
     band the fix is about was entered by nothing. 2272 was chosen as "the top of
     the band and the worst case" and then only ever exercised in the mode where
     it is not one; a regression confined to the coarse block (a stray
     `.ctrls{flex-basis:auto}` in it) reproduces the original 841 px hop on a
     large touch display with every sweep still green.
     `pointer` is not one of the features puppeteer's emulateMediaFeatures
     accepts, so the mode comes from the viewport flags the 390 branch already
     uses — and the check asserts it took, since silently running fine is
     precisely the hole being closed. */
  const coarseMoves = [];
  let coarseOn = false;
  for (const W of [2415, 2272, 2148]) {
    await page.setViewport({ width: W, height: 1080, hasTouch: true, isMobile: true });
    for (const [from, to] of [['klas', 'saldo'], ['saldo', 'klas'], ['klas', 'jmap']]) {
      await fresh('#v=' + from);
      coarseOn = await page.evaluate(() => matchMedia('(pointer:coarse)').matches
        && getComputedStyle(document.documentElement).getPropertyValue('--hbw').trim() === '44px');
      const before = await page.evaluate(CTRL_SNAP);
      await click(`#segView button[data-v="${to}"]`);
      await settle(200);
      const m = movedBetween(before, await page.evaluate(CTRL_SNAP));
      if (m.length) coarseMoves.push(`${W}px coarse ${from}→${to}: ` + m.join(' | '));
    }
  }
  ck('and none of it moves with a coarse pointer either, across its own 2148–2415 band',
    coarseOn && coarseMoves.length === 0,
    coarseOn ? coarseMoves.slice(0, 3).join('  ;  ').slice(0, 300) : 'pointer:coarse never matched');
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

  /* …and Back must not be mistaken for a fresh pick. The journey above carries
     no `st=`, so it took the replaceState branch and this check never looked at
     Forward at all. With a Nalaz in the stack it is a different story: onPop
     mirrored `lastView` and not `lastStory`, so the render a popstate causes
     read as a deliberate preset pick, took the pushState branch, and appended a
     duplicate of the entry just navigated to — truncating the forward stack. It
     only surfaces once the hash needs re-canonicalising, which is exactly what a
     language toggle does: entries written before it carry no `l=` while the
     restored state has one, so the sync effect's exact-match early return does
     not fire. Measured over ./dist: pick Nalaz 13, press Saldo, toggle EN, then
     Back — and Forward throws "History entry to navigate to not found", with a
     second Back landing on the byte-identical hash and view, a press with no
     visible effect. Without the toggle, Forward works. */
  const fwdStack = await (async () => {
    const pg = await watch(await browser.newPage());
    await pg.emulateTimezone('Europe/Zagreb');
    await pinHr(pg);
    await pg.goto(url + '#v=saldo&c=1&y=2024', { waitUntil: 'networkidle0' });
    await settle(300);
    await pg.select('#story', '12');                   /* Nalaz 13 — pushes */
    await settle(350);
    await pg.click('#segView button[data-v="saldo"]'); /* pushes */
    await settle(350);
    const from = await pg.evaluate(() => location.hash);
    await pg.click('#segLang button[data-l="en"]');    /* replaces this entry */
    await settle(350);
    await pg.goBack();                                 /* onto the Nalaz entry */
    await settle(400);
    const onNalaz = await pg.evaluate(() => ({ hash: location.hash, cap: !!document.querySelector('#storyCap') }));
    let fwd = null, threw = null;
    try { await pg.goForward(); await settle(400); fwd = await pg.evaluate(() => location.hash); }
    catch (e) { threw = String(e.message).slice(0, 60); }
    await pg.close();
    return { from, onNalaz, fwd, threw };
  })();
  ck('Back onto a Nalaz entry keeps the Forward stack instead of pushing over it',
    /st=13/.test(fwdStack.onNalaz.hash) && fwdStack.onNalaz.cap
    && !fwdStack.threw && /v=saldo/.test(fwdStack.fwd || '') && !/st=/.test(fwdStack.fwd || ''),
    JSON.stringify(fwdStack));

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
  /* The other half of that promise. index.html's boot-fail line covers the
     PRE-mount case only — createRoot has replaced that markup by the time a
     render throw happens, and React 19 unmounts the root on an uncaught one.
     Measured before the boundary: one TypeError from the commit phase took
     #root's innerHTML from 174.323 characters to 0, body.innerText to '', and
     a,button,select,input from 42 to 0 — no reload affordance of any kind — while
     the background and the tab title stayed put, so the tab looked alive. The
     hash is untouched, so a hash-deterministic defect reproduces for every
     recipient of the link with no in-page way out. */
  /* Booted on `?l=en`, the English UI's only crawlable address, because the
     query is half of what these links have to carry: a reader who arrived
     there has nothing stored (storeLang persists only an explicit toggle), so
     an affordance that drops it returns them to the Croatian page. */
  await fresh('?l=en#v=saldo&c=1&y=2024&s=HR-18');
  const boundary = await page.evaluate(async () => {
    const before = document.querySelector('#root').innerHTML.length;
    /* A fault React must actually observe. The old injection — a throwing
       `getBoundingClientRect` getter on the HR-18 county path, then a click on
       the Matrica segment — was never read during that switch, so nothing threw
       at all: measured, the view changed normally (#root 116.259 → 229.301
       characters), #renderFail was absent, and the assertion's `alive` term
       (`#map || #renderFail`) was satisfied by the perfectly healthy app. This
       was the only one of 466 checks that touches ErrorBoundary, so the
       component could have been deleted outright and the suite still printed ALL
       CHECKS PASS — which is how two broken recovery links shipped inside markup
       no check had ever rendered.
       `Intl.NumberFormat.prototype.format` is read by every figure on the page,
       during render, so a getter on it is a render-phase throw by construction;
       ArrowLeft steps the year and drives one. */
    Object.defineProperty(Intl.NumberFormat.prototype, 'format', {
      get() { throw new TypeError('verify: forced render failure'); }, configurable: true });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    const root = document.querySelector('#root');
    const f = document.querySelector('#renderFail');
    return { before, after: root ? root.innerHTML.length : 0,
      controls: document.querySelectorAll('a,button,select,input').length,
      fail: !!f, map: !!document.querySelector('#map'),
      role: f && f.closest('[role]') ? f.closest('[role]').getAttribute('role') : null,
      links: f ? f.querySelectorAll('a').length : 0,
      /* …and where each of them goes. Every href was built from
         `location.pathname` alone, or for one of them pathname + hash, so three
         things were wrong at once: the Croatian "Osvježite stranicu" was
         byte-identical to the "otvorite bez poveznice" beside it, so the link
         that says RELOAD discarded the permalink that carried the reader here;
         all four dropped `location.search`, and `?l=en` is the English UI's only
         crawlable address, so a reader who arrived on that shared link — with
         nothing stored, since storeLang persists only an explicit toggle — was
         returned to the Croatian page by every affordance on the screen; and the
         English "Reload the page" pointed at the URL already in the bar, which
         the navigate algorithm treats as a same-document fragment navigation, so
         measured it did not reload at all. Resolved against the document, so a
         relative href is compared as the browser would follow it. */
      hrefs: f ? [...f.querySelectorAll('a')].map(a => a.href.replace(location.origin, '')) : [],
      reloads: f ? [...f.querySelectorAll('a')].filter(a => a.href === location.href).length : 0 };
  });
  /* The boundary itself, not "either it or a surviving app": #renderFail present,
     #map gone, and the fallback's own affordances actually in the document. */
  ck('a render failure renders the boundary, with something to press, not an empty root',
    boundary.after > 0 && boundary.controls > 0 && boundary.fail && !boundary.map
    && boundary.role === 'alert' && boundary.links === 4, JSON.stringify(boundary));
  /* Two distinct addresses among the four: each locale offers "reload" — which
     keeps the query AND the fragment — and "without the permalink", which keeps
     the query and drops the fragment. A pair that is byte-identical is one
     affordance printed twice. */
  ck('and its four recovery links are two real addresses, both carrying the query',
    boundary.hrefs.length === 4
    && new Set(boundary.hrefs).size === 2
    && boundary.hrefs.filter(h => h.includes('#')).length === 2
    && boundary.hrefs.every(h => h.startsWith('/?l=en'))
    /* both reload links point at the address the reader is already on, because
       that is what reloading IS — which is exactly why neither may depend on the
       navigation happening: see the click check below */
    && boundary.reloads === 2,
    JSON.stringify({ hrefs: boundary.hrefs, reloads: boundary.reloads }));
  /* …and the word "reload" has to mean it. Both reload links necessarily point
     at the URL already in the bar — that is what reloading IS — and the HTML
     navigate algorithm answers a same-document fragment navigation by doing
     nothing at all: measured, pressing "Reload the page" left the marker set,
     #renderFail still on screen and the href unchanged. It only reloaded when
     the URL happened to carry a query string, which is why one earlier probe
     saw it work. A marker on window is the only thing that can tell a real load
     from a no-op. */
  const reloadWorks = await (async () => {
    await page.evaluate(() => { window.__eb = 'before'; });
    const links = await page.$$('#renderFail a');
    const idx = boundary.hrefs.findIndex(h => h.includes('#'));
    if (idx < 0 || !links[idx]) return { absent: true };
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
      links[idx].click(),
    ]);
    await page.waitForFunction(() => !!document.querySelector('#map'), { timeout: 15000 }).catch(() => {});
    await settle(300);
    return page.evaluate(() => ({ marker: window.__eb ?? 'gone',
      fail: !!document.querySelector('#renderFail'), map: !!document.querySelector('#map'),
      href: location.pathname + location.search }));
  })();
  ck('…and pressing the reload link actually reloads the document',
    reloadWorks.marker === 'gone' && !reloadWorks.fail && reloadWorks.map
    && reloadWorks.href === '/?l=en', JSON.stringify(reloadWorks));
  /* The fault was ours and it logs twice — React's own uncaught-error line and
     ErrorBoundary's componentDidCatch — so it is spliced out here rather than
     left to fail the ledger assertion below. Named by the message this block
     minted, and counted, so it can only ever remove its own two lines. */
  {
    const had = errors.length;
    for (let i = errors.length - 1; i >= 0; i--) {
      if (/verify: forced render failure/.test(errors[i])) errors.splice(i, 1);
    }
    ck('the forced render failure logged exactly its own two lines and nothing else',
      had - errors.length === 2, JSON.stringify({ dropped: had - errors.length, left: errors.slice(0, 2) }));
  }
  /* the Intl getter is global to that document, so leave it behind before
     anything else measures a number */
  await fresh('');
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
  /* __dirname, like the CSP read at the top of this file and the LICENCE read
     further down. This was the one cwd-relative readFileSync in 5.000 lines, so
     `node ../scripts/verify.cjs C:/repo/dist` from anywhere but the repo root
     threw ENOENT here, unwound to the outer handler, and skipped the 19 checks
     after it — the count invariant that exists to catch a short run among them. */
  const vercelCfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8'));
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
  /* …and the third surface painted from that scale, which the block forgot: the
     rail's 21 magnitude bars carry an inline background-color from the same d3
     ramp, so forced-colors turned all of them and the zero divider into Canvas —
     measured at 1,00:1 against the page, bars keeping their 9,5 / 2,6 / 0,3 px
     widths and painting nothing. Distinctness alone would not have caught it:
     three identical blacks are three identical blacks whether or not they match
     the page, so this compares the bar ink against the body behind it. */
  const fcRail = await page.evaluate(() => {
    const body = getComputedStyle(document.body).backgroundColor;
    const bars = [...document.querySelectorAll('#railList .rbar')];
    const bg = bars.map(e => getComputedStyle(e).backgroundColor);
    const z = document.querySelector('.rbar-zero');
    return { n: bars.length, distinct: new Set(bg).size, body,
      sameAsPage: bg.filter(c => c === body).length,
      adjust: bars.length ? getComputedStyle(bars[0]).forcedColorAdjust : null,
      zero: z ? getComputedStyle(z).backgroundColor : null };
  });
  await forced(false);

  /* ── the two grids own rows, and rows own cells ──
     ARIA 1.2 lets a `grid` own only row and rowgroup, and both grids owned their
     axis labels directly: measured on the AX tree, Matrica's grid node had 42
     unignored generic children (21 row names + 21 column names) before its 21
     rows, and Godine 49 — none aria-hidden, and the document declares no
     columnheader or rowheader anywhere. In browse mode that is 42 bare county
     names read before the table with nothing tying them to a column; in table
     mode they are unreachable, and crossing a row announces a column NUMBER
     because there is no header to announce.
     And wherever a cell is wide enough to print its value, the
     `<g role="presentation">` around the pair is flattened, so each row owned its
     gridcells interleaved with loose StaticText numbers — 417 of them in Matrica
     at 1920×1080 and 315 in Godine, every value announced twice, NVDA's row
     reading alternating cell / stray text. The suite ran at 1440×900, where the
     cell is 19 px and no number is drawn, so it never saw that half at all —
     which is why this measures at 1920×1080. */
  await page.setViewport({ width: 1920, height: 1080 });
  const gridOwn = [];
  for (const [h, label] of [['#v=mx&y=2018&c=0&dir=out', 'mx'], ['#v=yrs&c=0&y=2024', 'yrs']]) {
    await fresh(h);
    const nums = await page.evaluate(() => document.querySelectorAll('#map .mxnum').length);
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const byId = new Map(nodes.map(x => [x.nodeId, x]));
    const grid = nodes.find(x => x.role && x.role.value === 'grid');
    const kids = grid ? (grid.childIds || []).map(i => byId.get(i)).filter(Boolean).filter(x => !x.ignored) : [];
    const rows = kids.filter(x => x.role.value === 'row');
    const cellsBad = rows.flatMap(r => (r.childIds || []).map(i => byId.get(i)).filter(Boolean)
      .filter(x => !x.ignored && x.role.value !== 'gridcell').map(x => x.role.value));
    gridOwn.push({ label, nums, kids: kids.length, rows: rows.length,
      notRow: kids.filter(x => x.role.value !== 'row').map(x => x.role.value).slice(0, 3),
      cellsBad: cellsBad.slice(0, 3), nBad: cellsBad.length });
  }
  await page.setViewport({ width: 1440, height: 900 });
  await cdp.detach();
  /* the number floor is what makes the second half meaningful: at a viewport
     where nothing is printed there is nothing to be announced twice */
  ck('each grid owns only rows, and each row only gridcells, even where the cells print their values',
    gridOwn.length === 2 && gridOwn.every(g => g.nums > 100 && g.rows === 21
      && g.kids === g.rows && g.nBad === 0),
    JSON.stringify(gridOwn));

  ck('forced colors keeps the two colour keys legible and the pressed state visible',
    fcKlas.distinct === 3 && fcKlas.adjust === 'none' && parseFloat(fcKlas.outline) >= 2
    && fcBar.adjust === 'none' && parseFloat(fcBar.border) >= 1 && /gradient/.test(fcBar.img),
    JSON.stringify({ fcKlas, fcBar }));

  ck('forced colors keeps the rail ranked in ink rather than in blank rows',
    fcRail.n === 21 && fcRail.adjust === 'none' && fcRail.sameAsPage === 0
    && fcRail.distinct >= 10 && fcRail.zero !== null && fcRail.zero !== fcRail.body,
    JSON.stringify(fcRail));

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
      /* …and the same question asked of the DOM rather than of a typed list,
         because a typed list cannot name what it does not know about. Matrica's
         eight region rules and its grid outline carry no class at all, so no
         extension of ['.mxc','.mxd','.mxsel rect'] could ever have selected
         them — and the raster half above cannot see them either: it strips
         `vector-effect` and diffs, so an element that never declared the
         attribute is byte-identical in both rasters and contributes 0 changed
         pixels. That diff can prove a declared attribute works; it can never
         find a stroke that fattens. Measured at the sweep's own 3-press zoom
         (k = 4,096) those nine drew 4,51 px of a 1,1 px rule while the check
         printed ok.
         The flow arcs, their casings and the hub dot are exempt: they divide
         their own stroke width by k by design, which is the other way of
         solving the same problem. */
      const scaling = [...document.querySelectorAll('#map g [stroke]')]
        .filter(e => e.getAttribute('stroke') !== 'none')
        .filter(e => !e.matches('.arc, .arccase, .hubdot'))
        .filter(e => e.getAttribute('vector-effect') !== 'non-scaling-stroke')
        .map(e => e.tagName + '.' + (e.getAttribute('class') || e.parentElement?.getAttribute('class') || '?'));
      return { moved, px: a.length / 4, declares, scaling: scaling.slice(0, 6), nScaling: scaling.length };
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
      r.moved > 2000 && Object.values(r.declares).every(Boolean) && r.nScaling === 0,
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
  /* Every control this run pressed was there to press, and every fresh() found
     an app. Both helpers used to swallow their own timeout and carry on — one
     into an unconditional page.click that throws "No element found for selector"
     from inside a helper, the other into an evaluate whose first unguarded
     `querySelector('X').textContent` throws on null — and either unwinds the
     whole run. Measured on HEAD: 415/463 under CPU contention, and 251/463 in
     this audit's own baseline. Recorded and reported here instead, so a slow
     mount costs one red line rather than the tail of the suite, and the
     documented check count below stays a constant. */
  ck('every control this run pressed was present, and every boot mounted the app',
    missed.length === 0, missed.slice(0, 4).join(' | '));
  ck('the suite ran its full documented check count', n + 1 === EXPECTED_CHECKS, `${n + 1} vs ${EXPECTED_CHECKS}`);
})().then(
  () => finish(),
  e => { console.error('harness error:', e); return finish(2); },
);
