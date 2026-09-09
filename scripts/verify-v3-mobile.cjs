#!/usr/bin/env node
// Mobile interaction regressions. Serve an existing isolated build; never write dist/dist-test.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer');
const raw = require('../src/data/atlas_data2.json');

const root = path.resolve(process.argv[2] || 'logs/v3-mobile-state-build');
const output = path.resolve('logs/v3-mobile-qa');
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error(`Build missing: ${root}`);
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/_vercel/')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end('/* local platform stub */'); return; }
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(pathname)); }
  catch { res.writeHead(400); res.end(); return; }
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
let browser, page, checks = 0;
const failures = [], runtimeErrors = [];
function check(name, condition, detail) {
  checks++;
  if (condition) console.log('  ok ' + name);
  else { const finding = { name, detail }; failures.push(finding); console.error('FAIL ' + name + (detail ? ': ' + JSON.stringify(detail) : '')); }
}
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function scenario(name, run) {
  try { await run(); }
  catch (error) {
    failures.push({ name, detail: error.message }); console.error('FAIL ' + name + ': ' + error.message);
    await page.screenshot({ path: path.join(output, name.replace(/[^a-z0-9]+/gi, '-') + '-failure.png') }).catch(() => {});
  }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--lang=en-GB'] });
  page = await browser.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (/^https?:/.test(req.url()) && !req.url().startsWith(origin + '/')) req.abort();
    else req.continue();
  });
  // Both browser APIs are mocked: this suite never opens a native sheet or writes the real clipboard.
  await page.evaluateOnNewDocument(() => {
    window.mobileShareTest = { native: [], clipboard: [] };
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async url => { window.mobileShareTest.clipboard.push(url); throw new Error('Clipboard denied for test'); } } });
  });
  const viewport = (width = 390, height = 844, coarse = true) => page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: coarse, hasTouch: coarse });
  async function go(hash = 'explore=flows&year=2006&county=HR-06&l=en') {
    // A fragment-only navigation keeps React state, open popovers and text enlargement.
    // Each scenario starts from a fresh document; history behavior has its own suite.
    await page.goto('about:blank');
    await page.goto(origin + '/?version=v3#' + hash, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.v3-workspace');
    await page.evaluate(() => document.fonts.ready); await settle();
  }
  async function keyClick(selector) { await page.focus(selector); await page.keyboard.press('Enter'); await settle(); }
  async function configureShare(native, clipboard = 'denied') {
    await page.evaluate(({ native, clipboard }) => {
      window.mobileShareTest = { native: [], clipboard: [] };
      Object.defineProperty(navigator, 'share', { configurable: true, value: native === 'absent' ? undefined : async data => {
        window.mobileShareTest.native.push(data);
        if (native === 'abort') throw new DOMException('Dismissed', 'AbortError');
        if (native === 'error') throw new Error('Native share failed');
      } });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async url => {
        window.mobileShareTest.clipboard.push(url);
        if (clipboard === 'denied') throw new Error('Clipboard denied for test');
      } } });
    }, { native, clipboard });
  }

  for (const [width, height] of [[320, 740], [390, 844], [667, 375], [768, 1024]]) {
    for (const lang of ['hr', 'en']) for (const textScale of [1, 2]) {
      const label = `${width}x${height} ${lang} text ${textScale * 100}%`;
      await scenario(label, async () => {
        await viewport(width, height); await go(`explore=flows&year=2006&county=HR-06&l=${lang}`);
        await page.evaluate(scale => { document.documentElement.style.fontSize = scale * 100 + '%'; }, textScale); await settle();
        const layout = await page.evaluate(() => {
          const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
          const info = el => { const r = el.getBoundingClientRect(); return { label: el.getAttribute('aria-label') || el.textContent.trim(), width: r.width, height: r.height }; };
          const targets = [...document.querySelectorAll('.v3-header-actions button,.v3-header-actions a,.v3-toolbar button,.v3-segment button,.v3-time-mode button,.v3-play,.v3-slider-wrap input')].filter(visible).map(info);
          const inputs = [...document.querySelectorAll('input:not([type=range]),select')].filter(visible).map(el => ({ label: el.getAttribute('aria-label'), size: parseFloat(getComputedStyle(el).fontSize) }));
          const escaped = [...document.querySelectorAll('.v3-header-actions button,.v3-header-actions a,.v3-toolbar button,.v3-hub-label select,.v3-timeline button,.v3-timeline select,.v3-timeline input')].filter(visible).filter(el => { const r = el.getBoundingClientRect(); return r.left < -.5 || r.right > innerWidth + .5; }).map(info);
          return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, smallTargets: targets.filter(t => t.width < 43.5 || t.height < 43.5), smallInputs: inputs.filter(t => t.size < 16), escaped };
        });
        check(`${label}: no page overflow`, layout.scrollWidth <= width + 1, layout);
        check(`${label}: controls stay within viewport`, !layout.escaped.length, layout.escaped);
        check(`${label}: 44px touch targets`, !layout.smallTargets.length, layout.smallTargets);
        check(`${label}: inputs are at least 16px`, !layout.smallInputs.length, layout.smallInputs);
        if (width === 390 || layout.scrollWidth > width + 1) await page.screenshot({ path: path.join(output, `flows-${width}-${lang}-${textScale * 100}.png`), fullPage: true });
      });
    }
  }

  for (const [width, height] of [[390, 844], [667, 375]]) await scenario(`About ${width}x${height}`, async () => {
    await viewport(width, height); await go(); await page.click('.v3-research-more'); await settle();
    const bounds = await page.$eval('.v3-about', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; });
    check(`About ${width}: fits viewport`, bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.bottom <= height + 1, bounds);
    await page.mouse.click(bounds.x + 8, bounds.y + 8);
    check(`About ${width}: interior padding stays open`, await page.$eval('.v3-about', el => el.open));
    await page.mouse.move(bounds.x + 8, bounds.y + 8); await page.mouse.down(); await page.mouse.move(2, 2, { steps: 5 }); await page.mouse.up();
    check(`About ${width}: inside-to-backdrop drag stays open`, await page.$eval('.v3-about', el => el.open));
    await page.mouse.click(2, 2); await settle();
    check(`About ${width}: actual backdrop closes`, await page.$eval('.v3-about', el => !el.open));
    check(`About ${width}: backdrop restores opener`, await page.evaluate(() => document.activeElement === document.querySelector('.v3-research-more')));
    await page.click('.v3-research-more'); await page.keyboard.press('Escape'); await settle();
    check(`About ${width}: Escape closes without clearing county`, await page.evaluate(() => !document.querySelector('.v3-about').open && new URLSearchParams(location.hash.slice(1)).get('county') === 'HR-06'));
  });

  await scenario('Stable manual share', async () => {
    await viewport(); await go(); await configureShare('absent');
    await page.click('.v3-play'); check('share begins while playback is active', await page.$eval('.v3-play', el => el.getAttribute('aria-pressed') === 'true'));
    await page.click('.v3-share'); await page.waitForSelector('.v3-share-fallback input');
    const captured = await page.$eval('.v3-share-fallback input', el => ({ url: el.value, selected: el.selectionStart === 0 && el.selectionEnd === el.value.length }));
    check('manual share initially selects the complete URL', captured.selected);
    check('manual share input is at least 16px on mobile', await page.$eval('.v3-share-fallback input', el => parseFloat(getComputedStyle(el).fontSize) >= 16));
    check('sharing pauses playback', await page.$eval('.v3-play', el => el.getAttribute('aria-pressed') === 'false'));
    await pause(1200);
    check('manual share URL and selection remain stable', await page.$eval('.v3-share-fallback input', (el, url) => el.value === url && el.selectionStart === 0 && el.selectionEnd === url.length && location.href === url, captured.url));
    check('manual share uses the exact attempted clipboard URL', await page.evaluate(url => window.mobileShareTest.clipboard[0] === url, captured.url));
    await page.screenshot({ path: path.join(output, 'manual-share.png') });
    await page.select('#v3-year', '9'); await settle();
    check('manual share keeps its captured URL after another view change', await page.$eval('.v3-share-fallback input', (el, url) => el.value === url && location.href !== url, captured.url));
    await page.keyboard.press('Escape'); await settle();
    check('manual share Escape restores Share focus', await page.evaluate(() => !document.querySelector('.v3-share-fallback') && document.activeElement === document.querySelector('.v3-share')));
  });

  for (const native of ['success', 'abort', 'error']) await scenario(`Native share ${native}`, async () => {
    await viewport(); await go(); await configureShare(native);
    check(`native ${native}: coarse pointer is emulated`, await page.evaluate(() => matchMedia('(pointer:coarse)').matches));
    const url = page.url(); await page.click('.v3-share'); await settle();
    const result = await page.evaluate(() => ({ calls: window.mobileShareTest, fallback: !!document.querySelector('.v3-share-fallback'), notice: document.querySelector('.v3-toast').textContent }));
    check(`native ${native}: exact URL passed once`, result.calls.native.length === 1 && result.calls.native[0].url === url && !!result.calls.native[0].title, result.calls.native);
    if (native === 'error') {
      check('failed native share falls back to clipboard then manual field', result.calls.clipboard.length === 1 && result.calls.clipboard[0] === url && result.fallback, result);
    } else {
      check(`native ${native}: no clipboard or manual fallback`, result.calls.clipboard.length === 0 && !result.fallback, result);
      if (native === 'abort') check('native cancellation has no false success notice', !result.notice.trim(), result.notice);
    }
  });
  await scenario('Native share clipboard fallback', async () => {
    await viewport(); await go(); await configureShare('error', 'success'); await page.click('.v3-share'); await settle();
    check('native failure can complete through clipboard without a manual dialog', await page.evaluate(() => window.mobileShareTest.native.length === 1 && window.mobileShareTest.clipboard.length === 1 && !document.querySelector('.v3-share-fallback') && document.querySelector('.v3-toast').textContent.includes('Link copied')));
  });

  for (const view of ['flows', 'matrix']) await scenario(`Escape ${view}`, async () => {
    await viewport(); await go(`explore=${view}&year=2006&${view === 'matrix' ? 'county=HR-06&' : ''}pair=HR-01&l=en`);
    await page.waitForSelector('[data-pair]'); const before = new URL(page.url()).hash;
    await page.keyboard.press('Escape'); await settle();
    const after = await page.evaluate(() => ({ county: new URLSearchParams(location.hash.slice(1)).get('county'), pair: new URLSearchParams(location.hash.slice(1)).get('pair'), detail: !!document.querySelector('[data-pair]') }));
    check(`Escape ${view}: closes pair and preserves hub`, !after.pair && !after.detail && after.county === new URLSearchParams(before.slice(1)).get('county'), after);
  });
  await scenario('Default flow scope', async () => {
    await viewport(); await go('explore=flows&year=2006&l=en');
    const county = raw.c['HR-21'], yi = raw.years.indexOf(2006), nf = new Intl.NumberFormat('en-GB');
    const internal = county.ii[yi] - county.oi[yi], net = internal + county.ie[yi] - county.oe[yi];
    const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + nf.format(Math.abs(n));
    const actual = await page.evaluate(() => ({ title: document.querySelector('h1').textContent, hub: document.querySelector('.v3-hub-label select').value, net: document.querySelector('[data-stat="net"]').textContent, arrivals: document.querySelector('[data-stat="arrivals"]').textContent, departures: document.querySelector('[data-stat="departures"]').textContent, internal: document.querySelector('[data-stat="counties"]').textContent }));
    check('default flow title and hub both identify City of Zagreb', actual.title === 'City of Zagreb' && actual.hub === 'HR-21', actual);
    check('default flow statistics match raw Zagreb county data', actual.net === signed(net) && actual.arrivals === nf.format(county.ie[yi]) && actual.departures === nf.format(county.oe[yi]) && actual.internal === signed(internal), actual);
  });
  await scenario('Study settings pause playback', async () => {
    await viewport(); await go('explore=classify&year=2020&l=en'); await page.click('.v3-play'); await page.click('.v3-threshold .v3-button'); await settle();
    check('Study settings selects 2024 and pauses immediately', await page.evaluate(() => document.querySelector('#v3-year').selectedOptions[0].textContent === '2024' && document.querySelector('.v3-play').getAttribute('aria-pressed') === 'false'));
    await pause(1200); check('Study settings remains at 2024 after an animation interval', await page.$eval('#v3-year', el => el.selectedOptions[0].textContent === '2024'));
  });
  await scenario('Disappearing controls restore focus', async () => {
    await viewport(); await go('explore=map&year=2006&county=HR-06&l=en'); await keyClick('.v3-county-detail>.v3-text-button');
    check('county navigation focuses All views', await page.evaluate(() => document.activeElement === document.querySelector('[aria-label="All views"]')));
    await go('explore=map&year=2006&county=HR-06&l=en'); await keyClick('.v3-period button');
    check('All Croatia returns focus to the previously selected county', await page.evaluate(() => document.activeElement === document.querySelector('[data-county="HR-06"]') && !new URLSearchParams(location.hash.slice(1)).has('county')));
    await go('explore=map&year=2006&l=en'); await page.select('[aria-label="Guided findings"]', '2'); await keyClick('[aria-label="Close finding"]');
    check('closing a finding restores the finding selector', await page.evaluate(() => document.activeElement === document.querySelector('[aria-label="Guided findings"]')));
    await go(); check('flow hub has no misleading All Croatia reset', !(await page.$('.v3-period button')));
  });

  check('no JavaScript runtime errors', runtimeErrors.length === 0, runtimeErrors);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, failures, runtimeErrors }, null, 2));
  if (failures.length) { process.exitCode = 1; console.error(`\n${failures.length} FAILURES / ${checks} MOBILE CHECKS`); }
  else console.log(`\n${checks} V3 MOBILE CHECKS PASSED`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.close(); });
