#!/usr/bin/env node
/* The bilingual sweep, wider than the suite can afford to be.

   verify.cjs checks both languages over sixteen states and takes half an hour
   doing everything else as well; this asks the same questions over the whole
   state space and over the source, and it is meant to be run by hand — before a
   release, or after a change that touches copy.

   Usage:
     node scripts/i18n-sweep.cjs            # static scan only (no browser, <1 s)
     node scripts/i18n-sweep.cjs dist-test  # static scan + a browser sweep

   TWO HALVES, because they catch different things.

   STATIC. Every `L(hr, en)` pair in src/ — one call is one promise that the
   string has two languages. The failures it can see are the ones a browser
   cannot: a pair whose halves are identical (a translation that was never
   written, which renders as Croatian to an English reader with nothing to
   distinguish it from a deliberate exonym), and a pair whose halves disagree
   about their own placeholders, where `{span}` in one and not the other means
   one language prints a literal brace. Deliberate identity is real — "DZS" is
   "DZS" — so identical pairs are LISTED and counted rather than failed, and the
   count is what a reader compares against the number they expect.

   DYNAMIC. The suite's own rules — a Croatian diacritic outside lang="hr", a
   Croatian word in the English UI, an English word in the Croatian one — over
   every view, every panel and every Nalaz rather than the sixteen states the
   suite can fit. Place names are subtracted the way verify.cjs subtracts them,
   from the same two payloads.

   Exit 1 on any finding, so it can be wired into something later; it is
   deliberately NOT part of `npm run verify`, which has to stay a fixed-size
   protocol. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

/* ── static ─────────────────────────────────────────────────────────────── */

/* A quote-aware reader rather than a regex: an `L()` argument routinely
   contains apostrophes, commas, brackets and nested template literals, and
   every pattern that tries to match the pair in one go gets one of them wrong.
   This walks the two arguments with a tiny scanner instead, which is the only
   thing that reads them the way the compiler does. */
function readArg(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++;
  const q = s[i];
  if (q !== "'" && q !== '"' && q !== '`') return null;
  let out = '', d = 0;
  for (i++; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { out += s[i + 1]; i++; continue; }
    if (q === '`' && c === '$' && s[i + 1] === '{') { d++; out += '${'; i++; continue; }
    if (q === '`' && d && c === '}') { d--; out += '}'; continue; }
    if (c === q && !d) return { v: out, i: i + 1 };
    out += c;
  }
  return null;
}

function pairs() {
  const out = [];
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.tsx?$/.test(e.name)) continue;
      const s = fs.readFileSync(p, 'utf8');
      const rel = path.relative(ROOT, p).replace(/\\/g, '/');
      for (let i = 0; (i = s.indexOf('L(', i)) >= 0; i += 2) {
        /* `L(` and not `someL(` / `.L(` */
        if (i && /[\w.$]/.test(s[i - 1])) continue;
        const a = readArg(s, i + 2);
        if (!a) continue;
        let j = a.i;
        while (j < s.length && /\s/.test(s[j])) j++;
        if (s[j] !== ',') continue;
        const b = readArg(s, j + 1);
        if (!b) continue;
        out.push({ file: rel, line: s.slice(0, i).split('\n').length, hr: a.v, en: b.v });
      }
    }
  };
  walk(SRC);
  return out;
}

function staticScan() {
  const ps = pairs();
  const same = ps.filter(p => p.hr.trim() === p.en.trim());
  const holes = [];
  for (const p of ps) {
    /* NAMED placeholders only — `{span}`, the shape t() substitutes. A `${…}`
       template expression is code, and code differing between the two halves is
       the normal case: one language formats with hr-HR and the other with en-GB,
       one pluralises and the other does not. Comparing those reported eight
       pairs, every one of them correct. */
    const of = t => (t.match(/(?<!\$)\{[a-zA-Z]\w*\}/g) || []).sort().join(',');
    if (of(p.hr) !== of(p.en)) holes.push(p);
    if (!p.hr.trim() || !p.en.trim()) holes.push(p);
  }
  console.log(`static: ${ps.length} L() pairs in ${new Set(ps.map(p => p.file)).size} files`);
  console.log(`  identical halves (deliberate exonyms and codes live here): ${same.length}`);
  for (const p of same.slice(0, 12)) console.log(`    ${p.file}:${p.line}  «${p.hr.slice(0, 52)}»`);
  if (same.length > 12) console.log(`    … and ${same.length - 12} more`);
  console.log(`  placeholder or empty-half mismatches: ${holes.length}`);
  for (const p of holes) {
    console.log(`    ${p.file}:${p.line}\n      hr «${p.hr.slice(0, 70)}»\n      en «${p.en.slice(0, 70)}»`);
  }
  return holes.length;
}

/* ── dynamic ────────────────────────────────────────────────────────────── */

