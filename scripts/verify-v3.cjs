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

  // đ has no accent to strip: typed as "d" or "dj", Međimurska and Đakovo were not found.
  const foldedD = [];
  for (const query of ['medimurska', 'medjimurska']) { await go(`?version=v3&l=en&fresh=fold${query}`); await page.type('.v3-search input', query); foldedD.push((await text('.v3-rank-list')).includes('Međimurska')); }
  for (const query of ['dakovo', 'djakovo']) { await go(`?version=v3&fresh=fold${query}#explore=municipalities&l=hr`); await page.waitForSelector('.v3-municipal-results > button'); await page.type('.v3-municipal-search input', query); await new Promise(resolve => setTimeout(resolve, 200)); foldedD.push((await text('.v3-municipal-results')).includes('Đakovo')); }
  check('searches find đ typed as d or dj', foldedD.every(Boolean));
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
  check('a region picked from its card does not follow the reader to the map as a county', regionTitle === cardName + ' region' && await page.evaluate(() => !new URLSearchParams(location.hash.slice(1)).has('county') && document.querySelector('.v3-intro h1').textContent === 'Croatia in motion.'));
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
  // Nalazi 2, 6, 7 and 8 said counties, regions and cities "grow" on a balance of registered moves, which the atlas's own
  // estimates contradict (all 21 counties below their 2011 census in 2024); Nalaz 7's "Cities lose" contradicted its caption.
  const growthClaims = [];
  for (const lang of ['hr', 'en']) for (const story of [1, 5, 6, 7]) {
    await go(`?version=v3&fresh=growth${story}${lang}#explore=map&l=${lang}`);
    await page.select('[aria-label="Vođeni nalazi"], [aria-label="Guided findings"]', String(story));
    await page.waitForSelector('.v3-finding p', { timeout: 15000 });
    const shown = await page.evaluate(() => document.querySelector('[aria-label="Vođeni nalazi"], [aria-label="Guided findings"]').selectedOptions[0].textContent + ' | ' + document.querySelector('.v3-finding p').textContent);
    if (lang === 'hr' ? /\b(raste|rastu|rasta|rast)\b/i.test(shown) : /\b(grow|grows|growth)\b|Cities lose/i.test(shown)) growthClaims.push(shown);
  }
  check('guided findings describe a balance of moves as a gain, never as growth', growthClaims.length === 0);
  // Nalaz 5 sent the reader to "the legend", which v3 lacks (its study-comparison block names the counties that differ),
  // and addressed them informally ("Pomakni prag i prati legendu").
  const nalaz5 = {};
  for (const lang of ['hr', 'en']) {
    await go(`?version=v3&fresh=nalaz5${lang}#explore=map&l=${lang}`);
    await page.select('[aria-label="Vođeni nalazi"], [aria-label="Guided findings"]', '4');
    await page.waitForSelector('.v3-finding p', { timeout: 15000 });
    nalaz5[lang] = await page.evaluate(() => ({ caption: document.querySelector('.v3-finding p').textContent, comparison: !!document.querySelector('.v3-study-comparison') }));
  }
  // Nalaz 4 ended "departures rise", which reads as all departures; those fell in 2025, and the rise is Asian citizens'.
  const nalaz4 = {};
  for (const lang of ['hr', 'en']) {
    await go(`?version=v3&fresh=nalaz4${lang}#explore=map&l=${lang}`);
    await page.select('[aria-label="Vođeni nalazi"], [aria-label="Guided findings"]', '3');
    await page.waitForSelector('.v3-finding p', { timeout: 15000 });
    nalaz4[lang] = await page.$eval('.v3-finding p', el => el.textContent);
  }
  // Nalaz 9 was titled "Relativno gleda drukčije" (not Croatian), and Nalaz 7 said "selidbe" where the atlas says "preseljenja".
  const hrWording = {};
  for (const story of [6, 8]) {
    await go(`?version=v3&fresh=hrword${story}#explore=map&l=hr`);
    await page.select('[aria-label="Vođeni nalazi"]', String(story));
    await page.waitForSelector('.v3-finding p', { timeout: 15000 });
    hrWording[story + 1] = await page.evaluate(() => document.querySelector('[aria-label="Vođeni nalazi"]').selectedOptions[0].textContent + ' | ' + document.querySelector('.v3-finding p').textContent);
  }
  check('findings use idiomatic Croatian and the atlas word for moves', !/Relativno gleda\b/.test(hrWording[9]) && !/selidb/.test(hrWording[7]) && /preseljenja/.test(hrWording[7]));
  // Croatian agrees a noun with its numeral (1 singular, 2–4 paucal, else genitive plural): the class key printed
  // "9 pobjednice / 1 neutralne / 11 gubitnice", and one county's readout and the study comparison used the plural.
  const klasForms = { gain: ['pobjednica', 'pobjednice', 'pobjednica'], neu: ['neutralna', 'neutralne', 'neutralnih'], loss: ['gubitnica', 'gubitnice', 'gubitnica'] };
  const klasForm = (k, n) => klasForms[k][n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 1 : 2];
  let klasAgrees = true;
  for (const q of ['threshold=500', 'threshold=4500', 'threshold=15000', 'thresholdUnit=pct&thresholdPct=0.5', 'thresholdUnit=pct&thresholdPct=5']) {
    await go(`?version=v3&fresh=klas${q.replace(/\W/g, '')}#explore=classify&year=2024&${q}&l=hr`);
    const key = await page.evaluate(() => [...document.querySelectorAll('.v3-class-key > div')].map(d => [Number(d.querySelector('strong').textContent), d.querySelector('span').textContent]));
    klasAgrees = klasAgrees && key.length === 3 && key.every(([n, label], i) => label === klasForm(['gain', 'neu', 'loss'][i], n));
  }
  check('the Croatian class key agrees each class with its count', klasAgrees);
  await go('?version=v3&fresh=klasone#explore=classify&year=2024&l=hr');
  const klasOne = await page.evaluate(() => ({ readouts: [...new Set([...document.querySelectorAll('[data-county]')].map(p => p.getAttribute('aria-label').split(' · ')[1]))], comparison: [...document.querySelectorAll('.v3-study-comparison p')].slice(1).map(p => p.textContent) }));
  check('one county is named with a singular class', klasOne.readouts.length === 3 && klasOne.readouts.every(c => ['pobjednica', 'neutralna', 'gubitnica'].includes(c)) && klasOne.comparison.length > 0 && klasOne.comparison.every(line => /: (pobjednica|neutralna|gubitnica) → (pobjednica|neutralna|gubitnica) \(/.test(line)));
  check('Nalaz 4 says whose departures rise', /odseljavanje azijskih državljana raste/.test(nalaz4.hr) && /departures of Asian citizens rise/.test(nalaz4.en));
  check('Nalaz 5 points formally at the comparison block v3 shows, not a legend', Object.values(nalaz5).every(({ caption, comparison }) => comparison && /usporedb|comparison/i.test(caption) && !/legend/i.test(caption)) && !/\b(Pomakni|prati)\b/.test(nalaz5.hr.caption));
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
  // With no timeout, a geometry request that is never answered (a captive portal, a wedged proxy) kept the view on
  // "Loading LAU geometry…" with no Retry for the rest of the session.
  const hangPage = await browser.newPage();
  await hangPage.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  await hangPage.setRequestInterception(true);
  let stallGeometry = true;
  hangPage.on('request', request => { if (stallGeometry && /geo_jls/.test(request.url())) return; request.continue(); });
  await hangPage.goto(origin + '/?version=v3&l=en&fresh=geohang#explore=municipalities&l=en', { waitUntil: 'domcontentloaded' });
  const gaveUp = await hangPage.waitForSelector('.v3-geo-loading button', { timeout: 20000 }).then(() => true, () => false);
  stallGeometry = false;
  if (gaveUp) { await hangPage.click('.v3-geo-loading button'); await hangPage.waitForFunction(() => document.querySelectorAll('[data-municipality]').length === 556, { timeout: 20000 }).catch(() => {}); }
  check('an unanswered geometry request gives up into Retry, and Retry loads it', gaveUp && await hangPage.$$eval('[data-municipality]', els => els.length === 556));
  await hangPage.close();
  // The render-failure screen borrowed v2's tokens with light fallbacks over v3's dark --bg: a 1.22:1 title in dark.
  const failContrast = [];
  for (const theme of ['dark', 'light']) {
    const failPage = await browser.newPage();
    await failPage.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
    await failPage.goto(origin + '/?version=v3&fresh=failtheme#explore=map&l=hr', { waitUntil: 'networkidle0' });
    await failPage.evaluate(t => localStorage.setItem('atlas-v3-theme', t), theme);
    await failPage.goto(origin + `/?version=v3&fresh=fail${theme}#explore=map&year=2024&l=hr`, { waitUntil: 'networkidle0' });
    await failPage.evaluate(() => { Object.defineProperty(Intl.NumberFormat.prototype, 'format', { get() { throw new TypeError('verify: forced render failure'); }, configurable: true }); });
    await failPage.select('#v3-year', '20'); await new Promise(resolve => setTimeout(resolve, 800));
    failContrast.push(...await failPage.evaluate(() => {
      const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => [r, g, b].map(v => v / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
      const box = document.querySelector('.boot[role="alert"]'); if (!box) return [0];
      const bg = rgb(getComputedStyle(box).backgroundColor);
      return ['.boot-title', '.boot-fail', '.boot-fail a'].map(sel => ratio(rgb(getComputedStyle(box.querySelector(sel)).color), bg));
    }));
    await failPage.close();
  }
  check('the render-failure screen is readable in both themes', failContrast.length === 6 && failContrast.every(r => r >= 4.5));
  // Auto Dark Mode darkens pages that do not opt out, and "color-scheme: light" does not: the chosen light theme computed
  // rgb(243,246,247) for its background but painted rgb(32,35,35).
  const forceDark = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--lang=en-GB', '--enable-features=WebContentsForceDark'] });
  try {
    const darkPage = await forceDark.newPage();
    await darkPage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await darkPage.goto(origin + '/?version=v3&fresh=forcedark#explore=map&l=hr', { waitUntil: 'networkidle0' });
    await darkPage.evaluate(() => localStorage.setItem('atlas-v3-theme', 'light'));
    await darkPage.goto(origin + '/?version=v3&fresh=forcedarklight#explore=map&year=2024&l=hr', { waitUntil: 'networkidle0' });
    const shot = await darkPage.screenshot({ encoding: 'base64', clip: { x: 2, y: 400, width: 4, height: 4 } });
    const painted = await darkPage.evaluate(async shot => { const img = new Image(); img.src = 'data:image/png;base64,' + shot; await img.decode(); const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0); return [...ctx.getImageData(1, 1, 1, 1).data].slice(0, 3); }, shot);
    check('under Auto Dark Mode the chosen light theme still paints light', painted.every(v => v > 200));
  } finally { await forceDark.close(); }
  // v3 stored the theme on every load, so a first visit stored dark. It stays dark by default whatever the OS scheme, and
  // only the reader's choice is stored.
  const osThemes = [];
  for (const value of ['light', 'dark']) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value }]);
    await page.evaluate(() => localStorage.removeItem('atlas-v3-theme'));
    await go(`?version=v3&fresh=os${value}#explore=map&year=2024&l=en`);
    osThemes.push(await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('atlas-v3-theme')]));
  }
  await click('[aria-label="Light theme"]');
  await go('?version=v3&fresh=oschosen#explore=map&year=2024&l=en');
  osThemes.push(await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('atlas-v3-theme')]));
  await page.emulateMediaFeatures([]); await page.evaluate(() => localStorage.removeItem('atlas-v3-theme'));
  check('v3 opens dark whatever the OS scheme, and only a chosen theme is stored', JSON.stringify(osThemes) === '[["dark",null],["dark",null],["light","light"]]');
  // Printed, the capped lists and tables kept their caps: the ranking lost 12 of its 21 counties past the page edge. An A4
  // page at 96 dpi is 794 px wide, narrower than any desktop layout.
  const printedHidden = [], printPage = await browser.newPage();
  await printPage.setViewport({ width: 794, height: 900, deviceScaleFactor: 1 }); await printPage.emulateMediaType('print');
  for (const [hash, selector] of [['explore=map&year=2024', '.v3-county-panel .v3-rank-list'], ['explore=trends&year=2025&metric=tot', '.v3-years-scroll'], ['explore=matrix&year=2018', '.v3-matrix-scroll'], ['explore=flows&year=2018&county=HR-21&pair=HR-01', '.v3-pair .v3-table-scroll'], ['explore=classify&year=2024', '.v3-analysis-list']]) {
    await printPage.goto(origin + `/?version=v3&fresh=print${selector.length}#${hash}&l=hr`, { waitUntil: 'networkidle0' }); await printPage.waitForSelector(selector);
    printedHidden.push(await printPage.$eval(selector, el => el.scrollHeight - el.clientHeight));
  }
  await printPage.close();
  check('printed, every ranking, table and list shows all its rows', printedHidden.every(px => px <= 1));
  // The figure snapshot copied computed fills in the middle of the 0.35 s fill transition when exported right after a year
  // change, a theme toggle or during playback: 20 of 21 counties matched neither year nor legend.
  await go('?version=v3&l=en&fresh=midtransition#explore=map&year=2024&l=en');
  // Each export gets a folder of its own: a deleted file Chrome or a scanner still holds stays listed but unreadable.
  const exportTo = async () => { const dir = fs.mkdtempSync(path.join(output, 'export-')); await downloadSession.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir }); return dir; };
  const exportedSvg = async dir => { let file; for (let i = 0; i < 200 && !file; i++) { await new Promise(resolve => setTimeout(resolve, 100)); file = fs.readdirSync(dir).find(f => f.endsWith('.svg')); } await new Promise(resolve => setTimeout(resolve, 700)); await downloadSession.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: output }); return file ? fs.readFileSync(path.join(dir, file), 'utf8') : ''; };
  await page.select('#v3-year', '5'); await new Promise(resolve => setTimeout(resolve, 40));
  const transitionDir = await exportTo();
  await page.click('[aria-label="Export SVG"]');
  const transitionSvg = await exportedSvg(transitionDir);
  const settledFills = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-county]')].map(p => [p.dataset.county, getComputedStyle(p).fill.replace(/\s/g, '')])));
  const exportedFills = Object.fromEntries([...transitionSvg.matchAll(/<path[^>]*data-county="(HR-\d\d)"[^>]*>/g)].map(m => [m[1], ((/style="([^"]*)"/.exec(m[0]) || [])[1] || '').match(/fill:\s*([^;]+)/)?.[1].replace(/\s/g, '')]));
  check('a figure exported during a colour transition carries the settled colours', Object.keys(exportedFills).length === 21 && Object.keys(settledFills).every(iso => exportedFills[iso] === settledFills[iso]));
  // The municipal colour domain was its largest value: Grad Zagreb's 9.606 arrivals against a median of 41 left 90–96 % of
  // places within a shade of neutral. Its key, on screen and in the exported figure, marks the clamped ends.
  const municipalSpread = [];
  for (const dir of ['in', 'out', 'net']) {
    await go(`?version=v3&fresh=munidom${dir}#explore=municipalities&dir=${dir}&l=en`); await page.waitForSelector('[data-municipality]');
    municipalSpread.push(await page.evaluate(() => { const rgb = s => s.match(/\d+/g).slice(0, 3).map(Number), neutral = [41, 60, 72]; const far = [...document.querySelectorAll('[data-municipality]')].map(p => Math.hypot(...rgb(getComputedStyle(p).fill).map((v, i) => v - neutral[i]))); return far.filter(d => d < 30).length / far.length; }));
  }
  const municipalKey = await page.$$eval('[data-analysis="municipalities"] .v3-legend > span', spans => spans.map(s => s.textContent));
  const municipalDir = await exportTo();
  await page.click('[aria-label="Export SVG"]');
  const figureLegend = /Coral: ≤ −[\d,]+ · grey: 0 · teal: ≥ \+[\d,]+/.test(await exportedSvg(municipalDir));
  check('the municipal map spreads its colours, and its key marks the clamped ends on screen and in the figure', municipalSpread.every(share => share <= .6) && municipalKey[0].startsWith('≤') && municipalKey[1].startsWith('≥') && figureLegend);
  // v3 figures draw every string in IBM Plex Sans, yet embedded v2's Mono and Oswald too (~132 KB of unused faces) and
  // refused to export when those failed, with a toast blaming the map; a Sans failure was misreported the same way.
  const figureSvg = transitionSvg;
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
    for (let i = 0; i < 200 && !saved && toast === 'Figure exported.'; i++) { await new Promise(resolve => setTimeout(resolve, 100)); saved = fs.readdirSync(output).some(f => f.endsWith('.svg')); }
    return { saved, toast };
  };
  const withoutV2Fonts = await exportWithout(/ibm-plex-mono|oswald/), withoutSans = await exportWithout(/ibm-plex-sans/);
  // A failure looked like a success (the tick, the accent colour) and went after 3.5 s, before it could be read (WCAG 2.2.1).
  await new Promise(resolve => setTimeout(resolve, 4000));
  const failure = await fontPage.evaluate(() => { const t = document.querySelector('.v3-toast'), probe = document.createElement('i'); probe.style.color = 'var(--coral)'; document.body.append(probe); const coral = getComputedStyle(probe).color; probe.remove(); return [t.textContent !== '', getComputedStyle(t).borderTopColor === coral, ![...t.querySelectorAll('svg path')].some(p => p.getAttribute('d') === 'm5 12 4 4L19 6')]; });
  await fontPage.click('.v3-toast button'); failure.push(await fontPage.$eval('.v3-toast', el => el.textContent === ''));
  check('an export failure is marked as an error and stays until dismissed', JSON.stringify(failure) === '[true,true,true,true]');
  // Its close button removes itself, and focus fell to <body>: it goes back to the control that started the export.
  await (await fontPage.createCDPSession()).send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await fontPage.focus('[aria-label="Export SVG"]'); await fontPage.keyboard.press('Enter');
  await fontPage.waitForSelector('.v3-toast.is-error button', { timeout: 20000 });
  await fontPage.focus('.v3-toast button'); await fontPage.keyboard.press('Enter'); await new Promise(resolve => setTimeout(resolve, 300));
  check('dismissing the error notice hands focus back to the export button', await fontPage.evaluate(() => document.querySelector('.v3-toast').textContent === '' && document.activeElement.getAttribute('aria-label') === 'Export SVG'));
  await fontPage.close();
  await downloadSession.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: output });
  check('a v3 figure exports without the v2 fonts, and a missing Sans face is reported as a font failure', withoutV2Fonts.saved && !withoutSans.saved && /^Export fonts are unavailable/.test(withoutSans.toast));
  // Export names left out unit, direction, hub, threshold and language, so different exports collided (the people and %
  // maps of 2025 both saved as atlas-2025-tot.csv), and cumulative names carried an en dash.
  const savedName = async (hash, selector) => {
    const before = new Set(fs.readdirSync(output));
    await go(`?version=v3&fresh=name${Math.random().toString(36).slice(2, 8)}#${hash}`);
    await page.click(selector);
    for (let i = 0; i < 200; i++) { await new Promise(resolve => setTimeout(resolve, 100)); const f = fs.readdirSync(output).find(n => !before.has(n) && !n.endsWith('.crdownload')); if (f) return f; }
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
  // "Before 2007, arrivals and departures do not fully balance" was appended to every tot/int/all figure whatever its
  // window, printed under a cumulative trends grid whose columns start at 2011, and twice on an annual pre-2007 trends view.
  const preNoted = async hash => {
    for (const f of fs.readdirSync(output).filter(f => /^atlas-/.test(f))) fs.unlinkSync(path.join(output, f));
    const name = await savedName(hash + '&l=en', '.v3-export-actions button:nth-child(2)');
    return name ? /Before 2007/.test((fs.readFileSync(path.join(output, name), 'utf8').match(/<desc>([^<]*)<\/desc>/) || [])[1] || '') : null;
  };
  const preNotes = async hash => { await go(`?version=v3&fresh=pre${Math.random().toString(36).slice(2, 8)}#${hash}&l=en`); return page.evaluate(() => [...document.querySelectorAll('.v3-data-note')].filter(p => /Before 2007/.test(p.textContent)).length); };
  const preFigures = [await preNoted('explore=map&year=2025&metric=tot'), await preNoted('explore=map&year=2005&metric=tot'), await preNoted('explore=classify&year=2024&sum=1'), await preNoted('explore=trends&metric=tot'), await preNoted('explore=trends&metric=tot&sum=1')];
  check('a figure carries the pre-2007 note only when it shows pre-2007 values', JSON.stringify(preFigures) === '[false,true,false,true,false]');
  const preScreens = [await preNotes('explore=trends&metric=tot&sum=1'), await preNotes('explore=trends&metric=tot&sum=1&county=HR-21'), await preNotes('explore=trends&metric=tot&year=2005'), await preNotes('explore=map&year=2005&metric=tot'), await preNotes('explore=map&year=2025&metric=tot')];
  check('the screen prints the pre-2007 note once, and only where pre-2007 values are shown', JSON.stringify(preScreens) === '[0,1,1,1,0]');
  // "Cumulative net change uses the population at the end of the period" was printed in annual mode on screen, and the
  // export's endpoint-estimate and table-cell notes rode on annual figures and on maps, which have no table cells.
  for (const f of fs.readdirSync(output).filter(f => /^atlas-/.test(f))) fs.unlinkSync(path.join(output, f));
  const denNotes = async hash => {
    const name = await savedName(hash + '&unit=estimate&l=en', '.v3-export-actions button:nth-child(2)');
    const screen = await page.evaluate(() => /Cumulative/.test(document.querySelector('.v3-den-note')?.textContent ?? ''));
    const desc = name ? (fs.readFileSync(path.join(output, name), 'utf8').match(/<desc>([^<]*)<\/desc>/) || [])[1] || '' : '';
    return [screen, /Cumulative net change/.test(desc), /table cell/.test(desc)].map(Number).join('');
  };
  // The trend chart drew "2011 · methodology change" on every series; DZS limits that change to migration to and from abroad.
  const methodMarks = [];
  for (const hash of ['metric=tot', 'metric=nat', 'metric=int&county=HR-21', 'metric=nat&county=HR-21', 'metric=tot&county=HR-21']) {
    await go(`?version=v3&fresh=method${methodMarks.length}#explore=trends&${hash}&l=en`);
    methodMarks.push(await page.evaluate(() => !!document.querySelector('.v3-trend-chart .v3-method-line')));
  }
  check('the 2011 methodology marker is drawn only on series with external migration', JSON.stringify(methodMarks) === '[true,false,false,false,true]');
  // The tab title never named the view and carried the tagline's full stop, so every view's tab and bookmark read the same;
  // the year span was set with an em dash (1998—2025).
  const tabTitles = [];
  for (const hash of ['explore=map&year=2025&l=en', 'explore=trends&year=2025&l=hr', 'explore=flows&year=2018&l=en', 'explore=map&year=2025&county=HR-18&l=hr']) { await go(`?version=v3&fresh=title${tabTitles.length}#${hash}`); tabTitles.push(await page.title()); }
  check('the tab title names the view and its subject, without the tagline', JSON.stringify(tabTitles) === JSON.stringify(['Migration atlas · Map · Croatia · 2025', 'Migracijski atlas · Trendovi · Hrvatska · 2025', 'Migration atlas · Flows · City of Zagreb · 2018', 'Migracijski atlas · Karta · Istarska · 2025']));
  // The JSON-LD declared the whole atlas dataset CC BY 4.0, while LICENSE keeps the data under their sources' terms (§3)
  // and puts only exported figures under CC BY 4.0 (§5).
  const ld = await page.evaluate(() => JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent));
  check('the JSON-LD points the atlas licence at LICENSE, each source carrying its own', ld.license === 'https://github.com/ablaskovic/migracijski-atlas/blob/main/LICENSE' && ld.isBasedOn.filter(b => b.license).length === 3);
  // v3 set only the title: /?l=en kept the Croatian canonical, og:url and og:locale (a crawler read it as a duplicate of /)
  // and the Croatian description and card title.
  const headMeta = () => page.evaluate(() => ['link[rel="canonical"]', 'meta[property="og:url"]', 'meta[property="og:locale"]', 'meta[property="og:title"]', 'meta[name="description"]'].map(s => { const el = document.querySelector(s); return (el.href || el.content).slice(0, 36); }));
  await go('?version=v3&l=en&fresh=head#explore=map&year=2024'); const englishHead = await headMeta();
  await page.click('.v3-language button:not([aria-pressed="true"])'); await new Promise(resolve => setTimeout(resolve, 300)); const croatianHead = await headMeta();
  check('each language page names itself in the head: canonical, og:url, og:locale, card title and description', JSON.stringify([englishHead, croatianHead]) === JSON.stringify([['https://migracijski-atlas.hr/?l=en', 'https://migracijski-atlas.hr/?l=en', 'en_GB', 'County Migration Atlas (CROATIA) · 1', 'An interactive atlas of migration in'], ['https://migracijski-atlas.hr/', 'https://migracijski-atlas.hr/', 'hr_HR', 'Migracijski atlas županija · 1998.–2', 'Interaktivni atlas migracija hrvatsk']]));
  await go('?version=v3&fresh=dash#explore=trends&l=en');
  check('year spans use an en dash', (await page.evaluate(() => [document.querySelector('.v3-header-caption').textContent, document.querySelector('.v3-trends-view .v3-eyebrow').textContent])).every(t => t.includes('1998–2025') && !t.includes('—')));
  // The sidebar named two views differently from the view select ("Podjela"/"Classes", "Local map"), and its labels break
  // mid-word when they do not fit, which "Stanovništvo" already did at 1024 px.
  const nameReports = [];
  for (const [w, h] of [[1440, 900], [1024, 768]]) for (const lang of ['hr', 'en']) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await go(`?version=v3&fresh=names${w}${lang}#explore=map&l=${lang}`);
    nameReports.push(await page.evaluate(() => {
      const names = [...document.querySelectorAll('#v3-view-select option')].map(o => o.textContent), spans = [...document.querySelectorAll('.v3-sidebar > button span')];
      const line = parseFloat(getComputedStyle(spans[0]).lineHeight) || 13;
      return names.every((name, i) => spans[i].textContent === name && spans[i].getBoundingClientRect().height < line * 1.5);
    }));
  }
  await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  check('each view has one name, and the sidebar shows it on one line', nameReports.every(Boolean));
  // About said "since 2011 the methodology also covers temporary stays", unscoped and unsourced; DZS (7.4.2, fn. 1) says
  // only that migration to and from abroad is processed under a new methodology from 2011.
  const method2011 = [];
  for (const lang of ['hr', 'en']) { await go(`?version=v3&fresh=method2011${lang}#explore=map&l=${lang}`); method2011.push(await page.evaluate(() => [...document.querySelectorAll('dialog p')].map(p => p.textContent).find(t => /Od 2011\.|Since 2011/.test(t)) || '')); }
  check('About scopes the 2011 method change to migration abroad, as DZS does', /inozemstv/.test(method2011[0]) && !/privremeni boravak/.test(method2011[0]) && /abroad/.test(method2011[1]) && !/temporary stay/.test(method2011[1]));
  // --subtle text fell under 4.5:1 on the alternate surface in both themes and on the light page background (labels, year
  // ticks, the header caption, the language switch), and the classification note's study link differed by colour alone.
  await go('?version=v3&fresh=subtle#explore=classify&year=2024&l=en');
  const subtleWorst = await page.evaluate(() => {
    const lum = hex => { const h = hex.length === 4 ? '#' + hex.slice(1).replace(/./g, '$&$&') : hex; return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0); };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
    const root = document.documentElement, was = root.dataset.theme, worst = [];
    for (const theme of ['dark', 'light']) { root.dataset.theme = theme; const css = getComputedStyle(root), token = name => css.getPropertyValue(name).trim(); worst.push(Math.min(...['--bg', '--surface', '--surface-alt'].map(bg => ratio(token('--subtle'), token(bg))))); }
    root.dataset.theme = was;
    return worst;
  });
  check('--subtle text meets 4.5:1 on every surface in both themes', subtleWorst.length === 2 && subtleWorst.every(r => r >= 4.5));
  check('the study link in the classification note is underlined', await page.$eval('.v3-data-note a', a => getComputedStyle(a).textDecorationLine.includes('underline')));
  // Labels, legend numbers, the data badge and the footer were 8–10 px; they get 11 px where that fits, and a year track too
  // narrow for four 11 px ticks keeps its two ends.
  const tinyReports = [];
  for (const [w, h] of [[1440, 900], [768, 1024], [320, 568]]) for (const view of ['map', 'flows&year=2010', 'trends']) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
    await go(`?version=v3&fresh=tiny${w}${view.length}#explore=${view}&l=hr`);
    tinyReports.push(await page.evaluate(() => {
      const shown = [...document.querySelectorAll('.v3-explore-controls > label, .v3-year-input label, .v3-period > span, .v3-map-meta, .v3-panel-title > span:not(.v3-eyebrow), .v3-color-key span, .v3-legend > span, .v3-year-ticks span, .v3-data-badge, .v3-footer span, .v3-footer a, .v3-footer button')].filter(el => el.getClientRects().length && el.textContent.trim());
      const ticks = [...document.querySelectorAll('.v3-year-ticks span')].map(s => s.getBoundingClientRect()).filter(r => r.width);
      return shown.every(el => parseFloat(getComputedStyle(el).fontSize) >= 11) && ticks.length >= 2 && !ticks.some((r, i) => i && r.left < ticks[i - 1].right + 2) && document.documentElement.scrollWidth <= innerWidth;
    }));
  }
  await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  check('labels, legend numbers, badges and the footer are at least 11 px, without overflow or colliding ticks', tinyReports.every(Boolean));
  // A pressed toggle differed from its neighbours only by a 1.07–1.14:1 background and a 1.1–2.5:1 text colour; no cue
  // reached the 3:1 WCAG 1.4.11 asks of a state.
  const pressedCues = [];
  for (const theme of ['light', 'dark']) for (const [hash, groups] of Object.entries({ 'explore=map': ['.v3-metrics', '.v3-time-mode'], 'explore=flows&year=2018': ['.v3-segment'], 'explore=population&panel=age': ['.v3-pop-tabs', '.v3-pop-segment'], 'explore=classify&year=2024&county=HR-14': ['.v3-analysis-list'], 'explore=municipalities': ['.v3-municipal-results'] })) {
    await page.evaluate(t => localStorage.setItem('atlas-v3-theme', t), theme);
    await go(`?version=v3&fresh=pressed${theme}${hash.length}#${hash}&l=en`);
    // A municipal row is picked in the page, not the address.
    if (groups[0] === '.v3-municipal-results') { await page.waitForSelector('.v3-municipal-results button'); await page.click('.v3-municipal-results > button'); await page.mouse.move(0, 0); }
    pressedCues.push(...await page.evaluate(groups => {
      const rgb = s => (s.match(/rgba?\(([^)]+)\)/)?.[1] ?? '0,0,0,0').split(',').map(Number);
      const lum = ([r, g, b]) => [r, g, b].map(v => v / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
      const backdrop = el => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c[3] === undefined) c[3] = 1; if (c[3] > 0) layers.push(c); if (c[3] >= 1) break; } let out = [255, 255, 255]; for (const c of layers.reverse()) out = out.map((v, i) => v * (1 - c[3]) + c[i] * c[3]); return out; };
      const cue = el => { const m = getComputedStyle(el).boxShadow.match(/rgba?\([^)]+\)[^,]*inset/); return m ? rgb(m[0]) : null; };
      return groups.map(g => { const pressed = document.querySelector(`${g} [aria-pressed="true"]`), other = document.querySelector(`${g} button:not([aria-pressed="true"])`); return !!pressed && !!cue(pressed) && !(other && cue(other)) && ratio(cue(pressed), backdrop(pressed)) >= 3; });
    }, groups));
  }
  check('every pressed toggle carries a cue of at least 3:1, in both themes', pressedCues.length === 14 && pressedCues.every(Boolean));
  // In forced colours the heatmap went blank, bars, swatches, ramps and the slider track vanished, and every pressed or
  // current state became identical to the rest.
  const forced = await page.createCDPSession();
  // Chrome's forced palette follows the OS scheme (white Canvas on CI's light ubuntu host): pin the dark one these were written on.
  await forced.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }, { name: 'prefers-color-scheme', value: 'dark' }] });
  const inForced = async (hash, fn) => { await go(`?version=v3&fresh=fc${Math.random().toString(36).slice(2, 8)}#${hash}&l=en`); return page.evaluate(fn); };
  const forcedMarks = [
    await inForced('explore=trends&metric=tot', () => new Set([...document.querySelectorAll('[data-grid-cell]')].map(c => getComputedStyle(c).backgroundColor)).size > 5 && new Set([...document.querySelectorAll('.v3-mini-legend i')].map(i => getComputedStyle(i).backgroundColor)).size === 2),
    await inForced('explore=classify&year=2024', () => new Set([...document.querySelectorAll('.v3-class-key i')].map(i => getComputedStyle(i).backgroundColor)).size === 3),
    await inForced('explore=population&panel=citizenship', () => new Set([...document.querySelectorAll('.v3-pop-cit-stack i')].map(i => getComputedStyle(i).backgroundColor)).size >= 3),
    await inForced('explore=map&county=HR-18', () => {
      const marked = el => !!el && getComputedStyle(el).outlineStyle !== 'none' && parseFloat(getComputedStyle(el).outlineWidth) >= 2;
      const states = ['.v3-metrics', '.v3-time-mode', '.v3-language', '.v3-sidebar', '.v3-tabs'].every(g => marked(document.querySelector(`${g} [aria-pressed="true"], ${g} .is-active`)) && !marked(document.querySelector(`${g} button:not([aria-pressed="true"]):not(.is-active)`)));
      const dot = document.querySelector('.atlas-version-switch a[aria-current] .atlas-version-dot');
      return states && ['.v3-slider-wrap input', '.v3-color-key > div'].every(s => getComputedStyle(document.querySelector(s)).backgroundImage.includes('gradient')) && getComputedStyle(dot).backgroundColor !== getComputedStyle(document.body).backgroundColor;
    }),
  ];
  await forced.send('Emulation.setEmulatedMedia', { features: [] }); await forced.detach();
  check('forced colours keep the data marks and show every pressed or current state', forcedMarks.every(Boolean));
  // The map, years-grid and municipal readouts were live regions that follow hover and focus: a screen reader heard every
  // Tab and arrow press (11 announcements for 6 county Tabs), though the focused mark already names the same value.
  const focusing = await page.createCDPSession(); await focusing.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const watchLive = () => page.evaluate(() => {
    window.liveChanges = 0;
    const live = [...document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"], [role="log"], [role="alert"]')];
    const observer = new MutationObserver(records => { window.liveChanges += records.length; });
    for (const l of live) observer.observe(l, { childList: true, subtree: true, characterData: true });
  });
  const liveEchoes = [];
  await go('?version=v3&fresh=livemap#explore=map&year=2024&l=en'); await watchLive();
  await page.evaluate(() => document.querySelector('[data-county="HR-01"]').focus()); for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  liveEchoes.push(await page.evaluate(() => window.liveChanges));
  await go('?version=v3&fresh=livegrid#explore=trends&l=en'); await watchLive();
  await page.focus('[data-grid-cell="0"]'); for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) await page.keyboard.press(key);
  liveEchoes.push(await page.evaluate(() => window.liveChanges));
  await go('?version=v3&fresh=livemuni#explore=municipalities&l=en'); await page.waitForFunction(() => document.querySelectorAll('[data-municipality]').length === 556); await watchLive();
  await page.evaluate(() => document.querySelector('[data-municipality]').focus()); for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  liveEchoes.push(await page.evaluate(() => window.liveChanges));
  await focusing.send('Emulation.setFocusEmulationEnabled', { enabled: false }); await focusing.detach();
  check('hover and focus moves announce nothing; the focused mark names itself', JSON.stringify(liveEchoes) === '[0,0,0]');
  // The finding banner was inserted as a new role=status node with its text, which screen readers announce unreliably; the
  // caption now goes to a region that exists before the pick.
  const findingSpoken = [];
  for (const lang of ['hr', 'en']) {
    await go(`?version=v3&fresh=findingsr${lang}#explore=map&l=${lang}`);
    await page.evaluate(() => { window.liveBefore = [...document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"]')]; });
    await page.select('[aria-label="Vođeni nalazi"], [aria-label="Guided findings"]', '1');
    await page.waitForSelector('.v3-finding p');
    findingSpoken.push(await page.evaluate(() => { const caption = document.querySelector('.v3-finding p').textContent; return window.liveBefore.some(el => el.isConnected && el.textContent.includes(caption)) && !document.querySelector('.v3-finding').matches('[role="status"], [aria-live]:not([aria-live="off"])'); }));
  }
  check('a picked finding is announced from a region that was already there', findingSpoken.every(Boolean));
  // The play toggle changed its name and its pressed state together ("Pause animation, pressed"); a toggle keeps its name.
  await go('?version=v3&fresh=play#explore=map&year=2010&l=en');
  const playBefore = await page.$eval('.v3-play', b => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')]);
  await page.click('.v3-play'); await new Promise(resolve => setTimeout(resolve, 200));
  const playDuring = await page.$eval('.v3-play', b => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')]);
  await page.click('.v3-play');
  check('the play toggle keeps its name and reports its state in aria-pressed', playBefore[0] === playDuring[0] && playBefore[1] === 'false' && playDuring[1] === 'true');
  // Every row of the municipal results list was a tab stop (556 of the view's 602); the list is now one, moved by arrows.
  const rovingFocus = await page.createCDPSession(); await rovingFocus.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await go('?version=v3&fresh=roving#explore=municipalities&l=en'); await page.waitForFunction(() => document.querySelectorAll('[data-municipality]').length === 556);
  const rowAt = () => page.evaluate(() => [...document.querySelectorAll('.v3-municipal-results > button')].indexOf(document.activeElement));
  const listStops = await page.evaluate(() => [...document.querySelectorAll('.v3-municipal-results > button')].filter(b => b.tabIndex >= 0).length);
  await page.evaluate(() => [...document.querySelectorAll('.v3-municipal-results > button')].find(b => b.tabIndex >= 0).focus());
  const listMoves = [];
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'Home']) { await page.keyboard.press(key); listMoves.push(await rowAt()); }
  await page.keyboard.press('Tab'); const leftTheList = await page.evaluate(() => !document.activeElement.closest('.v3-municipal-results'));
  await rovingFocus.send('Emulation.setFocusEmulationEnabled', { enabled: false }); await rovingFocus.detach();
  check('the municipal list is one tab stop that arrow keys move through', listStops === 1 && JSON.stringify(listMoves) === '[1,2,1,555,0]' && leftTheList);
  // The municipal map's focus indicator was the hover outline: hovering elsewhere or leaving the map took it away.
  const ringFocus = await page.createCDPSession(); await ringFocus.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await go('?version=v3&fresh=munifocus#explore=municipalities&l=en'); await page.waitForFunction(() => document.querySelectorAll('[data-municipality]').length === 556);
  await page.evaluate(() => document.querySelector('[data-municipality][tabindex="0"]').focus()); await page.keyboard.press('ArrowRight');
  const ringId = await page.evaluate(() => document.activeElement.getAttribute('data-municipality'));
  const ringHeld = () => page.evaluate(id => document.querySelector('[data-municipality-focus]')?.getAttribute('data-municipality-focus') === id, ringId);
  const ringStates = [await ringHeld()];
  const elsewhere = await page.$eval(`[data-municipality]:not([data-municipality="${ringId}"])`, p => { const r = p.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.mouse.move(...elsewhere); await new Promise(resolve => setTimeout(resolve, 150)); ringStates.push(await ringHeld());
  await page.mouse.move(5, 5); await new Promise(resolve => setTimeout(resolve, 150)); ringStates.push(await ringHeld());
  await ringFocus.send('Emulation.setFocusEmulationEnabled', { enabled: false }); await ringFocus.detach();
  check('a keyboard-focused municipality keeps its own outline whatever the pointer does', ringStates.every(Boolean));
  // Years-grid keys moved by flat index (↓ on the last row jumped to 2025, → wrapped into the next county), and the tab stop
  // kept its index when a metric change reordered the rows, landing on a different county.
  const gridFocus = await page.createCDPSession(); await gridFocus.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await go('?version=v3&fresh=gridkeys#explore=trends&metric=tot&l=en');
  const gridDims = await page.evaluate(() => [document.querySelectorAll('.v3-years tbody tr').length, document.querySelectorAll('.v3-years thead th').length - 1]);
  const cellName = () => page.evaluate(() => (document.activeElement.getAttribute('aria-label') || '').split(':')[0]);
  const edgeStays = [];
  for (const [r, c, key] of [[gridDims[0] - 1, 5, 'ArrowDown'], [0, 5, 'ArrowUp'], [2, gridDims[1] - 1, 'ArrowRight']]) { await page.focus(`[data-grid-cell="${r * gridDims[1] + c}"]`); const before = await cellName(); await page.keyboard.press(key); edgeStays.push(before === await cellName()); }
  await page.focus(`[data-grid-cell="${3 * gridDims[1] + 7}"]`); const gridChosen = await cellName();
  await page.evaluate(() => [...document.querySelectorAll('.v3-metrics button')].find(b => b.textContent === 'External').click()); await new Promise(resolve => setTimeout(resolve, 200));
  const gridStop = await page.evaluate(() => (document.querySelector('[data-grid-cell][tabindex="0"]').getAttribute('aria-label') || '').split(':')[0]);
  await gridFocus.send('Emulation.setFocusEmulationEnabled', { enabled: false }); await gridFocus.detach();
  check('grid keys stop at the row or column edge, and the tab stop follows its county and year', edgeStays.every(Boolean) && gridStop === gridChosen);
  // On the Regions map every county button was named by its region alone: 21 buttons, 5 distinct names.
  await go('?version=v3&fresh=regionnames#explore=regions&year=2024&sum=1&l=en');
  const regionButtonNames = await page.evaluate(() => [...document.querySelectorAll('[data-county]')].map(p => p.getAttribute('aria-label')));
  check('each Regions map button names its county before its region', regionButtonNames.length === 21 && new Set(regionButtonNames).size === 21 && regionButtonNames.some(n => /^Osječko-baranjska — Eastern: /.test(n)));
  // The county annual-series chart kept its 84 values in hover-only tooltips; it now has a data table, as the corridor's does.
  const seriesTables = [];
  for (const [hash, root] of [['explore=map&year=2024&county=HR-17', '.v3-county-detail'], ['explore=trends&county=HR-17', '.v3-trends-view']]) {
    await go(`?version=v3&fresh=series${seriesTables.length}#${hash}&l=en`);
    seriesTables.push(await page.evaluate(root => { const t = document.querySelector(`${root} details.v3-series-table table`); return !!t && /Splitsko-dalmatinska/.test(t.caption?.textContent || '') && [...t.querySelectorAll('thead th')].map(th => th.textContent).join('|') === 'Year|Internal|External|Natural change' && t.querySelectorAll('tbody tr').length === 28; }, root));
  }
  check('the county annual series has a data table of its values', seriesTables.every(Boolean));
  // At 200 % text (a 32 px root) the flows direction row pushed "Saldo" past the workspace edge, rank-list names ended in an
  // ellipsis and a KPI number was clipped by its card (WCAG 1.4.4).
  const clippedAt200 = [];
  for (const [w, h] of [[1440, 900], [1280, 800], [390, 844]]) for (const hash of ['explore=flows&year=2018&county=HR-21', 'explore=map&year=2024']) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
    await go(`?version=v3&fresh=text200${w}${hash.length}#${hash}&l=hr`);
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; }); await new Promise(resolve => setTimeout(resolve, 400));
    clippedAt200.push(...await page.evaluate(() => {
      const ws = document.querySelector('.v3-workspace').getBoundingClientRect(), out = [];
      for (const b of document.querySelectorAll('.v3-segment button')) { const r = b.getBoundingClientRect(); if (r.width && (r.right > ws.right + 1 || b.scrollWidth > b.clientWidth + 1)) out.push(b.textContent); }
      for (const l of document.querySelectorAll('.v3-rank-label')) if (l.getClientRects().length && l.scrollWidth > l.clientWidth + 1) out.push(l.textContent);
      for (const n of document.querySelectorAll('.v3-stat > strong')) if (n.scrollWidth > n.clientWidth + 1 || n.getBoundingClientRect().right > n.closest('.v3-stat').getBoundingClientRect().right + 1) out.push(n.textContent);
      return out;
    }));
  }
  await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  check('at 200 % text the direction row, rank names and KPI numbers are not clipped', clippedAt200.length === 0);
  // The sidebar's view labels broke inside words: "Stanovništv / o" at 1180 px, and at 200 % text or under text spacing.
  const sideSplits = [];
  const textSpacing = '*{letter-spacing:.12em!important;word-spacing:.16em!important;line-height:1.5!important}p{margin-bottom:2em!important}';
  for (const [w, lang, root, css] of [[1180, 'hr', 16, ''], [1440, 'hr', 32, ''], [1440, 'en', 32, ''], [1024, 'hr', 16, textSpacing]]) {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await go(`?version=v3&fresh=side${w}${lang}${root}${css.length}#explore=map&year=2024&l=${lang}`);
    await page.evaluate(r => { document.documentElement.style.fontSize = r + 'px'; }, root);
    if (css) await page.addStyleTag({ content: css });
    await new Promise(resolve => setTimeout(resolve, 300));
    sideSplits.push(...await page.evaluate(() => {
      const out = [], walker = document.createTreeWalker(document.querySelector('.v3-sidebar'), NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) for (const m of node.textContent.matchAll(/\S+/g)) {
        const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        if (new Set([...range.getClientRects()].filter(r => r.width).map(r => Math.round(r.top))).size > 1) out.push(m[0]);
      }
      return out;
    }));
  }
  await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  check('no sidebar label breaks inside a word, at 1180 px, 200 % text or under text spacing', sideSplits.length === 0);
  // On a desktop the data sat in capped inner scrollers: the Years grid showed 15 of 21 counties (the biggest losers
  // hidden), and the matrix, the corridor table and the classification list (its whole loss group) hid rows too.
  const hiddenRows = [];
  for (const [hash, selector] of [['explore=trends&year=2025&metric=tot', '.v3-years-scroll'], ['explore=matrix&year=2018', '.v3-matrix-scroll'], ['explore=flows&year=2018&county=HR-21&pair=HR-01', '.v3-pair .v3-table-scroll'], ['explore=classify&year=2024', '.v3-analysis-list']]) {
    await go(`?version=v3&fresh=rows${selector.length}#${hash}&l=hr`); await page.waitForSelector(selector);
    hiddenRows.push(await page.$eval(selector, el => el.scrollHeight - el.clientHeight));
  }
  const stickyMap = await page.evaluate(async () => { [...document.querySelectorAll('.v3-analysis-list button')].at(-1).scrollIntoView({ block: 'end', behavior: 'instant' }); await new Promise(resolve => setTimeout(resolve, 200)); const r = document.querySelector('[data-analysis=classification] .v3-cartography').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
  check('desktop tables and the classification list show every row, the map staying beside the list', hiddenRows.every(px => px <= 1) && stickyMap);
  // The desktop year slider was a 4 px strip with a ~10 px hit band (WCAG 2.5.8 asks for 24 px).
  await go('?version=v3&fresh=slider#explore=map&year=2010&l=en');
  const sliderBox = await page.$eval('.v3-slider-wrap input', el => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const sliderBefore = await page.$eval('#v3-year', s => s.value);
  await page.mouse.click(sliderBox.x + sliderBox.w * .9, sliderBox.y + sliderBox.h / 2 - 9); await new Promise(resolve => setTimeout(resolve, 200));
  check('the desktop year slider is at least 24 px tall and takes a press 9 px off its track', sliderBox.h >= 24 && await page.$eval('#v3-year', s => s.value) !== sliderBefore);
  // The annual-series lines were told apart by colour alone; each series now has its own dash, shown in its legend key.
  const seriesDashes = [];
  for (const [hash, root] of [['explore=trends&county=HR-17', '.v3-trends-view'], ['explore=flows&year=2018&county=HR-21&pair=HR-01', '.v3-pair']]) {
    await go(`?version=v3&fresh=dash${seriesDashes.length}#${hash}&l=en`);
    seriesDashes.push(await page.evaluate(root => { const chart = document.querySelector(`${root} .v3-annual-lines`); const lines = [...chart.querySelectorAll('svg[role="img"] path')].map(p => getComputedStyle(p).strokeDasharray), keys = [...chart.querySelectorAll(':scope > div svg line')].map(l => getComputedStyle(l).strokeDasharray); return lines.length >= 2 && new Set(lines).size === lines.length && keys.join('|') === lines.join('|'); }, root));
  }
  check('each annual series has its own dash pattern, and its legend key shows it', seriesDashes.every(Boolean));
  // The corridor chart drew its 27 IPF-estimated years exactly like 2018, the one measured year.
  await go('?version=v3&fresh=pairmeasured#explore=flows&year=2018&county=HR-21&pair=HR-01&l=en'); await page.waitForSelector('.v3-pair .v3-annual-lines circle');
  const measuredMark = await page.evaluate(() => {
    const chart = document.querySelector('.v3-pair .v3-annual-lines'), dots = [...chart.querySelector('svg[role="img"] g').querySelectorAll('circle')], look = c => getComputedStyle(c).fill + c.getAttribute('r');
    const estimated = dots.filter((_, i) => i !== 20);
    return new Set(estimated.map(look)).size === 1 && look(estimated[0]) !== look(dots[20]) && /IPF/.test(estimated[0].textContent) && !/IPF/.test(dots[20].textContent) && /IPF estimate/.test(chart.querySelector(':scope > div').textContent);
  });
  check('the corridor chart marks 2018 as measured and the other years as IPF estimates', measuredMark);
  // Footer links, and a few others, opened new tabs without the "opens in a new tab" notice the paper and source links carry.
  const silentTabs = [];
  for (const hash of ['explore=classify&year=2024&l=en', 'explore=population&panel=municipal&l=hr']) { await go(`?version=v3&fresh=newtab${silentTabs.length}#${hash}`); silentTabs.push(...await page.evaluate(() => [...document.querySelectorAll('a[target="_blank"]')].filter(a => !/new tab|novoj kartici|nova kartica/i.test((a.getAttribute('aria-label') || '') + ' ' + a.textContent)).map(a => a.href))); }
  check('every link that opens a new tab says so', silentTabs.length === 0);
  // English text sat under lang="hr": the footer's "© OpenStreetMap contributors" and the boot-failure message's English half.
  await go('?version=v3&fresh=langmix#explore=map&l=hr');
  const osmCredit = await page.evaluate(() => { const a = [...document.querySelectorAll('.v3-footer a')].find(x => /openstreetmap\.org/.test(x.href)); return [a.textContent, a.closest('[lang]').getAttribute('lang')]; });
  const bootFailHtml = ((await page.evaluate(async () => (await fetch('/index.html?fresh=' + Date.now())).text())).match(/<p class="boot-fail"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '';
  check('English text on the Croatian page is either translated or marked as English', (osmCredit[1] === 'en' || !/contributors/.test(osmCredit[0])) && /<span lang="en">This is taking too long/.test(bootFailHtml));
  // Decorative text was read aloud: "A / 08" and "45° N 16° E" inside the navigation landmark, and the ↙ / ↗ stat arrows.
  await go('?version=v3&fresh=decor#explore=map&county=HR-18&l=en');
  check('decorative sidebar text and stat arrows are hidden from assistive technology', await page.evaluate(() => { const els = [...document.querySelectorAll('.v3-side-index, .v3-side-coordinate, .v3-stat-arrow')]; return els.length >= 4 && els.every(el => el.closest('[aria-hidden="true"]')); }));
  // The corridor's annual table had no caption and its header cells no scope.
  await go('?version=v3&fresh=pairtable#explore=flows&year=2018&county=HR-21&pair=HR-01&l=en'); await page.waitForSelector('.v3-pair .v3-data-table');
  check('the corridor annual table is captioned and its headers are scoped', await page.$eval('.v3-pair .v3-data-table', t => /City of Zagreb ↔ Zagrebačka/.test(t.caption?.textContent || '') && [...t.querySelectorAll('thead th')].every(th => th.scope === 'col') && [...t.querySelectorAll('tbody th')].every(th => th.scope === 'row')));
  // Every table wrapper was a focusable region named "… scroll horizontally", though none scrolled sideways at 1440 or 390 px
  // and some did not scroll at all; the citizenship chart's region repeated its inner group's name.
  const regionFaults = [];
  for (const [w, h] of [[1440, 900], [390, 844]]) for (const hash of ['explore=trends', 'explore=matrix', 'explore=population&panel=age', 'explore=population&panel=citizenship']) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
    await go(`?version=v3&fresh=scroll${w}${hash.length}#${hash}&l=en`); await new Promise(resolve => setTimeout(resolve, 200));
    regionFaults.push(...await page.evaluate(() => [...document.querySelectorAll('.v3-table-frame > div')].filter(el => {
      const scrolls = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1, label = el.getAttribute('aria-label') || '';
      return scrolls ? !(el.tabIndex === 0 && el.getAttribute('role') === 'region' && label && !/scroll|pomi/i.test(label) && el.querySelector('[aria-label]')?.getAttribute('aria-label') !== label) : el.hasAttribute('tabindex') || el.hasAttribute('role');
    }).map(el => el.className)));
  }
  await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  check('only a table area that scrolls is a named, focusable region', regionFaults.length === 0);
  // A Retry pressed offline changed nothing on screen: retryGeo() answers 'offline' and resumes on reconnection, and v3
  // discarded the answer where v2 says so.
  const offlinePage = await browser.newPage();
  await offlinePage.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  await offlinePage.setRequestInterception(true);
  let blockGeo = true;
  offlinePage.on('request', request => { if (blockGeo && /geo_jls|geo_regions5/.test(request.url())) request.abort('failed'); else request.continue(); });
  const offlineRuns = [];
  for (const [hash, status] of [['explore=municipalities', '.v3-geo-loading'], ['explore=regions', '.v3-analysis .v3-data-note[role="status"]']]) {
    blockGeo = true; await offlinePage.setOfflineMode(false);
    await offlinePage.goto(origin + `/?version=v3&fresh=offline${offlineRuns.length}#${hash}&l=en`, { waitUntil: 'networkidle0' });
    await offlinePage.waitForFunction(sel => [...document.querySelectorAll(sel + ' button')].some(b => /Retry/.test(b.textContent)), {}, status);
    await offlinePage.setOfflineMode(true);
    await offlinePage.evaluate(sel => [...document.querySelectorAll(sel + ' button')].find(b => /Retry/.test(b.textContent)).click(), status);
    await new Promise(resolve => setTimeout(resolve, 400));
    offlineRuns.push(/resume by itself/.test(await offlinePage.evaluate(sel => document.querySelector(sel)?.textContent || '', status)));
  }
  await offlinePage.close();
  check('a retry pressed offline says it will resume by itself', offlineRuns.every(Boolean));
  // The copy-link fallback opened last in the DOM: Tab from it ran off the page, Shift+Tab to the footer, and the fixed
  // panel stayed open over the controls focus moved on to. It now sits after Share and closes once focus leaves it.
  const sharePage = await browser.newPage();
  await sharePage.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  await sharePage.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }); });
  await (await sharePage.createCDPSession()).send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await sharePage.goto(origin + '/?version=v3&fresh=sharefallback#explore=map&l=en', { waitUntil: 'networkidle0' });
  const shareAt = () => sharePage.evaluate(() => { const a = document.activeElement; return a.closest('.v3-share-fallback') ? 'panel:' + a.tagName : a.classList.contains('v3-share') ? 'share' : a === document.body ? 'body' : 'page'; });
  const openShare = async () => { await sharePage.click('.v3-share'); await sharePage.waitForSelector('.v3-share-fallback input'); await new Promise(resolve => setTimeout(resolve, 100)); };
  await openShare(); const shareSteps = [await shareAt()];
  await sharePage.keyboard.press('Tab'); shareSteps.push(await shareAt());
  await sharePage.keyboard.press('Tab'); await new Promise(resolve => setTimeout(resolve, 100)); shareSteps.push(await shareAt(), !(await sharePage.$('.v3-share-fallback')));
  await openShare(); await sharePage.keyboard.down('Shift'); await sharePage.keyboard.press('Tab'); await sharePage.keyboard.up('Shift'); await new Promise(resolve => setTimeout(resolve, 100)); shareSteps.push(await shareAt());
  await sharePage.close();
  check('the copy-link panel takes focus, sits next to Share, and closes when focus leaves it', JSON.stringify(shareSteps) === '["panel:INPUT","panel:BUTTON","page",true,"share"]');
  // The trend chart's year bars are buttons that pick a year, and none said which year was picked.
  await go('?version=v3&fresh=bars#explore=trends&year=2010&l=en');
  check('the trend chart says which year is selected', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.v3-trend-chart .v3-chart-hit[aria-pressed="true"]')].map(b => b.getAttribute('aria-label').slice(0, 4)))) === '["2010"]');
  // A drag across the chart scrubs its years; a mouse drag along the year labels selected them instead.
  await page.evaluate(() => document.querySelector('.v3-trend-chart').scrollIntoView({ block: 'center' })); await new Promise(resolve => setTimeout(resolve, 300));
  const scrubRow = await page.$$eval('.v3-trend-chart .v3-chart-hit', hits => { const mid = r => r.x + r.width / 2; return { from: mid(hits[2].getBoundingClientRect()), to: mid(hits[17].getBoundingClientRect()), y: hits[0].closest('svg').getBoundingClientRect().bottom - 12 }; });
  await page.mouse.move(scrubRow.from, scrubRow.y); await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(scrubRow.from + (scrubRow.to - scrubRow.from) * i / 20, scrubRow.y); await new Promise(resolve => setTimeout(resolve, 16)); }
  await page.mouse.up(); await new Promise(resolve => setTimeout(resolve, 300));
  check('dragging across the trend chart scrubs to a year without selecting its labels', JSON.stringify(await page.evaluate(() => [new URLSearchParams(location.hash.slice(1)).get('year'), getSelection().toString()])) === '["2015",""]');
  await page.mouse.move(0, 0);
  // On desktop, picking a partner county in Flows opened the corridor detail below the map without a word (phones move
  // focus to its heading); desktop keeps focus on the map, so the opening is announced.
  const pairFocus = await page.createCDPSession(); await pairFocus.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await go('?version=v3&fresh=pairsr#explore=flows&year=2018&county=HR-21&l=en');
  await page.evaluate(() => { window.liveBefore = [...document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"]')]; });
  await page.evaluate(() => { const p = document.querySelector('[data-county="HR-01"]'); p.focus(); p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  await page.waitForSelector('#v3-pair-title'); await new Promise(resolve => setTimeout(resolve, 200));
  const pairSpoken = await page.evaluate(() => { const heading = document.getElementById('v3-pair-title').textContent.replace(/\s+/g, ' ').trim(); return window.liveBefore.some(el => el.isConnected && el.textContent.includes(heading)) && document.activeElement?.getAttribute('data-county') === 'HR-01'; });
  await pairFocus.send('Emulation.setFocusEmulationEnabled', { enabled: false }); await pairFocus.detach();
  check('a corridor opened from the desktop map is announced, and focus stays on the map', pairSpoken);
  // Typing in a search filtered its list silently ("spl" left one row and said nothing); each search now reports its count.
  const searchCounts = [];
  for (const [hash, input, query, rowsSel] of [['explore=map&l=en', '.v3-search input', 'sp', '.v3-rank-row'], ['explore=municipalities&l=en', '.v3-municipal-search input', 'split', '.v3-municipal-results button'], ['explore=population&panel=countries&l=en', '.v3-pop-search input', 'bos', '.v3-pop-table tbody tr:not(:has(.v3-pop-empty))'], ['explore=population&panel=municipal&l=hr', '.v3-pop-search input', 'zag', '.v3-pop-table tbody tr:not(:has(.v3-pop-empty))']]) {
    await go(`?version=v3&fresh=search${searchCounts.length}#${hash}`);
    if (hash.includes('municipalities')) await page.waitForFunction(() => document.querySelectorAll('[data-municipality]').length === 556);
    await page.evaluate(() => { window.liveBefore = [...document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"]')]; });
    await page.type(input, query); await new Promise(resolve => setTimeout(resolve, 300));
    searchCounts.push(await page.evaluate(rowsSel => { const n = document.querySelectorAll(rowsSel).length, hr = document.documentElement.lang === 'hr'; const said = `${n} ${hr ? (n % 10 === 1 && n % 100 !== 11 ? 'rezultat' : 'rezultata') : (n === 1 ? 'result' : 'results')}`; return n > 0 && window.liveBefore.some(el => el.isConnected && el.textContent.trim() === said); }, rowsSel));
  }
  check('each search announces its result count as it filters', searchCounts.every(Boolean));
  // The population panels' CSV export saved its file silently, where the main CSV export confirms itself in the toast.
  const popToasts = [];
  for (const panel of ['age', 'citizenship', 'countries', 'municipal']) { await go(`?version=v3&fresh=popcsv${panel}#explore=population&panel=${panel}&l=en`); await page.click('.v3-pop-export'); await new Promise(resolve => setTimeout(resolve, 300)); popToasts.push(await text('.v3-toast')); }
  check('a population CSV export confirms itself in the toast', popToasts.every(t => t === 'Data exported as CSV.'));
  // The citizenship panel cited "table 2" for STAN sheet I T2 while its neighbours cite "I 3 / II 2" and "I 4": a bare 2 also
  // reads as II T2, the internal migration table.
  const citSources = [];
  for (const lang of ['hr', 'en']) { await go(`?version=v3&fresh=citsource${lang}#explore=population&panel=citizenship&l=${lang}`); citSources.push(await page.$$eval('.v3-pop-source', ps => ps.map(p => p.textContent).find(t => /STAN-2026-2-1/.test(t)) ?? '')); }
  check('the citizenship panel cites STAN sheet I 2', /tablica I 2\b/.test(citSources[0]) && /table I 2\b/.test(citSources[1]));
  // Keyed on its text, a second export 3 s after the first changed nothing in the live region (no announcement) and the
  // first timer cleared it at 3.5 s; worded at click time, it stayed Croatian after a switch to English.
  await go('?version=v3&fresh=toastrepeat#explore=map&year=2024&l=hr');
  await page.evaluate(() => { window.toastAdds = 0; new MutationObserver(records => { for (const r of records) for (const n of r.addedNodes) if (n.textContent.trim()) window.toastAdds++; }).observe(document.querySelector('.v3-toast'), { childList: true, subtree: true }); });
  await page.click('.v3-export'); await new Promise(resolve => setTimeout(resolve, 3000));
  await page.click('.v3-export'); await new Promise(resolve => setTimeout(resolve, 1500));
  const repeatToast = await page.evaluate(() => [window.toastAdds, document.querySelector('.v3-toast').textContent]);
  await page.click('.v3-language button:not([aria-pressed="true"])'); await new Promise(resolve => setTimeout(resolve, 300));
  repeatToast.push(await text('.v3-toast'));
  check('a repeated notice is announced again and restarts its timer; its text follows the language', JSON.stringify(repeatToast) === '[2,"Podaci su izvezeni u CSV.","Data exported as CSV."]');
  // The population notes said "year and cumulative mode" and "the timeline" leave the data unchanged, in a view with no
  // timeline and no cumulative mode.
  const popNotes = [];
  for (const lang of ['hr', 'en']) for (const panel of ['age', 'citizenship', 'countries', 'municipal']) { await go(`?version=v3&fresh=popnote${lang}${panel}#explore=population&panel=${panel}&county=HR-14&l=${lang}`); popNotes.push(await page.$eval('.v3-pop-scope', el => el.textContent)); }
  check('population notes name only controls the view has', popNotes.length === 8 && popNotes.every(t => !/Timeline|timeline|Vremensk|vremensk|cumulative|zbrajanj|, year |, godina /.test(t)));
  // "Postavke rada" / "Metoda rada" read as "work settings" / "working method"; the study's are "iz rada".
  await go('?version=v3&fresh=izrada#explore=classify&year=2024&l=hr');
  const izRada = await page.evaluate(() => ({ button: document.querySelector('.v3-threshold .v3-button').textContent, summaries: [...document.querySelectorAll('dialog summary')].map(s => s.textContent) }));
  check('Croatian names the study\'s settings and method "iz rada"', izRada.button === 'Postavke iz rada' && izRada.summaries.some(t => t.startsWith('Metoda iz rada')) && !izRada.summaries.some(t => /Metoda rada/.test(t)));
  // Three region names are adjectives ("Istočna"), which made the page heading a bare "Istočna" / "Eastern" once picked.
  const regionHeadings = [];
  for (const lang of ['hr', 'en']) for (const county of ['HR-14', 'HR-08', 'HR-17', 'HR-21', 'HR-07']) { await go(`?version=v3&fresh=reg${lang}${county}#explore=regions&year=2024&sum=1&county=${county}&l=${lang}`); regionHeadings.push(await text('.v3-intro h1')); }
  check('a picked region heads the page with its full name', JSON.stringify(regionHeadings) === JSON.stringify(['Istočna regija', 'Sjevernojadranska regija', 'Dalmatinska regija', 'Zagrebačka regija', 'Središnja Hrvatska', 'Eastern region', 'North Adriatic region', 'Dalmatian region', 'Zagreb region', 'Central Croatia']));
  // Croatian figure legends called the positive colour "zeleno" where About says "tirkizno" and English "teal"; English
  // About spelt "color" in a British-English UI.
  const colourLegends = [];
  for (const hash of ['explore=map&year=2024', 'explore=matrix&year=2018', 'explore=flows&year=2018']) {
    const name = await savedName(`${hash}&l=hr`, '.v3-export-actions button:nth-child(2)');
    colourLegends.push(name ? ((fs.readFileSync(path.join(output, name), 'utf8').match(/<desc>([^<]*)<\/desc>/) || [])[1] || '').split('\n')[1] || '' : '');
  }
  check('Croatian figure legends name the positive colour as About does', colourLegends.every(l => /tirkizno/i.test(l) && !/zeleno/i.test(l)));
  await go('?version=v3&fresh=colourabout#explore=map&l=en');
  const aboutText = await page.evaluate(() => document.querySelector('dialog').textContent);
  check('English About spells colour the British way', /colour/.test(aboutText) && !/\bcolor\b/.test(aboutText));
  // The flows page printed its honesty note twice, and the IPF sentence had three phrasings although ipfMargins() keeps one.
  const ipfWording = { hr: 'struktura 2018. skalirana na DZS odseljene; doseljeni približno', en: 'the 2018 structure scaled to CBS out-margins; in-margins approximate' };
  const flowNotes = () => page.evaluate(() => [...document.querySelectorAll('.v3-data-note')].map(p => p.textContent).filter(t => /IPF|Procjena|Estimate|Izmjereni tokovi|Measured inter-county/.test(t)));
  const flowNoteCounts = [];
  for (const hash of ['explore=flows&year=2010', 'explore=flows&year=2018', 'explore=matrix&year=2010']) { await go(`?version=v3&fresh=ipf${flowNoteCounts.length}#${hash}&l=en`); flowNoteCounts.push((await flowNotes()).length); }
  check('each flow view prints its estimate or measured note once', JSON.stringify(flowNoteCounts) === '[1,1,1]');
  let ipfShared = true;
  for (const lang of ['hr', 'en']) {
    const name = await savedName(`explore=flows&year=2010&l=${lang}`, '.v3-export-actions button:nth-child(2)');
    const desc = name ? (fs.readFileSync(path.join(output, name), 'utf8').match(/<desc>([^<]*)<\/desc>/) || [])[1] || '' : '';
    ipfShared = ipfShared && (await flowNotes()).every(t => t.includes(ipfWording[lang])) && desc.includes(ipfWording[lang]);
  }
  check('the screen and the figure state the IPF method in the one shared wording', ipfShared);
  check('the cumulative-estimate note appears only on cumulative views, the cell note only on tables', JSON.stringify([await denNotes('explore=map&year=2001'), await denNotes('explore=map&year=2024&sum=1'), await denNotes('explore=trends&metric=tot'), await denNotes('explore=trends&metric=tot&sum=1')]) === '["000","110","001","111"]');
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
  // The switch was two bare links, "v2" and "v3": nothing said which atlas either opens.
  check('each version link says which atlas it opens', await page.evaluate(() => [...document.querySelectorAll('.atlas-version-switch a')].every(a => { const label = a.getAttribute('aria-label') || ''; return label.startsWith(a.textContent) && /version of the atlas/.test(label) && a.title === label; })));
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
  // Leaving a version now remembers its view, so that shared link became v2's last one: return to the saved analysis.
  await go('?version=v2&l=en' + v2Hash);
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
  // The switch replayed each version's stored hash with its own l=, so the language flipped: v3 in Croatian → v2 → EN →
  // v3 opened Croatian; a Croatian v3 opened v2 in whatever v2 detected. Leaving v2 by Back stored nothing, so the next
  // v2 link opened its default view.
  const switchState = () => page.evaluate(() => [document.documentElement.lang, location.hash]);
  const cleanSession = () => page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await go('?version=v3&fresh=vsrt#explore=map&year=2024&county=HR-18&l=hr'); await cleanSession();
  await navClick('.atlas-version-switch a[href*="version=v2"]');
  const switchedToV2 = await switchState();
  await page.click('button[data-l="en"]'); await new Promise(resolve => setTimeout(resolve, 300));
  await navClick('.atlas-version-switch a[href*="version=v3"]');
  const switchedBack = await switchState();
  await page.evaluate(() => { localStorage.clear(); });
  await navClick('.atlas-version-switch a[href*="version=v2"]');
  await page.evaluate(() => { location.hash = location.hash.replace(/y=\d+/, 'y=2016'); }); await new Promise(resolve => setTimeout(resolve, 300));
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.evaluate(() => history.go(-2))]);
  await navClick('.atlas-version-switch a[href*="version=v2"]');
  const afterBack = await switchState();
  check('the version switch keeps the reader\'s language and each version\'s last view', switchedToV2[0] === 'hr' && switchedBack[0] === 'en' && switchedBack[1].includes('county=HR-18') && afterBack[0] === 'en' && afterBack[1].includes('y=2016'));
  // The brand link reset the view with href="?version=v3": from an English page it opened the default view in Croatian.
  await go('?version=v3&fresh=brand#explore=trends&year=2020&l=en'); await page.evaluate(() => { localStorage.clear(); });
  await navClick('a.v3-brand');
  check('the brand link resets the view in the reader\'s language', await page.evaluate(() => document.documentElement.lang === 'en' && new URLSearchParams(location.hash.slice(1)).get('explore') === 'map'));
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
