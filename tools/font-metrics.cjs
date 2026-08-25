#!/usr/bin/env node
/* Regenerates the metric-matched fallback faces in src/index.css.

   src/index.css cites this tool by name and tells a maintainer to re-run it if a
   font file or a family in the stack changes — and the tool was never committed,
   so the one instruction the stylesheet gives about its own numbers could not be
   followed. This is that tool, implementing the method the stylesheet documents.

   What it does, per (family, weight):
     1. renders a Croatian sample string at 100 px in the REAL webfont and in the
        local face the fallback wraps, and takes `size-adjust` as the width ratio
        (real ÷ local), so the fallback lays out at the real face's advances;
     2. takes ascent and descent from the real face's own fontBoundingBox, each
        divided by size-adjust — the overrides are relative to the adjusted em;
     3. declares the candidate face and RE-MEASURES it, then corrects. That step
        is not optional: at weight 600 a raw probe of `Arial` gets Arial Bold
        while `local('Arial')` inside @font-face gets Arial Regular, so the
        analytic ratio came out 6,5 % wrong.

   Usage:
     npm run build && node tools/font-metrics.cjs dist
     node tools/font-metrics.cjs http://localhost:5173     # a running dev server

   Prints the @font-face block. It does NOT write to src/index.css: the numbers
   are platform-dependent (they wrap whatever `local()` resolves to on the
   machine that runs this), so replacing them is a decision, not a side effect.
   Needs puppeteer, like scripts/verify.cjs, and for the same reason it is not a
   default devDependency. */
const path = require('path');
const fs = require('fs');
const http = require('http');

let puppeteer;
try { puppeteer = require('puppeteer'); }
catch {
  try {
    if (!process.env.PUPPETEER_PATH) throw new Error('no PUPPETEER_PATH');
    puppeteer = require(process.env.PUPPETEER_PATH);
  } catch {
    console.error('puppeteer not found: npm i -D puppeteer');
    process.exit(2);
  }
}

/* Croatian on purpose: the sample has to exercise latin-ext, because that is
   where č, ć, š, ž and đ live and they are most of what this app renders. */
const SAMPLE = 'Osječko-baranjska županija — doseljeni 1.234, odseljeni 5.678 · neto −4.444';
/* …except for Oswald, which src/index.css fits on CAPS ALONE and says so: it is
   the display face, it only ever sets short runs, and one scalar cannot match
   both its caps and its figures, whose widths relative to Arial Narrow's differ
   by ~11 %. Fitted on the mixed-case sample above it leaves the title 3,83 %
   wide — worse than shipping no Oswald fallback at all (1,88 %).
   Without this the tool did not implement the method the stylesheet documents:
   a maintainer swapping a woff2 would run it exactly as the usage block says,
   paste the printed block over those lines as it is formatted to invite, and
   silently replace the caps-fitted rows with worse ones. The sample is the
   uppercase title (i18n 'hd.title'), the only Oswald run long enough to wrap
   and therefore the one whose width has to match. */
const CAPS = 'MIGRACIJSKI ATLAS ŽUPANIJA';