const STATES = [];
for (const v of ['saldo', 'klas', 'reg', 'yrs', 'flow', 'mx', 'jmap']) {
  for (const extra of ['', '&s=HR-18', '&cz=1', '&ag=1', '&c=1&y=2024', '&c=0&y=2003']) {
    STATES.push(`#v=${v}${v === 'flow' || v === 'mx' ? '&s=HR-21&pp=HR-01&dir=net' : ''}${extra}`);
  }
}
for (let i = 0; i < 15; i++) STATES.push(`#st=${i}`);

async function dynamicSweep(dist) {
  const puppeteer = require(path.join(ROOT, 'node_modules', 'puppeteer'));
  const http = require('http');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
  const srv = http.createServer((q, r) => {
    let f = path.join(dist, decodeURIComponent(q.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html');
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise(res => srv.listen(0, res));
  const url = 'http://localhost:' + srv.address().port + '/';
  const raw = JSON.parse(fs.readFileSync(path.join(SRC, 'data/atlas_data2.json'), 'utf8'));
  const jls = JSON.parse(fs.readFileSync(path.join(SRC, 'data/geo_jls.json'), 'utf8'));
  const NAMES = [...Object.values(raw.c).map(c => c.n),
    ...jls.features.map(f => String(f.properties.n || '')),
    'Vinovrški', 'Maras', 'Županije', 'Državljanstvo']
    .filter(n => /[čćžšđČĆŽŠĐ]/.test(n)).sort((a, b) => b.length - a.length);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--lang=hr-HR'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const hits = new Map();
  let n = 0;
  for (const lang of ['en', 'hr']) {
    for (const st of STATES) {
      const h = (lang === 'en' ? '#l=en&' : '#') + st.replace(/^#/, '');
      await page.goto('about:blank');
      await page.goto(url + h, { waitUntil: 'networkidle0' }).catch(() => {});
      await new Promise(r => setTimeout(r, 450));
      n++;
      const found = await page.evaluate(([L, NM]) => {
        const DIA = /[čćžšđČĆŽŠĐ]/;
        const HRW = /(?<![\p{L}\p{N}])(godina|godine|županij\p{L}*|izmjereno|procjena|saldo|doseljen\p{L}*|odseljen\p{L}*|neto|koridor\p{L}*|klasifikacij\p{L}*|zemlje|tokovi|matrica|regije|odlasc\p{L}*|dolasc\p{L}*|preseljen\p{L}*|zatvori|nalaz\p{L}*)(?![\p{L}\p{N}])/iu;
        const ENW = /(?<![\p{L}\p{N}])(net|measured|estimate|county|counties|flows|year|years|cumulative|finding|close|internal|external)(?![\p{L}\p{N}])/iu;
        const RX = L === 'en' ? HRW : ENW;
        const other = L === 'en' ? 'hr' : 'en';
        const skip = el => !!(el && el.closest
          && el.closest('[lang="' + other + '"], .paper-link, .help-cite, noscript'));
        const out = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) {
          const s = (t.textContent || '').trim();
          const el = t.parentElement;
          if (!s || !el || !el.getClientRects().length || skip(el)) continue;
          const m = RX.exec(s);
          if (m) { out.push('word ' + m[1] + ' « ' + s.slice(0, 44) + ' »'); continue; }
          if (L !== 'en' || !DIA.test(s)) continue;
          let rest = s;
          for (const x of NM) rest = rest.split(x).join('');
          if (DIA.test(rest)) out.push('diacritic « ' + s.slice(0, 44) + ' »');
        }
        for (const el of document.querySelectorAll('[aria-label],[title],[aria-valuetext]')) {
          if (skip(el)) continue;
          for (const a of ['aria-label', 'title', 'aria-valuetext']) {
            const v = el.getAttribute(a);
            if (!v) continue;
            const m = RX.exec(v);
            if (m) out.push(a + ' ' + m[1] + ' « ' + v.slice(0, 44) + ' »');
          }
        }
        return out;
      }, [lang, NAMES]);
      for (const f of found) {
        const k = lang + ' :: ' + f;
        if (!hits.has(k)) hits.set(k, h);
      }
    }
  }
  await browser.close();
  srv.close();
  console.log(`\ndynamic: ${n} states swept (${STATES.length} per language)`);
  console.log(`  leaks: ${hits.size}`);
  for (const [k, h] of [...hits].slice(0, 20)) console.log(`    ${k}\n      first seen at ${h}`);
  return hits.size;
}

(async () => {
  let bad = staticScan();
  const dist = process.argv[2];
  if (dist) {
    if (!fs.existsSync(path.join(dist, 'index.html'))) {
      console.error(`\nno index.html in ${dist} — build one first (npm run verify makes dist-test)`);
      process.exitCode = 2;
      return;
    }
    bad += await dynamicSweep(path.resolve(dist));
  } else {
    console.log('\n(no directory given — static scan only; pass dist-test for the browser sweep)');
  }
  console.log(bad ? `\n${bad} FINDING(S)` : '\nNO FINDINGS');
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error('i18n-sweep failed: ' + (e && e.message)); process.exit(2); });
