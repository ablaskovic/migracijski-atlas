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
     3. is the deployed build the current release?

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

/* Bounded, in both dimensions this used to be unbounded in.

   TIME: node's HTTP client has no idle timeout, and this had none either. Point
   smoke at an origin behind a DNS black hole or a firewall that drops packets
   after the handshake — the exact state a broken deploy leaves an apex in, which
   is the state this file exists for — and it printed "probing …" and hung
   forever: no check line, no banner, no exit code, nothing for CI to act on but
   its own job timeout. The response stream's own `error` is handled too now: an
   ECONNRESET after headers emitted an unhandled 'error' on `res`, an uncaught
   exception the .catch() at the bottom could not see, killing the process with
   no summary at all.

   HOPS: the comment said "one hop is enough" and nothing enforced it — `get`
   took one parameter, so there was nowhere to carry a depth. A misconfigured
   domain where the apex redirects to www and www redirects back (a routine
   consequence of adding a redirect rule to a domain that already has an alias)
   recursed between the two forever: no stack overflow, since each hop is a fresh
   tick, just unbounded wall time and a growing chain of pending promises. */
const TIMEOUT = 10000, MAXHOP = 3;
function get(url, hop = 0) {
  return new Promise((resolve, reject) => {
    const req = (url.startsWith('https:') ? https : http).get(url, {
      headers: { 'user-agent': 'migracijski-atlas-smoke' }, timeout: TIMEOUT,
    }, res => {
      res.on('error', reject);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (hop >= MAXHOP) { reject(new Error(`more than ${MAXHOP} redirects, last hop ${url}`)); return; }
        resolve(get(new URL(res.headers.location, url).href, hop + 1));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '',
        headers: res.headers, body }));
    });
    req.on('timeout', () => req.destroy(new Error(`timeout after ${TIMEOUT / 1000}s: ${url}`)));
    req.on('error', reject);
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
    /* the status too: a 404 has headers and a body like any other response, and
       every assertion here was reading those without ever asking whether the
       fetch succeeded */
    ck('content-hashed assets are served immutable',
      asset.status === 200 && /immutable/.test(asset.headers['cache-control'] || ''),
      asset.status + ' ' + (asset.headers['cache-control'] || 'absent'));
    /* …and it says what it varies on. Asked for the same URL three times with
       Accept-Encoding identity / gzip / br, the origin returned three different
       bodies — 573.949 / 191.684 / 193.505 bytes for the entry chunk — and no
       `vary` header on any of them, while stamping all three
       `public, max-age=31536000, immutable`. RFC 9111 §4.1 requires Vary when
       the representation depends on a request header; without it a shared cache
       may key on the URL alone, so a reader behind a TLS-inspecting corporate
       proxy — routine in the offices and universities this atlas is written for
       — can be handed a colleague's brotli bytes while announcing only gzip.
       The filename is content-hashed and the entry is immutable, so nothing
       invalidates it until the next deploy changes the hash. Vercel's own edge
       does key on Accept-Encoding, which is why the omission is invisible from
       inside the platform — and why it has to be asked here. */
    ck('negotiated responses declare what they vary on',
      /accept-encoding/i.test(asset.headers.vary || ''),
      asset.headers.vary || 'absent');
    /* …and a MISSING one is not. The header used to come from a vercel.json
       rule whose source matches the request PATH and not the response, so
       GET /assets/nema.js returned 404 stamped `public, max-age=31536000,
       immutable` — and Chrome cached it: one transient 404 of the entry chunk
       survived a reload and a fresh navigation, leaving a dead atlas for up to
       a year, with `public` letting a shared cache pass it to readers who never
       saw the outage. The rule is gone and the platform default takes over,
       which applies to files that exist. This is the only place that can be
       observed, because it is a property of the deploy and not of the build. */
    const ghost = await get(ORIGIN.replace(new RegExp('/$'), '') + '/assets/smoke-missing-cache.js');
    ck('a missing hashed asset is not cached for a year',
      ghost.status === 404 && !/immutable/.test(ghost.headers['cache-control'] || ''),
      ghost.status + ' ' + (ghost.headers['cache-control'] || 'absent'));
  }

  /* Staleness, asked monotonically. This used to be marker analysis: three
     strings that had entered the bundle at some past release — 'en-GB' and
     'County Migration Atlas' (v2.2.0) and 'ascent-override' (v2.1.1) — against a
     repo at v2.5.1. A production alias pinned to the v2.2.0 build, which is
     precisely the failure this file was written after, contains all three, so
     every marker check passed while the one check that could have caught it
     ("the deployed entry chunk is the one in ./dist") failed for the harness's
     own reason on a clone with no dist/. The bundle carried no version token at
     all to substitute — probed: neither '2.5.1' nor 'v2.5' appeared in it.
     vite.config now defines __APP_VERSION__ from package.json and main.tsx
     writes it onto <html data-v>, so both the markup and the chunk can be asked
     directly. The stylesheet marker stays: the fallback metrics live there and
     nowhere else, so it answers a different question. */
  const want = require(path.resolve(__dirname, '../package.json')).version;
  const servedV = (home.body.match(/<html[^>]*\sdata-v="([^"]+)"/) || [])[1] || null;
  ck('the deployed markup states a build version',
    !!servedV, servedV || 'no data-v on <html> — is the deploy older than v2.6.0?');
  ck(`the deployed build is the current release (${want})`,
    servedV === want, 'deployed ' + (servedV || 'none') + ' · local ' + want);

  const sheet = (home.body.match(/href="\.?(\/assets\/index-[\w-]+\.css)"/) || [])[1] || null;
  if (sheet) {
    const css = await get(ORIGIN.replace(/\/$/, '') + sheet);
    ck('the deployed stylesheet carries v2.1.1 — the metric-matched font fallbacks',
      css.status === 200 && css.body.includes('ascent-override'),
      css.status + ' · missing "ascent-override"');
  } else {
    ck('the home page links a built stylesheet', false, 'no /assets/index-*.css in the served HTML');
  }

  console.log(fails === 0 ? `\nALL ${n} SMOKE CHECKS PASS` : `\n${fails}/${n} SMOKE CHECKS FAILED`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error('smoke probe could not reach the origin: ' + e.message); process.exit(2); });
