#!/usr/bin/env node
/* Smoke probe for the DEPLOYED origin — deliberately outside verify.cjs.
   Usage:
     node scripts/smoke.cjs                       # probe the origin named in public/robots.txt
     node scripts/smoke.cjs https://example.com/  # probe another origin

   Why this exists. verify.cjs can only test the build it is handed, so every
   one of its checks can be green while the origin readers actually reach serves
   something else entirely — which is what happened: an audit found
   migracijski-atlas.hr pinned to a build three releases old (v2.1.0 + analytics,
   2026-07-31). No English at all, no robots.txt, none of the v2.1.1
   accessibility or performance work, for every visitor and every crawler, with
   nothing in the tree to indicate it. A redeploy fixed more than any code change
   in that report, and nothing in the repository could have told anyone.

   So this asks the three questions the suite structurally cannot:
     1. do the static files serve as static files, or does the catch-all rewrite
        answer them with the SPA shell? (robots.txt answering as text/html is the
        exact "31 invalid directives" failure v2.1.1 documents as fixed)
     2. is the deployed entry chunk the one in ./dist?
     3. does the deployed bundle contain the current release's markers at all?

   Network-dependent by nature, so it is NOT part of `npm run verify` and never
   gates a build. It exits non-zero so CI can use it if it ever wants to. */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ORIGIN = (process.argv[2] || readOrigin() || 'https://migracijski-atlas.hr/').replace(/\/*$/, '/');

/* the origin the repo itself names, so this file and robots.txt cannot drift */
function readOrigin() {
  try {
    const r = fs.readFileSync(path.resolve(__dirname, '../public/robots.txt'), 'utf8');
    const m = r.match(/^Sitemap:\s*(https?:\/\/[^/\s]+)/m);
    return m ? m[1] + '/' : null;
  } catch { return null; }
}

function get(url) {
  return new Promise((resolve, reject) => {
    (url.startsWith('https:') ? https : http).get(url, { headers: { 'user-agent': 'migracijski-atlas-smoke' } }, res => {
      /* one hop is enough: the platform may redirect the apex to www or back */
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '',
        headers: res.headers, body }));
    }).on('error', reject);
  });
}

let fails = 0, n = 0;
function ck(name, cond, extra = '') {
  n++;
  if (cond) console.log('  ok  ' + name);
  else { fails++; console.log('FAIL  ' + name + (extra ? '  [' + extra + ']' : '')); }
}

/* what ./dist says the current build is, when there is a ./dist to ask */
function localEntry() {
  try {
    const html = fs.readFileSync(path.resolve(__dirname, '../dist/index.html'), 'utf8');
    const m = html.match(/src="\.?(\/assets\/index-[\w-]+\.js)"/);
    return m ? m[1] : null;
  } catch { return null; }
}

(async () => {
  console.log('probing ' + ORIGIN + '\n');

  const robots = await get(ORIGIN + 'robots.txt');
  ck('robots.txt serves as text, not as the SPA shell',
    robots.status === 200 && /text\/plain/.test(robots.type) && /^\s*(#|User-agent)/i.test(robots.body),
    robots.status + ' ' + robots.type);

  const sitemap = await get(ORIGIN + 'sitemap.xml');
  ck('sitemap.xml serves as XML, not as the SPA shell',
    sitemap.status === 200 && /xml/.test(sitemap.type) && /<urlset/.test(sitemap.body),
    sitemap.status + ' ' + sitemap.type);

  const home = await get(ORIGIN);
  ck('the home page answers 200 as HTML', home.status === 200 && /text\/html/.test(home.type),
    home.status + ' ' + home.type);

  /* The live origin sent exactly one security header (HSTS) before the audit
     pass: no CSP, no frame-ancestors, no nosniff, no Referrer-Policy. These are
     configured in vercel.json, which only the deploy can prove it applied. */
  const csp = home.headers['content-security-policy'] || '';
  ck('the origin sends the Content-Security-Policy the repo configures',
    /default-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp), csp.slice(0, 80) || 'absent');
  ck('and nosniff plus a referrer policy',
    home.headers['x-content-type-options'] === 'nosniff'
    && /strict-origin/.test(home.headers['referrer-policy'] || ''),
    JSON.stringify({ nosniff: home.headers['x-content-type-options'], ref: home.headers['referrer-policy'] }));
  ck('the document revalidates rather than being cached blind',
    /no-cache|max-age=0/.test(home.headers['cache-control'] || ''),
    home.headers['cache-control'] || 'absent');

  /* the build emits relative asset URLs (`./assets/…`), so both forms are read */
  const served = (home.body.match(/src="\.?(\/assets\/index-[\w-]+\.js)"/) || [])[1] || null;
  const local = localEntry();
  ck('the deployed entry chunk is the one in ./dist',
    !!served && !!local && served === local,
    'deployed ' + served + ' · local ' + (local || 'no dist — run `npm run build`'));
  if (served) {
    const asset = await get(ORIGIN.replace(/\/$/, '') + served);
    ck('content-hashed assets are served immutable',
      /immutable/.test(asset.headers['cache-control'] || ''),
      asset.headers['cache-control'] || 'absent');
  }

  /* Marker analysis, so a stale deploy is legible even without a local build:
     these strings entered the bundle in v2.2.0 (English) and v2.1.1, and the
     two files are probed separately because the fallback metrics live in the
     stylesheet, not in the entry chunk. */
  if (served) {
    const entry = await get(ORIGIN.replace(/\/$/, '') + served);
    for (const [marker, since] of [['en-GB', 'v2.2.0 — the English number format'],
      ['County Migration Atlas', 'v2.2.0 — the English title']]) {
      ck('the deployed script carries ' + since, entry.body.includes(marker), 'missing "' + marker + '"');
    }
  }
  const sheet = (home.body.match(/href="\.?(\/assets\/index-[\w-]+\.css)"/) || [])[1] || null;
  if (sheet) {
    const css = await get(ORIGIN.replace(/\/$/, '') + sheet);
    ck('the deployed stylesheet carries v2.1.1 — the metric-matched font fallbacks',
      css.body.includes('ascent-override'), 'missing "ascent-override"');
  } else {
    ck('the home page links a built stylesheet', false, 'no /assets/index-*.css in the served HTML');
  }

  console.log(fails === 0 ? `\nALL ${n} SMOKE CHECKS PASS` : `\n${fails}/${n} SMOKE CHECKS FAILED`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error('smoke probe could not reach the origin: ' + e.message); process.exit(2); });