const FACES = [
  { family: 'IBM Plex Sans', local: 'Arial', weights: [400, 500, 600] },
  { family: 'IBM Plex Mono', local: 'Courier New', weights: [400, 500] },
  { family: 'Oswald', local: 'Arial Narrow', weights: [500, 600], sample: CAPS },
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml', '.png': 'image/png', '.map': 'application/json' };
function serve(dir) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.resolve(dir, '.' + path.posix.normalize('/' + p));
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

(async () => {
  const arg = process.argv[2] || 'dist';
  let url = arg, srv = null;
  if (!/^https?:/.test(arg)) {
    const dir = path.resolve(arg);
    if (!fs.existsSync(path.join(dir, 'index.html'))) {
      console.error('no index.html in ' + dir + ' — run `npm run build` first');
      process.exit(2);
    }
    ({ srv, url } = await serve(dir));
  }
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);

  const out = await page.evaluate(async (faces, sample) => {
    const span = document.createElement('span');
    span.style.cssText = 'position:absolute;left:-99999px;top:0;white-space:pre;font-size:100px;line-height:normal';
    document.body.appendChild(span);

    /* the sample is per face now, not one string for the run: Oswald is fitted
       on caps and the other two on the mixed-case line */
    const measure = async (stack, weight, text) => {
      span.style.fontFamily = stack;
      span.style.fontWeight = String(weight);
      span.textContent = text;
      await document.fonts.ready;
      const r = span.getBoundingClientRect();
      /* fontBoundingBox is what ascent-override/descent-override describe */
      const cv = document.createElement('canvas').getContext('2d');
      cv.font = `${weight} 100px ${stack}`;
      const m = cv.measureText(text);
      return { w: r.width, asc: m.fontBoundingBoxAscent, desc: m.fontBoundingBoxDescent };
    };

    const rows = [];
    for (const f of faces) {
      const text = f.sample || sample;
      for (const weight of f.weights) {
        const real = await measure(`'${f.family}'`, weight, text);
        const plain = await measure(`'${f.local}'`, weight, text);
        /* step 1–2: the analytic candidate */
        let sizeAdjust = real.w / plain.w;
        let ascent = real.asc / 100 / sizeAdjust;
        let descent = real.desc / 100 / sizeAdjust;

        /* step 3: declare it, re-measure, correct. `local()` inside @font-face
           does not resolve the same face a bare family name does at every
           weight, which is the whole reason this pass exists. */
        const probe = `__probe_${f.family}_${weight}`.replace(/[^\w]/g, '');
        const decl = pct => `@font-face{font-family:'${probe}';font-style:normal;font-weight:${weight};`
          + `src:local('${f.local}');size-adjust:${(pct * 100).toFixed(3)}%;`
          + `ascent-override:${(ascent * 100).toFixed(3)}%;descent-override:${(descent * 100).toFixed(3)}%;`
          + 'line-gap-override:0%}';
        const style = document.createElement('style');
        document.head.appendChild(style);
        for (let i = 0; i < 4; i++) {
          style.textContent = decl(sizeAdjust);
          const got = await measure(`'${probe}'`, weight, text);
          const err = real.w / got.w;
          if (Math.abs(err - 1) < 0.00005) break;
          sizeAdjust *= err;
          ascent = real.asc / 100 / sizeAdjust;
          descent = real.desc / 100 / sizeAdjust;
        }
        style.textContent = decl(sizeAdjust);
        const final = await measure(`'${probe}'`, weight, text);
        document.head.removeChild(style);

        rows.push({
          family: f.family, local: f.local, weight, chars: text.length, caps: !!f.sample,
          sizeAdjust: +(sizeAdjust * 100).toFixed(3),
          ascent: +(ascent * 100).toFixed(3),
          descent: +(descent * 100).toFixed(3),
          residual: +(final.w - real.w).toFixed(3),
        });
      }
    }
    document.body.removeChild(span);
    return rows;
  }, FACES, SAMPLE);

  console.log('/* generated by tools/font-metrics.cjs — see the note above these faces */');
  let capsSaid = false;
  for (const r of out) {
    /* say which sample a row was fitted on, right where it would be pasted */
    if (r.caps && !capsSaid) {
      capsSaid = true;
      console.log(`/* fitted on caps alone (${JSON.stringify(CAPS)}), not on the mixed-case`
        + ' sample — see the note above these faces in src/index.css */');
    }
    console.log(`@font-face{font-family:'${r.family} Fallback';font-style:normal;font-weight:${r.weight};`
      + `src:local('${r.local}');size-adjust:${r.sizeAdjust}%;ascent-override:${r.ascent}%;`
      + `descent-override:${r.descent}%;line-gap-override:0%}`);
  }
  for (const chars of [...new Set(out.map(r => r.chars))]) {
    const rows = out.filter(r => r.chars === chars);
    const worst = Math.max(...rows.map(r => Math.abs(r.residual)));
    console.log(`\n/* residual after fitting, on the ${chars}-char ${rows[0].caps ? 'caps' : 'mixed-case'}`
      + ` sample at a 100 px em: worst ${worst.toFixed(3)} px */`);
  }

  await browser.close();
  if (srv) srv.close();
})().catch(e => { console.error(e); process.exit(2); });
