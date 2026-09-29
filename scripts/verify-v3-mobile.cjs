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
    check('county navigation focuses All views', await page.evaluate(() => document.activeElement === document.querySelector('#v3-view-select')));
    await go('explore=map&year=2006&county=HR-06&l=en'); await keyClick('.v3-period button');
    check('All Croatia returns focus to the previously selected county', await page.evaluate(() => document.activeElement === document.querySelector('[data-county="HR-06"]') && !new URLSearchParams(location.hash.slice(1)).has('county')));
    await go('explore=map&year=2006&l=en'); await page.select('[aria-label="Guided findings"]', '2'); await keyClick('[aria-label="Close finding"]');
    check('closing a finding restores the finding selector', await page.evaluate(() => document.activeElement === document.querySelector('[aria-label="Guided findings"]')));
    await go(); check('flow hub has no misleading All Croatia reset', !(await page.$('.v3-period button')));
  });
  await scenario('Large text does not bury the map', async () => {
    // The hint and readout grew with the text while the map box stayed 300 px: at 200 % they hid 15–56 % of the counties.
    const hidden = [];
    for (const width of [390, 320]) for (const root of [24, 32]) {
      await viewport(width, 800); await go('explore=map&year=2024&county=HR-18&l=hr');
      await page.evaluate(r => { document.documentElement.style.fontSize = r + 'px'; }, root); await pause(300);
      hidden.push(await page.evaluate(() => {
        const map = document.querySelector('.v3-map'); map.scrollIntoView({ block: 'start' });
        const box = map.getBoundingClientRect(), overlays = [...document.querySelectorAll('.v3-cartography .v3-touch-hint, .v3-cartography .v3-map-readout')].filter(el => getComputedStyle(el).display !== 'none').map(el => el.getBoundingClientRect());
        let county = 0, covered = 0;
        for (let y = box.top + 2; y < Math.min(box.bottom, innerHeight); y += 6) for (let x = box.left + 2; x < box.right; x += 6) {
          if (!document.elementsFromPoint(x, y).some(el => el.matches('[data-county]'))) continue;
          county++; if (overlays.some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) covered++;
        }
        return covered / county * 100;
      }));
      await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
    }
    check('at 150 and 200 % text the hint and readout cover at most 12 % of the counties', hidden.every(p => p <= 12), hidden.map(p => Math.round(p * 10) / 10));
  });
  await scenario('Intro title keeps its words whole at large text', async () => {
    // At 200 % text on 360–390 px phones the title broke mid-word ("Hrvatsk / a u / pokretu.") beside the year block.
    const broken = [];
    for (const width of [390, 360]) for (const root of [24, 32]) {
      await viewport(width, 800); await go('explore=map&year=2024&l=hr');
      await page.evaluate(r => { document.documentElement.style.fontSize = r + 'px'; }, root); await pause(300);
      broken.push(...await page.evaluate(() => { const out = [], walker = document.createTreeWalker(document.querySelector('.v3-intro h1'), NodeFilter.SHOW_TEXT); for (let node = walker.nextNode(); node; node = walker.nextNode()) for (const m of node.textContent.matchAll(/\S+/g)) { const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length); if (new Set([...range.getClientRects()].map(r => Math.round(r.top))).size > 1) out.push(m[0]); } return out; }));
      await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
    }
    check('the intro title never breaks inside a word at 150 or 200 % text', broken.length === 0, broken);
  });
  await scenario('Direction segment labels fit their buttons', async () => {
    // At ≤600 px the three buttons were forced to equal widths (79 px at 390) though "Doseljavanje" needs 92 px: each label
    // spilled into its neighbour, under a pressed neighbour's fill.
    const spills = [];
    for (const width of [320, 390, 480, 600]) for (const [hash, lang] of [['explore=municipalities&dir=out', 'hr'], ['explore=matrix&year=2018', 'en']]) {
      await viewport(width, 800); await go(`${hash}&l=${lang}`);
      spills.push(...await page.evaluate(() => [...document.querySelectorAll('.v3-segment')].flatMap(seg => { const buttons = [...seg.querySelectorAll('button')], rects = buttons.map(b => b.getBoundingClientRect()); return buttons.filter((b, i) => b.scrollWidth > b.clientWidth + 1 || rects.some((r, j) => j !== i && r.top === rects[i].top && r.left < rects[i].right - 1 && r.right > rects[i].left + 1)).map(b => b.textContent); })).then(bad => bad.map(b => `${width} ${lang}: ${b}`)));
    }
    check('direction segment labels fit their buttons at every phone width', spills.length === 0, spills);
  });
  await scenario('Small counties take a near-miss tap', async () => {
    // The City of Zagreb is drawn 15×17 px on a phone, and a tap 8 px off its centre selected the surrounding Zagrebačka.
    const results = [];
    for (const width of [390, 320]) for (const [dx, dy, near] of [[8, 2, true], [-30, 12, false]]) {
      await viewport(width, 740); await go('explore=map&year=2024&l=en');
      const at = await page.$eval('[data-county="HR-21"]', p => { p.scrollIntoView({ block: 'center' }); const r = p.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      const drawn = await page.evaluate((x, y) => document.elementsFromPoint(x, y).find(el => el.dataset && el.dataset.county)?.dataset.county ?? null, at.x + dx, at.y + dy);
      await page.touchscreen.tap(at.x + dx, at.y + dy); await pause(300);
      results.push(await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('county')) === (near ? 'HR-21' : drawn));
    }
    check('a tap near a small county selects it; a tap well away selects the county drawn there', results.every(Boolean), results);
  });
  await scenario('Phone SVG text stays legible', async () => {
    // SVG text is sized in viewBox units and phones shrink the viewBox, so chart and map text rendered at 3.6–5.2 px.
    const rendered = sel => page.evaluate(sel => [...document.querySelectorAll(sel)].filter(t => t.getClientRects().length).map(t => parseFloat(getComputedStyle(t).fontSize) * t.closest('svg').getScreenCTM().a), sel);
    const sizes = [];
    for (const width of [390, 320]) {
      await viewport(width, 740); await go('explore=map&year=2024&county=HR-21&l=hr');
      sizes.push(...await rendered('.v3-map .v3-compass text, .v3-map .v3-geographic-scale text'), ...await rendered('.v3-county-detail .v3-annual-lines svg[role="img"] text'));
      check(`${width}: decorative map names are dropped`, await page.evaluate(() => !document.querySelector('.v3-map .v3-neighbour, .v3-map .v3-sea')));
      await go('explore=trends&year=2024&metric=tot&l=hr');
      sizes.push(...await rendered('.v3-trend-chart text'));
    }
    check('chart and map text renders at no less than 10.5 px on phones', sizes.length > 10 && sizes.every(px => px >= 10.5), sizes.map(px => Math.round(px * 10) / 10).filter(px => px < 10.5));
  });
  await scenario('Pan buttons stay clear of the map tools', async () => {
    // A zoomed map pans by button as well as by drag (WCAG 2.5.7); on a 300 px phone map the 3×3 pad covered the tools.
    await viewport(); await go('explore=map&year=2024&l=en');
    for (let i = 0; i < 2; i++) { await page.click('.v3-map-tools button:first-child'); await settle(); }
    const boxes = await page.evaluate(() => Object.fromEntries(['.v3-map-tools', '.v3-map-pan', '.v3-cartography'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, { l: r.left, r: r.right, t: r.top, b: r.bottom }]; })));
    const [tools, pan, map] = ['.v3-map-tools', '.v3-map-pan', '.v3-cartography'].map(s => boxes[s]);
    check('the pan buttons sit inside the map without covering its tools', !(pan.l < tools.r && pan.r > tools.l && pan.t < tools.b && pan.b > tools.t) && pan.l >= map.l && pan.r <= map.r && pan.t >= map.t && pan.b <= map.b, boxes);
  });
  await scenario('Figure export keeps desktop label sizes', async () => {
    // Phones enlarge map labels to stay legible, and the figure export copied that size: the same 876 px figure printed
    // city names at 11 px from a desktop, 25.3 px from 390 and 30.5 px from 320.
    // One folder per export: all four share a file name, and Windows can keep listing a file deleted while a download holds it.
    fs.rmSync(path.join(output, 'downloads'), { recursive: true, force: true });
    const session = await page.createCDPSession();
    const sizes = {};
    for (const [width, height] of [[390, 844], [320, 568]]) for (const mode of ['cities', 'counties']) {
      await viewport(width, height); await go('explore=map&year=2024&l=en');
      if (mode === 'counties') { await page.click('button[aria-label^="Labels:"]'); await settle(); }
      const downloads = path.join(output, 'downloads', `${width}-${mode}`); fs.mkdirSync(downloads, { recursive: true });
      await session.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
      await page.click('[aria-label="Export SVG"]');
      let file; for (let i = 0; i < 200 && !file; i++) { await pause(100); file = fs.readdirSync(downloads).find(n => n.endsWith('.svg')); }
      sizes[`${width} ${mode}`] = file ? await page.evaluate(text => [...new Set([...new DOMParser().parseFromString(text, 'image/svg+xml').querySelectorAll('.v3-map-labels text')].map(t => t.style.fontSize))].join(), fs.readFileSync(path.join(downloads, file), 'utf8')) : 'no file';
    }
    await session.detach();
    check('a figure exported from a phone prints map labels at the desktop size', JSON.stringify(sizes) === JSON.stringify({ '390 cities': '11px', '390 counties': '12px', '320 cities': '11px', '320 counties': '12px' }), sizes);
  });
  await scenario('Tablet timeline keeps a usable slider', async () => {
    // At 721–960 px the mode toggle stacked into a column beside the slider in the narrow map column: 77 px of slider at 721.
    const report = {};
    for (const width of [721, 768, 834]) {
      await viewport(width, 1024); await go('explore=map&year=2024&l=hr');
      report[width] = await page.evaluate(() => {
        const timeline = document.querySelector('.v3-map-column .v3-timeline'), slider = timeline.querySelector('.v3-slider-wrap input').getBoundingClientRect(), mode = timeline.querySelector('.v3-time-mode').getBoundingClientRect();
        const ticks = [...timeline.querySelectorAll('.v3-year-ticks span')].map(s => s.getBoundingClientRect()).filter(r => r.width);
        return { slider: Math.round(slider.width), modeBelow: mode.top >= slider.bottom, collide: ticks.some((r, i) => i && r.left < ticks[i - 1].right + 2) };
      });
    }
    check('the tablet map slider is no narrower than a 390 px phone\'s, with the mode toggle on its own row', Object.values(report).every(r => r.slider >= 190 && r.modeBelow && !r.collide), report);
  });
  await scenario('Landscape phones keep the map and timeline together', async () => {
    // A 390 px map box with the legend and timeline below it spanned 519–666 px of a 360–412 px landscape screen.
    const report = {};
    for (const [width, height] of [[667, 375], [844, 390]]) for (const view of ['map', 'flows']) {
      await viewport(width, height); await go(`explore=${view}&year=2024&l=hr`);
      report[`${width}×${height} ${view}`] = await page.evaluate(() => {
        const column = document.querySelector('.v3-map-column'); column.scrollIntoView({ block: 'start' });
        const map = column.querySelector('.v3-cartography').getBoundingClientRect(), timeline = column.querySelector('.v3-timeline').getBoundingClientRect();
        return { span: Math.round(Math.max(map.bottom, timeline.bottom) - map.top), viewport: innerHeight, map: Math.round(map.height) };
      });
    }
    check('on landscape phones the map and the whole timeline fit one screen', Object.values(report).every(r => r.span <= r.viewport && r.map >= r.viewport / 2), report);
  });
  await scenario('A tapped Trends bar shows its value', async () => {
    // The value was only in a <title> tooltip, which touch never shows; the stat card holding it was 691 px above.
    await viewport(); await go('explore=trends&year=2025&metric=tot&l=hr');
    const bar = await page.$$eval('.v3-trend-chart .v3-chart-hit', hits => { hits[17].scrollIntoView({ block: 'center' }); const r = hits[17].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.touchscreen.tap(bar.x, bar.y); await pause(300);
    const shown = await page.evaluate(() => { const label = document.querySelectorAll('.v3-trend-chart .v3-chart-hit')[17].getAttribute('aria-label').replace(': ', ' · '), readout = document.querySelector('.v3-trend-readout'), r = readout?.getBoundingClientRect(); return { label, readout: readout?.textContent, inView: !!r && r.top >= 0 && r.bottom <= innerHeight }; });
    check('a tapped Trends bar shows its year and value under the chart', shown.readout === shown.label && shown.inView, shown);
  });
  await scenario('Dragging across the Trends chart scrubs the years', async () => {
    // The phone's 28 bars are 10.4 px wide, and a tap 5 px off picked the neighbouring year; a sideways drag now slides onto it.
    await viewport(); await go('explore=trends&year=2025&metric=tot&l=hr');
    await page.evaluate(() => document.querySelector('.v3-trend-chart').scrollIntoView({ block: 'center' })); await pause(300);
    const at = await page.$$eval('.v3-trend-chart .v3-chart-hit', hits => hits.map(h => { const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
    const cdp = await page.createCDPSession(), year = () => page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('year'));
    const drag = async (from, to) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 0 }] });
      for (let i = 1; i <= 20; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / 20, y: from.y + (to.y - from.y) * i / 20, id: 0 }] }); await pause(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pause(400);
    };
    await drag(at[2], at[17]);
    const scrubbed = await year(), top = await page.evaluate(() => scrollY);
    await drag(at[5], { x: at[5].x, y: at[5].y - 200 });
    const swiped = { year: await year(), scrolled: await page.evaluate(t => Math.round(scrollY - t), top) };
    await cdp.detach();
    // Back leaves the whole drag: its first year was pushed and the rest replaced it.
    await page.evaluate(() => history.back()); await pause(400);
    const back = await year();
    check('a sideways drag scrubs the Trends years in one history entry; a vertical swipe still scrolls', scrubbed === '2015' && swiped.year === '2015' && swiped.scrolled > 50 && back === '2025', { scrubbed, swiped, back });
  });
  await scenario('Phone rank lists scroll with the page', async () => {
    // The ranked county list was a 285 px inner scroller showing exactly five of 21 rows, nothing peeking, and a swipe that
    // started on it moved only the list: five 200 px swipes before the page moved.
    const report = {};
    for (const [width, height] of [[390, 844], [844, 390]]) {
      await viewport(width, height); await go('explore=map&year=2025&metric=tot&l=hr');
      const at = await page.evaluate(() => { const list = document.querySelector('.v3-county-panel .v3-rank-list'); list.scrollIntoView({ block: 'center' }); const r = list.getBoundingClientRect(); return { x: r.x + r.width / 2, y: Math.min(r.bottom, innerHeight) - 40 }; });
      await pause(300);
      const cdp = await page.createCDPSession(), top = await page.evaluate(() => scrollY);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 0 }] });
      for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: at.x, y: at.y - 20 * i, id: 0 }] }); await pause(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pause(500); await cdp.detach();
      report[`${width}×${height}`] = await page.evaluate(t => { const list = document.querySelector('.v3-county-panel .v3-rank-list'); return { inner: list.scrollHeight - list.clientHeight, pageMoved: Math.round(scrollY - t) }; }, top);
    }
    check('the phone rank list is not an inner scroller, so a swipe on it scrolls the page', Object.values(report).every(r => r.inner <= 1 && r.pageMoved > 100), report);
  });
  await scenario('The phone municipal list shows a cut row', async () => {
    // Its 556 rows need an inner scroller, and at 300 px it ended on a 1 px hairline of the sixth row: no sign it scrolls.
    await viewport(); await go('explore=municipalities&l=hr'); await page.waitForSelector('.v3-municipal-results button');
    const peek = await page.evaluate(() => {
      const list = document.querySelector('.v3-municipal-results'), edge = list.getBoundingClientRect().top + list.clientTop + list.clientHeight;
      const cut = [...list.querySelectorAll(':scope > button')].map(b => b.getBoundingClientRect()).find(r => r.top < edge && r.bottom > edge);
      return cut ? (edge - cut.top) / cut.height : 0;
    });
    check('the phone municipal list ends on a partly visible row', peek >= .25 && peek <= .75, Math.round(peek * 100) / 100);
  });
  await scenario('A municipal list pick shows its readout', async () => {
    // With the list scrolled to, a tap on "Osijek" changed only a faint row tint in view: the readout was 265–413 px above.
    await viewport(); await go('explore=municipalities&l=hr'); await page.waitForSelector('.v3-municipal-results button');
    await page.evaluate(() => document.querySelector('.v3-municipal-results').scrollIntoView({ block: 'start', behavior: 'instant' })); await pause(300);
    const at = await page.evaluate(() => { const r = [...document.querySelectorAll('.v3-municipal-results > button')].find(b => b.textContent.startsWith('Osijek')).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.touchscreen.tap(at.x, at.y); await pause(900);
    const shown = await page.evaluate(() => { const readout = document.querySelector('.v3-municipal-readout').getBoundingClientRect(), row = document.querySelector('.v3-municipal-results > button[aria-pressed="true"]')?.getBoundingClientRect(); return { name: document.querySelector('.v3-municipal-readout strong')?.textContent, readout: readout.top >= 0 && readout.bottom <= innerHeight, row: !!row && row.top >= 0 && row.bottom <= innerHeight }; });
    check('a tapped municipal list row brings its readout into view and stays in view itself', shown.name === 'Osijek' && shown.readout && shown.row, shown);
  });
  await scenario('Phone toasts use the screen width', async () => {
    // left:50% with translateX(-50%) capped the toast at half the screen, so "Podaci su izvezeni u CSV." took two lines.
    await viewport(320, 740); await go('explore=map&year=2024&l=hr');
    await page.click('.v3-export'); await page.waitForFunction(() => !!document.querySelector('.v3-toast').textContent);
    const toast = await page.evaluate(() => {
      const el = document.querySelector('.v3-toast'), r = el.getBoundingClientRect(), tops = new Set(), walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) { const range = document.createRange(); range.selectNodeContents(n); for (const rect of range.getClientRects()) tops.add(Math.round(rect.top)); }
      return { lines: tops.size, left: Math.round(r.left), right: Math.round(innerWidth - r.right) };
    });
    check('a short phone toast takes one line, centred inside the screen', toast.lines === 1 && Math.abs(toast.left - toast.right) <= 2 && toast.left >= 12, toast);
  });
  await scenario('The Regions legend sits under its map', async () => {
    // It came after the region cards and two notes: 589 px below the map at 390, 213 px at 768.
    const report = {};
    for (const [width, height, coarse] of [[390, 844, true], [768, 1024, true], [1440, 900, false]]) {
      await viewport(width, height, coarse); await go('explore=regions&year=2025&metric=tot&l=hr');
      report[width] = await page.evaluate(() => { const view = document.querySelector('[data-analysis="regions"]'), map = view.querySelector('.v3-cartography').getBoundingClientRect(), legend = view.querySelector('.v3-legend').getBoundingClientRect(); return { gap: Math.round(legend.top - map.bottom), under: legend.left >= map.left - 1 && legend.right <= map.right + 1 }; });
    }
    check('the Regions legend sits directly under its map on phones, tablets and desktop', Object.values(report).every(r => r.gap >= 0 && r.gap <= 40 && r.under), report);
  });

  check('no JavaScript runtime errors', runtimeErrors.length === 0, runtimeErrors);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, failures, runtimeErrors }, null, 2));
  if (failures.length) { process.exitCode = 1; console.error(`\n${failures.length} FAILURES / ${checks} MOBILE CHECKS`); }
  else console.log(`\n${checks} V3 MOBILE CHECKS PASSED`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.close(); });
