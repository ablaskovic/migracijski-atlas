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
  browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--lang=en-GB'] });
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
  const mapBounds = await page.$eval('.v3-map', el => el.getBoundingClientRect().toJSON());
  const countyBeforePan = await page.$eval('[data-county="HR-01"]', el => el.getBoundingClientRect().left);
  await page.mouse.move(mapBounds.x + 20, mapBounds.y + 40);
  await page.mouse.down();
  await page.mouse.move(mapBounds.x + 80, mapBounds.y + 40, { steps: 6 });
  await page.mouse.up();
  const countyAfterPan = await page.$eval('[data-county="HR-01"]', el => el.getBoundingClientRect().left);
  check('dragging the responsive map tracks the pointer distance', Math.abs(countyAfterPan - countyBeforePan - 60) < 1);
  await click('.v3-map-tools button:nth-child(3)');
  check('map reset restores its original extent', await page.$eval('.v3-counties', el => el.parentElement.getAttribute('transform').includes('scale(1)')));
  const countyCSV = await downloadCSV('atlas-v3-map-tot-abs-en-2025.csv');
  check('county CSV contains the current 21-county comparison', countyCSV.trim().split('\r\n').length === 22 && countyCSV.includes('"HR-01","Zagrebačka","2025","2025","net migration","people","3475"'));

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
  check('cumulative mode starts no earlier than 2011 and names that single year once', await page.$eval('#v3-year', el => el.value === '13') && (await text('.v3-period strong')) === '2011');
  await click('.v3-time-mode button:first-child');
  await page.select('#v3-year', '0');
  await click('.v3-play');
  await page.waitForFunction(() => document.querySelector('#v3-year').value !== '0');
  await click('.v3-play');
  const stopped = await page.$eval('#v3-year', el => el.value);
  await new Promise(resolve => setTimeout(resolve, 1050));
  check('play advances years and pause stops it', await page.$eval('#v3-year', el => el.value) === stopped);

  // WebKit throws SecurityError past 100 history writes per 30 s, so a continuous drag must stay well under it.
  await go('?version=v3&l=en#explore=map&year=1998&metric=tot&l=en');
  await page.evaluate(() => { window.historyWrites = { push: 0, replace: 0 }; for (const [method, key] of [['pushState', 'push'], ['replaceState', 'replace']]) { const original = history[method].bind(history); history[method] = (...args) => { window.historyWrites[key]++; return original(...args); }; } });
  const track = await page.$eval('.v3-slider-wrap input', el => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + 2, y: r.top + r.height / 2, w: r.width - 4 }; });
  await page.mouse.move(track.x, track.y); await page.mouse.down();
  const dragStart = Date.now();
  for (let i = 0; Date.now() - dragStart < 3000; i++) { const f = (i % 40) / 39; await page.mouse.move(track.x + track.w * (Math.floor(i / 40) % 2 ? 1 - f : f), track.y); }
  await page.mouse.up();
  const dragSeconds = (Date.now() - dragStart) / 1000;
  await new Promise(resolve => setTimeout(resolve, 450));
  const scrub = await page.evaluate(() => ({ ...window.historyWrites, shown: document.querySelector('#v3-year').selectedOptions[0].textContent, linked: new URLSearchParams(location.hash.slice(1)).get('year') }));
  check('scrubbing the year writes history at most about three times a second and the link ends on the shown year', scrub.push === 0 && scrub.replace >= 2 && scrub.replace <= dragSeconds / 0.3 + 2 && scrub.linked === scrub.shown);
  await page.evaluate(() => { history.replaceState = () => { throw new DOMException('Attempt to use history.replaceState() more than 100 times per 30 seconds', 'SecurityError'); }; });
  const errorsBefore = errors.length;
  await page.focus('.v3-slider-wrap input'); await page.keyboard.press('Home');
  await new Promise(resolve => setTimeout(resolve, 450));
  check('a refused history write leaves the atlas responding', errors.length === errorsBefore && await page.$eval('#v3-year', el => el.selectedOptions[0].textContent) === '1998');
  // A new query forces a fresh document; a fragment-only goto would keep the refusing stub above.
  await go('?version=v3&l=en&fresh=threshold#explore=classify&year=2024&metric=tot&l=en');
  // Counted as pushState calls: history.length stops growing at Chrome's cap of 50 entries.
  await page.evaluate(() => { window.pushes = 0; const push = history.pushState.bind(history); history.pushState = (...args) => { window.pushes++; return push(...args); }; });
  const threshold = await page.$eval('.v3-threshold input[type=range]', el => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + 2, y: r.top + r.height / 2, w: r.width - 4 }; });
  await page.mouse.move(threshold.x, threshold.y); await page.mouse.down(); await page.mouse.move(threshold.x + threshold.w, threshold.y, { steps: 25 }); await page.mouse.up();
  await new Promise(resolve => setTimeout(resolve, 450));
  check('dragging the loss threshold replaces the entry instead of adding one per step', await page.evaluate(() => window.pushes === 0 && new URLSearchParams(location.hash.slice(1)).get('threshold') === '15000'));
  // A year step re-renders 420 matrix labels; building an Intl.NumberFormat per label was a third of every step.
  await go('?version=v3&l=en&fresh=formatters#explore=matrix&year=2018&metric=tot&l=en');
  await page.evaluate(() => { window.formatterBuilds = 0; const Native = Intl.NumberFormat; Intl.NumberFormat = new Proxy(Native, { construct(target, args) { window.formatterBuilds++; return new target(...args); } }); });
  await page.focus('.v3-slider-wrap input'); await page.keyboard.press('ArrowLeft');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check('a matrix year step reuses number formatters instead of building one per cell', await page.evaluate(() => document.querySelector('#v3-year').selectedOptions[0].textContent === '2017' && window.formatterBuilds < 25));
  // House rules for displayed numbers: U+2212 in both languages (en-GB prints a hyphen), `+` on balances, ` %` for rates.
  const numberOffenders = () => page.evaluate(() => {
    const out = [], skip = e => e.closest('[data-grid-cell],[data-matrix-cell],.v3-matrix,.v3-years,script,style');
    const walker = document.createTreeWalker(document.querySelector('.v3-workspace'), NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.parentElement && !skip(n.parentElement)) out.push(n.textContent);
    for (const e of document.querySelectorAll('.v3-workspace [aria-label], .v3-workspace [title]')) if (!skip(e)) out.push(e.getAttribute('aria-label') || '', e.getAttribute('title') || '');
    return out.filter(t => /(^|[^\w])-\d/.test(t) || /\d%/.test(t));
  });
  const offenders = {};
  for (const lang of ['en', 'hr']) for (const state of ['explore=flows&year=2018&county=HR-21&dir=net&pair=HR-01', 'explore=municipalities&dir=net', 'explore=trends', 'explore=map&county=HR-21', 'explore=population&panel=citizenship', 'explore=population&panel=countries', 'explore=population&panel=age']) {
    await go(`?version=v3&l=${lang}&fresh=${lang}${state.length}#${state}&l=${lang}`);
    if (state.includes('municipalities')) await page.waitForFunction(() => document.querySelectorAll('[data-municipality]').length === 556);
    const found = await numberOffenders(); if (found.length) offenders[lang + ' ' + state] = found.slice(0, 4);
  }
  check('every displayed number uses the typographic minus and a spaced percent sign', Object.keys(offenders).length === 0);
  await go('?version=v3&l=en&fresh=signs#explore=flows&year=2018&county=HR-21&dir=net&l=en');
  check('net corridor values carry an explicit sign', await page.$$eval('.v3-rank-row strong', els => els.length === 20 && els.every(e => /^[+−]\d|^0$/.test(e.textContent))));
  await go('?version=v3&l=en&fresh=citsigns#explore=population&panel=citizenship&l=en');
  check('citizenship balances carry an explicit sign', await page.$$eval('.v3-pop-table tbody tr td:last-child, .v3-pop-table tfoot td:last-child', els => els.length === 7 && els.every(e => /^[+−]\d|^0$/.test(e.textContent))));
  // The year grid formatted with bare Intl: "−0 %" in 68 of 588 cells, "3 %" beside the rail's "+3,0 %", no "+".
  for (const lang of ['hr', 'en']) {
    await go(`?version=v3&l=${lang}&fresh=grid${lang}#explore=trends&metric=int&unit=pct&l=${lang}`);
    check(`${lang} year-grid rates are signed with one decimal and never a signed zero`, await page.$$eval('[data-grid-cell]', els => els.length === 588 && els.every(e => /^([+−]\d+[.,]\d %|0[.,]0 %)$/.test(e.getAttribute('aria-label').split(': ').at(-1)))));
    await go(`?version=v3&l=${lang}&fresh=gridabs${lang}#explore=trends&metric=tot&l=${lang}`);
    check(`${lang} year-grid balances are signed with the typographic minus`, await page.$$eval('[data-grid-cell]', els => els.length === 588 && els.every(e => /^([+−]\d{1,3}([.,]\d{3})*|0)$/.test(e.getAttribute('aria-label').split(': ').at(-1)))));
  }
  // A cumulative window that opens and closes in 2011 is one year; "2011–2011" was printed on KPIs, headings, grid cells, pair notes and file names.
  const repeatedWindow = {};
  for (const state of ['explore=map&year=2011&sum=1&county=HR-18', 'explore=trends&year=2011&sum=1', 'explore=regions&year=2011&sum=1', 'explore=matrix&year=2011&sum=1&county=HR-21&pair=HR-01', 'explore=flows&year=2011&sum=1&county=HR-21&pair=HR-01']) {
    await go(`?version=v3&l=en&fresh=${state.length}#${state}&l=en`);
    const hits = await page.evaluate(() => [document.body.innerText, document.title, ...[...document.querySelectorAll('[aria-label],[title]')].map(e => (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || ''))].filter(t => t.includes('2011–2011')).length);
    if (hits) repeatedWindow[state] = hits;
  }
  check('a one-year cumulative window is printed as one year', Object.keys(repeatedWindow).length === 0);
  await go('?version=v3&l=en&fresh=csv2011#explore=matrix&year=2011&sum=1&l=en');
  check('a one-year cumulative export is named for that year', (await downloadCSV('atlas-v3-matrix-in-en-2011.csv')).includes('"2011","2011"'));
  // Views that force their own lens (classification, municipalities, population, flows' 2018) used to write it into
  // the shared state, so returning to the map lost the reader's metric, unit and year.
  const lensOf = () => page.evaluate(() => { const p = new URLSearchParams(location.hash.slice(1)); return [p.get('explore'), p.get('year'), p.get('metric'), p.get('unit'), p.get('sum')].join('|'); });
  const pickView = async view => { await page.select('#v3-view-select', view); await page.waitForFunction(v => new URLSearchParams(location.hash.slice(1)).get('explore') === v, {}, view); };
  for (const detour of ['classify', 'municipalities', 'population', 'flows']) {
    await go(`?version=v3&l=en&fresh=lens${detour}#explore=map&year=2010&metric=ext&unit=pct&l=en`);
    const before = await lensOf(); await pickView(detour); await pickView('map');
    check(`returning from ${detour} restores the map's year, metric and unit`, await lensOf() === before);
  }
  await go('?version=v3&l=en&fresh=flowwindow#explore=flows&year=2015&county=HR-21&l=en');
  await pickView('map'); await pickView('flows');
  check('returning to flows restores its own year', await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('year') === '2015'));
  await go('?version=v3&l=en&fresh=flowfirst#explore=map&year=2025&l=en');
  await pickView('flows');
  check('a first visit to flows still opens on the measured 2018', await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('year') === '2018' && !new URLSearchParams(location.hash.slice(1)).has('sum')));
  // Escape is the fields' own key (a search box clears itself, a select closes its list); the global shortcut used to
  // clear the county from inside them. After a clear that leaves the focused control in place, focus stays there.
  const countyParam = () => page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('county'));
  await go('?version=v3&l=en&fresh=escsearch#explore=municipalities&county=HR-21&l=en');
  await page.waitForFunction(() => document.querySelectorAll('[data-municipality]').length === 556);
  await page.type('.v3-municipal-search input', 'gor'); await page.keyboard.press('Escape');
  check('Escape in the municipal search keeps the county filter', await countyParam() === 'HR-21');
  await go('?version=v3&l=en&fresh=escselect#explore=map&county=HR-21&l=en');
  await page.focus('#v3-year'); await page.keyboard.press('Escape');
  check('Escape on the year select keeps the selected county', await countyParam() === 'HR-21');
  await go('?version=v3&l=en&fresh=escrange#explore=classify&county=HR-14&l=en');
  await page.focus('.v3-threshold input[type=range]'); await page.keyboard.press('Escape');
  check('Escape on the threshold slider keeps the county and the focus', await countyParam() === 'HR-14' && await page.evaluate(() => document.activeElement?.matches('.v3-threshold input[type=range]')));
  await go('?version=v3&l=en&fresh=escgrid#explore=trends&county=HR-21&year=2025&l=en');
  await page.focus('[data-grid-cell="30"]'); await page.keyboard.press('Escape'); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check('Escape in the year grid clears the county and leaves focus on the cell', await countyParam() === null && await page.evaluate(() => document.activeElement?.getAttribute('data-grid-cell') === '30'));
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  await page.click('.v3-share'); await page.waitForSelector('.v3-share-fallback input'); await page.focus('.v3-share-fallback input');
  await page.keyboard.press('Escape');
  check('Escape inside the manual share field still closes it', !await page.$('.v3-share-fallback'));
  // The county panel's local-corridors button opened the national age/sex panel, which ignores the county.
  await go('?version=v3&l=en&fresh=cta#explore=map&county=HR-05&l=en');
  const localButton = await page.$$eval('.v3-county-detail .v3-text-button', els => els.at(-1).textContent);
  await page.evaluate(() => [...document.querySelectorAll('.v3-county-detail .v3-text-button')].at(-1).click());
  await page.waitForSelector('.v3-population');
  check('the county panel opens that county’s local corridors', await page.evaluate(() => { const p = new URLSearchParams(location.hash.slice(1)); return p.get('explore') === 'population' && p.get('panel') === 'municipal' && p.get('county') === 'HR-05' && document.querySelector('.v3-pop-field select')?.value === 'HR-05' && /Varaždinska/.test(document.querySelector('.v3-pop-heading .v3-eyebrow')?.textContent); }));
  check('the local-corridors button names what it opens', /local corridors/i.test(localButton) && !/population/i.test(localButton));
  // The municipal-corridors panel always shows one county, like the flows hub; "All Croatia" and Escape cleared the URL's
  // county while the panel kept showing the old one.
  const popScope = () => page.evaluate(() => ({ county: new URLSearchParams(location.hash.slice(1)).get('county'), panel: document.querySelector('.v3-pop-field select')?.value, title: document.querySelector('.v3-intro h1').textContent, reset: !!document.querySelector('.v3-period button') }));
  await go('?version=v3&l=en&fresh=popreset#explore=population&panel=municipal&county=HR-05&l=en');
  const popShown = await popScope();
  check('the municipal corridors panel offers no All Croatia reset', !popShown.reset && popShown.panel === 'HR-05' && popShown.title === 'Varaždinska');
  await page.keyboard.press('Escape');
  const popEscaped = await popScope();
  check('Escape keeps the municipal panel’s county', popEscaped.county === 'HR-05' && popEscaped.panel === 'HR-05');
  await go('?version=v3&l=en&fresh=popdefault#explore=population&panel=municipal&l=en');
  const popDefault = await popScope();
  check('without a county the header and the municipal panel both name Grad Zagreb', popDefault.panel === 'HR-21' && popDefault.title === 'City of Zagreb');
  // A matrix selection is row + column; "All Croatia" cleared only the row, so the pair card re-targeted the default hub.
  await go('?version=v3&l=en&fresh=mxall#explore=matrix&year=2018&county=HR-14&pair=HR-05&l=en');
  await page.click('.v3-period button');
  check('All Croatia on the matrix clears the selected corridor with its row', await page.evaluate(() => { const p = new URLSearchParams(location.hash.slice(1)); return !p.has('pair') && !p.has('county') && !document.querySelector('#v3-pair-title') && !document.querySelector('[data-matrix-cell][aria-pressed="true"]'); }));
  // A region card stands its region in as the region's first county (North Adriatic → HR-08); the stand-in leaked into the
  // map as a county nobody chose. A county clicked on the regions map is a real choice and stays.
  await go('?version=v3&l=en&fresh=regioncard#explore=regions&l=en');
  const cardName = await page.$eval('[data-region="sj"] span', e => e.firstChild.textContent);
  await page.click('[data-region="sj"]');
  const regionTitle = await text('.v3-intro h1');
  await pickView('map');
  check('a region picked from its card does not follow the reader to the map as a county', regionTitle === cardName && await page.evaluate(() => !new URLSearchParams(location.hash.slice(1)).has('county') && document.querySelector('.v3-intro h1').textContent === 'Croatia in motion.'));
  await go('?version=v3&l=en&fresh=regioncounty#explore=regions&l=en');
  await page.evaluate(() => document.querySelector('[data-county="HR-17"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await pickView('map');
  check('a county clicked on the regions map stays selected on the map', await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('county') === 'HR-17'));
  // Region cards took aria-pressed from hover-or-selection, so pointing at a card announced it as pressed.
  const pressedRegions = () => page.$$eval('[data-region][aria-pressed="true"]', els => els.map(e => e.dataset.region).join());
  await go('?version=v3&l=en&fresh=regionhover#explore=regions&l=en');
  await page.hover('[data-region="is"]');
  const idleRegions = await pressedRegions();
  await page.click('[data-region="sj"]'); await page.hover('[data-region="is"]');
  check('region cards report the selected region as pressed, never the hovered one', idleRegions === '' && await pressedRegions() === 'sj');
  // On the map a second click on the selected county deselects it; Classification and Regions kept it selected.
  const clickShape = iso => page.evaluate(i => document.querySelector(`[data-county="${i}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true })), iso);
  const clickTwice = async click => { await click(); const first = await countyParam(); await click(); return [first, await countyParam()]; };
  await go('?version=v3&l=en&fresh=toggleclassify#explore=classify&year=2024&l=en');
  const classMap = await clickTwice(() => clickShape('HR-14'));
  const classList = await clickTwice(() => page.evaluate(() => [...document.querySelectorAll('.v3-analysis-list button')].find(b => b.textContent.startsWith('Istarska')).click()));
  await go('?version=v3&l=en&fresh=toggleregions#explore=regions&l=en');
  const regionMap = await clickTwice(() => clickShape('HR-17'));
  const regionCard = await clickTwice(() => page.click('[data-region="sj"]'));
  check('a second click deselects in Classification and Regions, as on the map', JSON.stringify([classMap, classList, regionMap, regionCard]) === JSON.stringify([['HR-14', null], ['HR-18', null], ['HR-17', null], ['HR-08', null]]));
  // The national trend chart always drew net external migration, whatever the Component buttons said. National internal
  // migration is zero from 2007 (one county's gain is another's loss), so that component gets a note, not bars of residuals.
  const nationalChart = {};
  for (const metric of ['tot', 'ext', 'nat', 'all', 'int']) {
    await go(`?version=v3&l=en&fresh=nat${metric}#explore=trends&metric=${metric}&l=en`);
    nationalChart[metric] = { bar: await page.$$eval('.v3-chart-hit', els => els.at(-1)?.getAttribute('aria-label') ?? null), subtitle: await text('.v3-trends-view .v3-section-heading p'), note: await page.$eval('.v3-trends-view', e => /cancels? out/i.test(e.textContent)) };
  }
  check('the national chart follows the component: total and external 2025 = +19,180', nationalChart.tot.bar === '2025: +19,180' && nationalChart.ext.bar === '2025: +19,180');
  check('the national chart shows natural change and migration + natural change', nationalChart.nat.bar === '2025: −17,528' && nationalChart.all.bar === '2025: +1,652' && /natural change/i.test(nationalChart.nat.subtitle));
  check('national internal migration is explained instead of charted', nationalChart.int.bar === null && nationalChart.int.note);
  // The gains card always counted total migration and contradicted the findings above it (external 2022: 12 counties,
  // card 11/21; natural change 2011–2024: none, card 7/21; migration + natural change: five, card 7/21).
  const gainCards = {};
  for (const [key, hash] of [['ext2022', 'explore=map&year=2022&metric=ext'], ['natCum', 'explore=map&year=2024&metric=nat&sum=1&unit=pct'], ['allCum', 'explore=map&year=2024&metric=all&sum=1'], ['municipal', 'explore=municipalities&metric=ext']]) {
    await go(`?version=v3&l=en&fresh=kpi${key}#${hash}&l=en`);
    gainCards[key] = await page.evaluate(() => ({ value: document.querySelector('[data-stat="counties"]').textContent, caption: document.querySelectorAll('.v3-stat')[3].querySelector(':scope > span').textContent }));
  }
  check('the gains card counts the selected component', gainCards.ext2022.value === '12 / 21' && gainCards.natCum.value === '0 / 21' && gainCards.allCum.value === '5 / 21');
  check('the gains card says what was compared', /births/i.test(gainCards.natCum.caption) && /arrivals/i.test(gainCards.ext2022.caption));
  check('views without a component selector count total migration', gainCards.municipal.value === '4 / 21');
  // For a county the first card is the total balance, captioned "arrivals − departures" beside two cards that count only
  // moves abroad (Grad Zagreb 2025: +2,397 next to 10,375 − 7,891 = 2,484). Nationally that caption is right.
  await go('?version=v3&l=en&fresh=kpicounty#explore=map&year=2025&county=HR-21&l=en');
  const countyCaption = await text('.v3-stat-primary > span');
  await go('?version=v3&l=en&fresh=kpinational#explore=map&year=2025&l=en');
  check('a county’s balance card says it combines internal and external moves', /internal/i.test(countyCaption) && /external/i.test(countyCaption) && !countyCaption.includes('arrivals − departures'));
  check('the national balance card still reads arrivals − departures', (await text('.v3-stat-primary > span')).startsWith('arrivals − departures'));
  // A finding's caption describes the view its preset sets; v3 removed it on any change, so opening a county under
  // Finding 2 (five counties in the black) dropped the caption although the view still showed exactly its claim.
  const findingShown = () => page.evaluate(() => !!document.querySelector('.v3-finding') && new URLSearchParams(location.hash.slice(1)).has('finding'));
  await go('?version=v3&l=en&fresh=keepfinding#explore=map&l=en');
  await page.select('[aria-label="Guided findings"]', '1');
  await page.evaluate(() => document.querySelector('[data-county="HR-21"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  check('a finding stays while the view still shows its claim (a county opened under it)', await findingShown());
  await page.reload({ waitUntil: 'networkidle0' });
  check('that state reloads with its finding', await findingShown());
  await page.evaluate(() => [...document.querySelectorAll('.v3-metrics button')].find(b => b.textContent === 'Internal').click());
  check('a finding leaves when a value it cites changes', !await findingShown());
  // Arrow keys on a closed <select> change its value at once on Windows; on the view and findings selects every option
  // passed applied itself — a view switch or a whole finding, plus a history entry, per key.
  // Entries are counted as pushState calls: this tab's history.length is already at Chrome's cap of 50.
  const navState = () => page.evaluate(() => ({ view: new URLSearchParams(location.hash.slice(1)).get('explore'), finding: new URLSearchParams(location.hash.slice(1)).get('finding'), entries: window.pushes }));
  await go('?version=v3&l=en&fresh=navselect#explore=map&l=en');
  await page.evaluate(() => { window.pushes = 0; const push = history.pushState.bind(history); history.pushState = (...args) => { window.pushes++; return push(...args); }; });
  const navStart = await navState();
  await page.focus('#v3-view-select'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  const navBrowsing = await navState();
  check('arrowing through the closed view select does not switch views', navBrowsing.view === 'map' && navBrowsing.entries === navStart.entries && await page.$eval('#v3-view-select', e => e.value === 'flows'));
  await page.keyboard.press('Enter');
  const navEntered = await navState();
  check('Enter applies the view the select shows, once', navEntered.view === 'flows' && navEntered.entries === navStart.entries + 1);
  await page.focus('[aria-label="Guided findings"]'); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  check('arrowing through the closed findings select applies no finding', (await navState()).finding === null);
  await page.keyboard.press('Tab');
  check('leaving the findings select applies the finding it shows', (await navState()).finding === '2');
  // WCAG 2.5.3: the view select's visible label reads "ISTRAŽI / EXPLORE"; its accessible name was "Svi prikazi / All views".
  const selectNames = {};
  for (const lang of ['hr', 'en']) {
    await go(`?version=v3&l=${lang}&fresh=labelinname${lang}#explore=map&l=${lang}`);
    selectNames[lang] = { name: (await page.accessibility.snapshot({ root: await page.$('#v3-view-select') }))?.name ?? '', visible: await page.$eval('.v3-explore-controls label', e => e.firstChild.textContent.trim()) };
  }
  check('the view select’s accessible name begins with its visible label', ['hr', 'en'].every(l => selectNames[l].name.toLocaleLowerCase().startsWith(selectNames[l].visible.toLocaleLowerCase())));
  // The Discover cards and the footer's classification link changed the workspace far above them without taking the reader
  // there; the county panel's view links focused a view select scrolled out of view.
  const workspaceView = () => page.evaluate(() => { const ws = document.querySelector('.v3-workspace').getBoundingClientRect(), select = document.getElementById('v3-view-select').getBoundingClientRect(); return { workspaceTop: ws.top, selectTop: select.top, selectBottom: select.bottom, vh: innerHeight, focused: document.activeElement?.id }; });
  const settleScroll = () => new Promise(resolve => setTimeout(resolve, 900));
  await go('?version=v3&l=en&fresh=discover#explore=map&l=en');
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.click('.v3-discover > button:nth-of-type(1)'); await settleScroll();
  const afterDiscover = await workspaceView();
  check('a Discover card takes the reader to the view it opened', afterDiscover.workspaceTop > -2 && afterDiscover.workspaceTop < afterDiscover.vh / 2 && afterDiscover.focused === 'v3-view-select');
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.evaluate(() => [...document.querySelectorAll('.v3-footer-links button')].find(b => /Classification/.test(b.textContent)).click()); await settleScroll();
  const afterFooter = await workspaceView();
  check('the footer’s classification link takes the reader to that view', afterFooter.workspaceTop > -2 && afterFooter.workspaceTop < afterFooter.vh / 2 && afterFooter.focused === 'v3-view-select' && await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('explore') === 'classify'));
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await go('?version=v3&l=en&fresh=detaillink#explore=map&county=HR-06&l=en');
  await page.$eval('.v3-county-detail > .v3-text-button', e => e.scrollIntoView({ block: 'center' }));
  await page.focus('.v3-county-detail > .v3-text-button'); await page.keyboard.press('Enter'); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const afterDetail = await workspaceView();
  check('a view link in the county panel focuses the view select on screen', afterDetail.focused === 'v3-view-select' && afterDetail.selectTop >= 0 && afterDetail.selectBottom <= afterDetail.vh);
  await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  // A control that disables or removes itself while focused dropped focus to <body>: zoom buttons at their limits, the
  // matrix size buttons, PNG/SVG during an export, the empty-state "clear" buttons and the geometry retry.
  await downloadSession.send('Page.setDownloadBehavior', { behavior: 'deny' });
  const focusName = () => page.evaluate(() => { const e = document.activeElement; return e === document.body ? 'BODY' : (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.tagName); });
  const pressOn = async (selector, times) => { await page.focus(selector); for (let i = 0; i < times; i++) await page.keyboard.press('Enter'); await new Promise(resolve => setTimeout(resolve, 150)); return focusName(); };
  const kept = {};
  await go('?version=v3&l=en&fresh=focuszoom#explore=map&l=en');
  kept.zoomInAtMax = await pressOn('.v3-map-tools button:nth-child(1)', 4);
  kept.zoomOutAtMin = await pressOn('.v3-map-tools button:nth-child(2)', 4);
  await go('?version=v3&l=en&fresh=focusmatrix#explore=matrix&year=2018&l=en');
  kept.matrixEnlarge = await pressOn('.v3-matrix-zoom button:nth-of-type(2)', 4);
  kept.matrixReset = await pressOn('.v3-matrix-zoom button:nth-of-type(3)', 1);
  kept.exportPng = await pressOn('[aria-label="Export PNG"]', 1); await new Promise(resolve => setTimeout(resolve, 1500)); kept.exportPngAfter = await focusName();
  await go('?version=v3&l=en&fresh=focusclear#explore=map&l=en');
  await page.type('.v3-search input', 'zzz'); kept.clearCounty = await pressOn('.v3-empty button', 1);
  await go('?version=v3&l=en&fresh=focusclearmuni#explore=municipalities&l=en'); await page.waitForFunction(() => document.querySelectorAll('[data-municipality]').length === 556);
  await page.type('.v3-municipal-search input', 'zzz'); kept.clearMunicipal = await pressOn('.v3-municipal-results .v3-empty button', 1);
  await go('?version=v3&l=en&fresh=focusclearpop#explore=population&panel=countries&l=en');
  await page.type('.v3-pop-search input', 'zzz'); kept.clearCountries = await pressOn('.v3-pop-empty button', 1);
  await downloadSession.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: output });
  check('keyboard focus stays on a control that disables itself, or moves to the field a clear button served', JSON.stringify(kept) === JSON.stringify({ zoomInAtMax: 'Zoom in', zoomOutAtMin: 'Zoom out', matrixEnlarge: 'Enlarge matrix', matrixReset: 'Reset size', exportPng: 'Export PNG', exportPngAfter: 'Export PNG', clearCounty: 'Find a county', clearMunicipal: 'Find a city or municipality', clearCountries: 'Find a country' }));
  const retryPage = await browser.newPage();
  await retryPage.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  await retryPage.setRequestInterception(true);
  let failGeometry = true;
  retryPage.on('request', request => { if (failGeometry && /geo_jls/.test(request.url())) request.abort('failed'); else request.continue(); });
  await retryPage.goto(origin + '/?version=v3&l=en&fresh=focusretry#explore=municipalities&l=en', { waitUntil: 'networkidle0' });
  await retryPage.waitForSelector('.v3-geo-loading button');
  failGeometry = false;
  await retryPage.focus('.v3-geo-loading button'); await retryPage.keyboard.press('Enter');
  await retryPage.waitForFunction(() => document.querySelectorAll('[data-municipality]').length === 556);
  check('a successful geometry retry leaves focus on the view, not the page body', await retryPage.evaluate(() => document.activeElement !== document.body));
  await retryPage.close();
  // The figure snapshot copied computed fills in the middle of the 0.35 s fill transition when exported right after a year
  // change, a theme toggle or during playback: 20 of 21 counties matched neither year nor legend.
  await go('?version=v3&l=en&fresh=midtransition#explore=map&year=2024&l=en');
  for (const f of fs.readdirSync(output).filter(f => f.endsWith('.svg'))) fs.unlinkSync(path.join(output, f));
  await page.select('#v3-year', '5'); await new Promise(resolve => setTimeout(resolve, 40));
  await page.click('[aria-label="Export SVG"]');
  let figureFile; for (let i = 0; i < 60 && !figureFile; i++) { await new Promise(resolve => setTimeout(resolve, 100)); figureFile = fs.readdirSync(output).find(f => f.endsWith('.svg')); }
  await new Promise(resolve => setTimeout(resolve, 700));
  const settledFills = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-county]')].map(p => [p.dataset.county, getComputedStyle(p).fill.replace(/\s/g, '')])));
  const exportedFills = Object.fromEntries([...fs.readFileSync(path.join(output, figureFile), 'utf8').matchAll(/<path[^>]*data-county="(HR-\d\d)"[^>]*>/g)].map(m => [m[1], ((/style="([^"]*)"/.exec(m[0]) || [])[1] || '').match(/fill:\s*([^;]+)/)?.[1].replace(/\s/g, '')]));
  check('a figure exported during a colour transition carries the settled colours', Object.keys(exportedFills).length === 21 && Object.keys(settledFills).every(iso => exportedFills[iso] === settledFills[iso]));
  // v3 figures draw every string in IBM Plex Sans, yet embedded v2's Mono and Oswald too (~132 KB of unused faces) and
  // refused to export when those failed, with a toast blaming the map; a Sans failure was misreported the same way.
  const figureSvg = fs.readFileSync(path.join(output, figureFile), 'utf8');
  check('a v3 figure embeds only the Sans faces it draws with, and its font notice names only those', JSON.stringify([...figureSvg.matchAll(/@font-face\{font-family:'([^']+)'/g)].map(m => m[1])) === '["IBM Plex Sans","IBM Plex Sans"]' && /IBM Corp/.test(figureSvg) && !/Oswald/.test(figureSvg));
  const fontPage = await browser.newPage();
  await fontPage.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  await (await fontPage.createCDPSession()).send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: output });
  await fontPage.setRequestInterception(true);
  let missingFonts = null;
  fontPage.on('request', request => { if (missingFonts && missingFonts.test(request.url())) request.respond({ status: 404, body: 'gone' }); else request.continue(); });
  const exportWithout = async fonts => {
    missingFonts = fonts;
    for (const f of fs.readdirSync(output).filter(f => f.endsWith('.svg'))) fs.unlinkSync(path.join(output, f));
    await fontPage.goto(origin + `/?version=v3&l=en&fresh=font${Math.random().toString(36).slice(2, 8)}#explore=map&year=2024&l=en`, { waitUntil: 'networkidle0' });
    await fontPage.click('[aria-label="Export SVG"]');
    await fontPage.waitForFunction(() => !!document.querySelector('.v3-toast').textContent);
    const toast = await fontPage.$eval('.v3-toast', el => el.textContent);
    let saved = false;
    for (let i = 0; i < 60 && !saved && toast === 'Figure exported.'; i++) { await new Promise(resolve => setTimeout(resolve, 100)); saved = fs.readdirSync(output).some(f => f.endsWith('.svg')); }
    return { saved, toast };
  };
  const withoutV2Fonts = await exportWithout(/ibm-plex-mono|oswald/), withoutSans = await exportWithout(/ibm-plex-sans/);
  await fontPage.close();
  await downloadSession.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: output });
  check('a v3 figure exports without the v2 fonts, and a missing Sans face is reported as a font failure', withoutV2Fonts.saved && !withoutSans.saved && /^Export fonts are unavailable/.test(withoutSans.toast));
  // Export names left out unit, direction, hub, threshold and language, so different exports collided (the people and %
  // maps of 2025 both saved as atlas-2025-tot.csv), and cumulative names carried an en dash.
  const savedName = async (hash, selector) => {
    const before = new Set(fs.readdirSync(output));
    await go(`?version=v3&fresh=name${Math.random().toString(36).slice(2, 8)}#${hash}`);
    await page.click(selector);
    for (let i = 0; i < 60; i++) { await new Promise(resolve => setTimeout(resolve, 100)); const f = fs.readdirSync(output).find(n => !before.has(n) && !n.endsWith('.crdownload')); if (f) return f; }
    return null;
  };
  for (const f of fs.readdirSync(output).filter(f => /^atlas-/.test(f))) fs.unlinkSync(path.join(output, f));
  const exportNames = {
    peopleCsv: await savedName('explore=map&year=2025&metric=tot&l=en', '.v3-export'), percentCsv: await savedName('explore=map&year=2025&metric=tot&unit=pct&l=en', '.v3-export'),
    zagrebFlows: await savedName('explore=flows&year=2018&county=HR-21&l=en', '.v3-export'), osijekFlows: await savedName('explore=flows&year=2018&county=HR-14&l=en', '.v3-export'),
    hrFigure: await savedName('explore=map&year=2025&metric=ext&l=hr', '.v3-export-actions button:nth-child(2)'), enFigure: await savedName('explore=map&year=2025&metric=ext&l=en', '.v3-export-actions button:nth-child(2)'),
    cumulative: await savedName('explore=map&year=2024&metric=tot&sum=1&l=en', '.v3-export'),
  };
  check('exports that differ in unit, hub or language get different file names', [['peopleCsv', 'percentCsv'], ['zagrebFlows', 'osijekFlows'], ['hrFigure', 'enFigure']].every(([a, b]) => exportNames[a] && exportNames[b] && exportNames[a] !== exportNames[b]));
  check('export file names are plain ASCII', Object.values(exportNames).every(n => n && /^[\x21-\x7e]+$/.test(n)));
  // A Croatian UI filled the English-headed CSV with Croatian cells ("% tek. procjene", "gubitnice", "izmjereno", region
  // names), the Metric column held internal codes ("tot", "all") and the loss threshold dropped the sign the screen shows.
  const csvIn = async hash => { const name = await savedName(hash, '.v3-export'); return name ? fs.readFileSync(path.join(output, name), 'utf8') : null; };
  const csvPairs = [];
  for (const f of fs.readdirSync(output).filter(f => /^atlas-/.test(f))) fs.unlinkSync(path.join(output, f));
  for (const hash of ['explore=map&year=2020&metric=all&unit=estimate', 'explore=trends&metric=tot&unit=estimate', 'explore=classify&year=2024', 'explore=flows&year=2018', 'explore=regions&year=2024&metric=int', 'explore=matrix&year=2011']) csvPairs.push([await csvIn(hash + '&l=hr'), await csvIn(hash + '&l=en')]);
  check('a CSV reads the same whichever language the UI is in', csvPairs.every(([hr, en]) => hr && hr === en));
  check('the CSV names its metric and signs the loss threshold as the screen does', csvPairs[0][1].includes(',"migration + natural change",') && csvPairs[2][1].trim().split('\r\n').slice(1).every(line => line.includes(',"-4500",')));
  // The exported classification legend printed the threshold raw ("−4500", Croatian "−1.5%") instead of as the screen's
  // threshold readout does ("−4.500", "−1,5 % popisa 2011.").
  const legendOf = async (query, lang) => {
    for (const f of fs.readdirSync(output).filter(f => /^atlas-/.test(f))) fs.unlinkSync(path.join(output, f));
    const name = await savedName(`explore=classify&year=2024${query}&l=${lang}`, '.v3-export-actions button:nth-child(2)');
    const screen = await page.$eval('.v3-threshold output', el => el.textContent);
    const desc = name ? (fs.readFileSync(path.join(output, name), 'utf8').match(/<desc>([^<]*)<\/desc>/) || [])[1] || '' : '';
    return { screen, legend: (desc.split('\n')[1] || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') };
  };
  const legends = [await legendOf('', 'hr'), await legendOf('', 'en'), await legendOf('&thresholdUnit=pct', 'hr'), await legendOf('&thresholdUnit=pct', 'en')];
  check('the exported classification legend states the threshold as the screen does', legends.every(({ screen, legend }) => legend.includes(`: ${screen} … 0 · `) && legend.endsWith(`: < ${screen}`)));
  // The net matrix figure was subtitled "Net gain for selected county", but each cell is the row county's net gain.
  const matrixSubtitle = async lang => {
    for (const f of fs.readdirSync(output).filter(f => /^atlas-/.test(f))) fs.unlinkSync(path.join(output, f));
    const name = await savedName(`explore=matrix&year=2018&dir=net&l=${lang}`, '.v3-export-actions button:nth-child(2)');
    return name ? ((fs.readFileSync(path.join(output, name), 'utf8').match(/<desc>([^<]*)<\/desc>/) || [])[1] || '').split('\n')[0] : '';
  };
  check('the net matrix figure names the row, not a selected county', /^Saldo retka · /.test(await matrixSubtitle('hr')) && /^Net gain for the row · /.test(await matrixSubtitle('en')));
  // Matrix cell labels printed "2.0k" in Croatian (where "." groups thousands) and a hyphen-minus in both languages.
  for (const [lang, pattern] of [['hr', '^−?(\\d{1,3}(,\\d)?k|\\d{1,3})$'], ['en', '^−?(\\d{1,3}(\\.\\d)?k|\\d{1,3})$']]) {
    await go(`?version=v3&l=${lang}&fresh=mx${lang}#explore=matrix&year=2024&sum=1&dir=net&l=${lang}`);
    check(`${lang} matrix cell labels use the locale decimal and the typographic minus`, await page.$$eval('[data-matrix-cell] span', (els, source) => els.length === 420 && els.every(e => new RegExp(source).test(e.textContent)) && els.some(e => e.textContent.endsWith('k')), pattern));
  }

  await go();
  await click('.v3-tabs button:nth-child(2)');
  check('historical grid contains 21 × 28 annual observations', await page.$$eval('[data-grid-cell]', els => els.length === 588));
  check('trends support both annual and cumulative observations', await page.$eval('.v3-time-mode button:nth-child(2)', el => !el.disabled));
  check('interactive chart exposes its year controls', await page.$eval('.v3-trend-chart', el => el.getAttribute('role') === 'group'));
  const yearsCSV = await downloadCSV('atlas-v3-trends-tot-abs-en-1998-2025.csv');
  check('historical CSV contains every displayed county/year observation', yearsCSV.trim().split('\r\n').length === 589 && yearsCSV.includes('"HR-21","Grad Zagreb","2025","2025","net migration","people","2397"'));
  const secondCounty = await page.$eval('[data-grid-cell="28"]', el => el.getAttribute('aria-label').split(' · ')[0]);
  await page.focus('[data-grid-cell="0"]'); await page.keyboard.press('ArrowDown');
  check('heatmap uses arrow-key navigation', await page.evaluate(() => document.activeElement?.getAttribute('data-grid-cell') === '28'));
  await page.keyboard.press('Enter');
  check('heatmap selection changes county and year together', await page.evaluate(name => document.querySelector('.v3-intro h1').textContent === name && location.hash.includes('year=1998'), secondCounty));
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
  const csv = path.join(output, 'atlas-v3-flows-out-HR-21-en-2018.csv');
  if (fs.existsSync(csv)) fs.unlinkSync(csv);
  await click('.v3-export');
  for (let i = 0; i < 40 && !fs.existsSync(csv); i++) await new Promise(resolve => setTimeout(resolve, 100));
  const exported = fs.readFileSync(csv, 'utf8');
  check('flow CSV carries actual corridor counts and measured provenance', exported.includes('"Selected county ISO"') && exported.includes('2018') && exported.includes('CC BY 4.0') && exported.includes(`"HR-21","Grad Zagreb","HR-01","Zagrebačka","2018","2018","out","${linkValue}"`));
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
  // Inspect links before clicking: a // path must never become a host name.
  for (const route of ['/', '/atlas/en/saldo', '//outside.invalid/atlas/']) {
    await page.goto(origin + route + '?version=v3&l=en' + v3Hash, { waitUntil: 'networkidle0' });
    for (const next of ['v2', 'v3']) {
      check(`version links stay on-origin at ${route} before switching to ${next}`, await page.$$eval(
        '.atlas-version-switch a,.v3-footer-links a[href*="version=v2"]',
        (links, pathname) => links.length >= 2 && links.every(a => {
          const u = new URL(a.href);
          return u.origin === location.origin && u.pathname === pathname && u.searchParams.get('l') === 'en';
        }), route));
      await navClick(`.atlas-version-switch a[href*="version=${next}"]`);
      check(`switching to ${next} preserves ${route} and its saved analysis`, await page.evaluate(
        (want, pathname, host, hash) => document.documentElement.dataset.atlasVersion === want
          && location.origin === host && location.pathname === pathname && location.hash === hash,
        next, route, origin, next === 'v2' ? v2Hash : v3Hash));
    }
  }
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
