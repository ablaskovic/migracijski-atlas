#!/usr/bin/env node
// V3's public UI contract, plus the boundary that keeps the classic app intact.
// npm run verify:v3 builds to logs/v3-build so it can run beside the v2 suite.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer');
const raw = require('../src/data/atlas_data2.json');
const od = require('../src/data/odm.json');
const root = path.resolve(process.argv[2] || 'logs/v3-build');
const output = path.resolve('logs/v3-qa');
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/_vercel/')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('/* local platform stub */'); }
  let file = path.resolve(root, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
let checks = 0, browser;
const errors = [];
const check = (name, condition) => { assert.ok(condition, name); checks++; console.log('  ok ' + name); };
const expected = (iso, yi, flow, cum, relative) => {
  const c = raw.c[iso]; let n = 0;
  for (let i = cum ? raw.years.indexOf(2011) : yi; i <= yi; i++) {
    const internal = c.ii[i] - c.oi[i], external = c.ie[i] - c.oe[i];
    n += flow === 'int' ? internal : flow === 'ext' ? external : flow === 'nat' ? c.nat[i] : internal + external + (flow === 'all' ? c.nat[i] : 0);
  }
  return relative ? n / c.p * 100 : n;
};
const signed = (n, relative) => {
  const f = new Intl.NumberFormat('en-GB', { minimumFractionDigits: relative ? 1 : 0, maximumFractionDigits: relative ? 1 : 0 });
  const a = f.format(Math.abs(n)); return (a === f.format(0) ? '' : n > 0 ? '+' : '−') + a + (relative ? ' %' : '');
};

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-GB'] });
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  const downloadSession = await page.createCDPSession();
  await downloadSession.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: output });
  const downloadCSV = async filename => {
    const file = path.join(output, filename);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    await page.click('.v3-export');
    for (let i = 0; i < 40 && !fs.existsSync(file); i++) await new Promise(resolve => setTimeout(resolve, 100));
    return fs.readFileSync(file, 'utf8');
  };
  const go = async (suffix = '?version=v3&l=en') => { await page.goto(origin + '/' + suffix, { waitUntil: 'networkidle0' }); };
  const text = selector => page.$eval(selector, el => el.textContent);
  const click = async selector => { await page.click(selector); };
  const navClick = selector => Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click(selector)]);

  await go('?l=en');
  check('fresh visitors get v3 in dark mode', await page.evaluate(() => document.documentElement.dataset.atlasVersion === 'v3' && document.documentElement.dataset.theme === 'dark'));
  check('latest national figures match the published data', JSON.stringify(await page.$$eval('[data-stat]', els => els.map(el => el.textContent))) === JSON.stringify(['+19,180', '56,665', '37,485', '13 / 21']));
  check('all 21 counties are interactive', await page.$$eval('[data-county]', els => els.length === 21 && els.every(el => el.getAttribute('role') === 'button' && el.getAttribute('tabindex') === '0')));
  check('v2 stylesheet is absent from v3', await page.evaluate(() => [...document.styleSheets].every(s => !/\/src-[^/]*\.css/.test(s.href || ''))));
  await page.screenshot({ path: path.join(output, 'desktop-dark.png'), fullPage: true });
  await click('.v3-map-tools button:first-child');
  check('map zoom enlarges the geographic layer', await page.$eval('.v3-counties', el => el.parentElement.getAttribute('transform').includes('scale(1.5)')));
  await click('.v3-map-tools button:nth-child(3)');
  check('map reset restores its original extent', await page.$eval('.v3-counties', el => el.parentElement.getAttribute('transform').includes('scale(1)')));
  const countyCSV = await downloadCSV('atlas-2025-tot.csv');
  check('county CSV contains the current 21-county comparison', countyCSV.trim().split('\r\n').length === 22 && countyCSV.includes('"HR-01","Zagrebačka","2025","2025","tot","people","3475"'));

  for (const flow of ['tot', 'int', 'ext', 'nat', 'all']) {
    for (const setting of [{ year: 2025, cum: false, relative: false }, { year: 2024, cum: true, relative: true }, { year: 1998, cum: false, relative: false }]) {
      const yi = raw.years.indexOf(setting.year);
      await go(`?version=v3&l=en#explore=map&year=${setting.year}&metric=${flow}${setting.cum ? '&sum=1' : ''}${setting.relative ? '&unit=pct' : ''}`);
      const labels = await page.$$eval('[data-county]', els => Object.fromEntries(els.map(el => [el.dataset.county, el.getAttribute('aria-label')])));
      check(`${flow} ${setting.year} ${setting.cum ? 'cumulative %' : 'annual'}: every county matches source arrays`, Object.keys(raw.c).every(iso => labels[iso].endsWith(': ' + signed(expected(iso, yi, flow, setting.cum, setting.relative), setting.relative))));
    }
  }

  await go();
  await page.type('.v3-search input', 'sisa');
  check('county search ignores accents', (await text('.v3-rank-list')).includes('Sisačko'));
  await page.focus('.v3-rank-row'); await page.keyboard.press('Enter');
  check('keyboard selection opens the matching detail and retains focus', await page.evaluate(() => document.activeElement === document.querySelector('.v3-county-detail h2') && location.hash.includes('county=HR-03')));
  await click('.v3-county-detail .v3-icon-button');
  check('closing detail restores focus to that county', await page.evaluate(() => document.activeElement?.getAttribute('data-county') === 'HR-03'));
  await go();
  await page.type('.v3-search input', 'no county matches');
  check('search has a useful empty state', await page.$('.v3-empty') !== null);
  await click('.v3-empty button');
  check('empty-state reset restores all counties', await page.$$eval('.v3-rank-row', els => els.length === 21));

  await page.select('#v3-year', String(raw.years.indexOf(2000)));
  await click('.v3-time-mode button:nth-child(2)');
  check('cumulative mode starts no earlier than 2011', await page.$eval('#v3-year', el => el.value === '13') && (await text('.v3-period')).includes('2011–2011'));
  await click('.v3-time-mode button:first-child');
  await page.select('#v3-year', '0');
  await click('.v3-play');
  await page.waitForFunction(() => document.querySelector('#v3-year').value !== '0');
  await click('.v3-play');
  const stopped = await page.$eval('#v3-year', el => el.value);
  await new Promise(resolve => setTimeout(resolve, 1050));
  check('play advances years and pause stops it', await page.$eval('#v3-year', el => el.value) === stopped);

  await go();
  await click('.v3-tabs button:nth-child(2)');
  check('historical grid contains 21 × 28 annual observations', await page.$$eval('[data-grid-cell]', els => els.length === 588));
  check('annual trends do not offer a contradictory cumulative mode', await page.$eval('.v3-time-mode button:nth-child(2)', el => el.disabled));
  check('interactive chart exposes its year controls', await page.$eval('.v3-trend-chart', el => el.getAttribute('role') === 'group'));
  const yearsCSV = await downloadCSV('atlas-1998-2025-tot.csv');
  check('historical CSV contains every displayed county/year observation', yearsCSV.trim().split('\r\n').length === 589 && yearsCSV.includes('"HR-21","Grad Zagreb","2025","tot","people","2397"'));
  await page.focus('[data-grid-cell="0"]'); await page.keyboard.press('ArrowDown');
  check('heatmap uses arrow-key navigation', await page.evaluate(() => document.activeElement?.getAttribute('data-grid-cell') === '28'));
  await page.keyboard.press('Enter');
  check('heatmap selection changes county and year together', await page.evaluate(() => location.hash.includes('county=HR-02') && location.hash.includes('year=1998')));
  await page.screenshot({ path: path.join(output, 'trends.png'), fullPage: true });

  await go(); await click('.v3-tabs button:nth-child(3)');
  check('flows first open on the measured 2018 matrix', (await text('.v3-data-badge')).includes('MEASURED') && await page.$eval('#v3-year', el => el.value === '20'));
  await click('.v3-segment button:nth-child(2)');
  check('direction is encoded in shared links', await page.evaluate(() => location.hash.includes('dir=out')));
  await page.reload({ waitUntil: 'networkidle0' });
  check('shared flow direction survives reload', await page.$eval('.v3-segment button:nth-child(2)', el => el.getAttribute('aria-pressed') === 'true'));
  const linkValue = od['HR-21']['HR-01'][20];
  check('flow labels describe the corridor rather than hidden net values', (await page.$eval('[data-county="HR-01"]', el => el.getAttribute('aria-label'))).includes(`City of Zagreb → Zagrebačka: ${new Intl.NumberFormat('en-GB').format(linkValue)} moves`));
  const downloads = await page.createCDPSession();
  await downloads.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: output });
  const csv = path.join(output, 'atlas-2018-flows-out.csv');
  if (fs.existsSync(csv)) fs.unlinkSync(csv);
  await click('.v3-export');
  for (let i = 0; i < 40 && !fs.existsSync(csv); i++) await new Promise(resolve => setTimeout(resolve, 100));
  const exported = fs.readFileSync(csv, 'utf8');
  check('flow CSV carries actual corridor counts and measured provenance', exported.includes('"Origin ISO"') && exported.includes('"Measured 2018"') && exported.includes(`"HR-21","Grad Zagreb","HR-01","Zagrebačka","2018","2018","${linkValue}"`));
  await page.select('#v3-year', '27');
  check('unmeasured flow years disclose the IPF estimate', (await text('.v3-data-badge')).includes('IPF ESTIMATE') && (await text('.v3-map-column')).includes('in-margins approximate'));
  await page.screenshot({ path: path.join(output, 'flows.png'), fullPage: true });

  await go('?version=v3&l=en#explore=map&year=2020&metric=ext&unit=pct&county=HR-18');
  const v3Hash = await page.evaluate(() => location.hash);
  await click('.v3-header-actions>.v3-icon-button');
  await page.reload({ waitUntil: 'networkidle0' });
  check('chosen light theme persists', await page.evaluate(() => document.documentElement.dataset.theme === 'light'));
  await page.screenshot({ path: path.join(output, 'desktop-light.png'), fullPage: true });
  await navClick('.atlas-version-switch a[href*="version=v2"]');
  check('v2 switch loads the original map', await page.$('#map') !== null && await page.$('.v3-app') === null);
  check('v3 styles never leak into v2', await page.evaluate(() => [...document.styleSheets].every(s => !/AppV3-/.test(s.href || ''))));
  await go('?version=v2&l=en#v=saldo&c=0&y=2018&s=HR-18&l=en');
  const v2Hash = await page.evaluate(() => location.hash);
  await navClick('.atlas-version-switch a[href*="version=v3"]');
  check('switching back restores the v3 analysis', await page.evaluate(() => location.hash) === v3Hash);
  await navClick('.atlas-version-switch a[href*="version=v2"]');
  check('v2 also retains its own analysis', await page.evaluate(() => location.hash) === v2Hash);
  await go('#v=saldo&c=0&y=2018');
  check('old shared links keep opening v2', await page.$('#map') !== null && await page.$('.v3-app') === null);
  await go('?version=v3&l=en');
  await click('.v3-header-actions>.v3-icon-button');
  await page.select('#v3-year', '20');
  await page.select('#v3-year', '24');
  await page.goBack();
  check('browser Back restores the selected year', await page.$eval('#v3-year', el => el.value === '20'));
  await page.goForward();
  check('browser Forward restores the newer selection', await page.$eval('#v3-year', el => el.value === '24'));

  await click('.v3-footer-links button');
  check('sources open in an accessible modal dialog', await page.$eval('.v3-about', el => el.open && el.getAttribute('aria-labelledby') === 'v3-about-title'));
  await page.keyboard.press('Escape');
  check('dialog closes and restores the actual opener', await page.evaluate(() => !document.querySelector('.v3-about').open && document.activeElement === document.querySelector('.v3-footer-links button')));
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  await click('.v3-share');
  check('sharing works when clipboard access is denied', await page.$eval('.v3-share-fallback input', el => el.value === location.href && el.readOnly));
  await page.keyboard.press('Escape');
  check('closing the manual share field restores focus', await page.evaluate(() => document.activeElement === document.querySelector('.v3-share')));

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await go('?version=v3&l=en');
    check(`layout fits a ${width}px viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`every view tab and export fits at ${width}px`, await page.evaluate(() => [...document.querySelectorAll('.v3-tabs button,.v3-export')].every(el => { const b = el.getBoundingClientRect(); const p = el.closest('.v3-toolbar').getBoundingClientRect(); return b.left >= p.left && b.right <= p.right; })));
    if (width === 390) {
      check('mobile Share has an accessible name', await page.$eval('.v3-share', el => el.getAttribute('aria-label') === 'Share this view'));
      check('mobile year controls follow the map before the county list', await page.evaluate(() => document.querySelector('.v3-timeline').getBoundingClientRect().top < document.querySelector('.v3-county-panel').getBoundingClientRect().top));
      await page.screenshot({ path: path.join(output, 'mobile-dark.png'), fullPage: true });
    }
  }
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  check('reduced-motion preference disables animations', await page.$eval('.v3-workspace', el => getComputedStyle(el).animationName === 'none'));
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  check('enlarged text does not create page-wide overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('interface text respects the reader’s font-size setting', await page.$eval('.v3-stat-label', el => parseFloat(getComputedStyle(el).fontSize) >= 24));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  check('phone layout supports 200% text enlargement', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('no JavaScript runtime errors', errors.length === 0);
  console.log(`\n${checks} V3 CHECKS PASSED`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.close(); });
