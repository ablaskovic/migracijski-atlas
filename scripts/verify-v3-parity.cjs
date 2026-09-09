#!/usr/bin/env node
// Native V3 feature parity, checked against the committed source datasets.
// node scripts/verify-v3-parity.cjs [logs/v3-build | http://127.0.0.1:5173]
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer');
const raw = require('../src/data/atlas_data2.json');
const od = require('../src/data/odm.json');
const geo = require('../src/data/geo_jls.json');
const demo = require('../src/data/demo.json');
const cit = require('../src/data/citizen.json');
const jls = require('../src/data/jls_drill.json');
const isos = Object.keys(raw.c), years = raw.years, ix2011 = years.indexOf(2011);
const output = path.resolve('logs/v3-parity');
fs.mkdirSync(output, { recursive: true });
const input = process.argv[2] || 'logs/v3-build';
const root = path.resolve(input);
const regions = { zg: ['HR-21', 'HR-01'], sr: ['HR-02', 'HR-05', 'HR-20', 'HR-06', 'HR-07', 'HR-03', 'HR-04'], sj: ['HR-08', 'HR-18', 'HR-09'], da: ['HR-13', 'HR-15', 'HR-17', 'HR-19'], is: ['HR-14', 'HR-16', 'HR-12', 'HR-11', 'HR-10'] };
const matrixOrder = Object.values(regions).flat();
const views = ['map', 'trends', 'flows', 'classify', 'regions', 'matrix', 'municipalities', 'population'];
const panels = ['age', 'citizenship', 'countries', 'municipal'];
const viewSelectors = { map: '.v3-map-layout', trends: '.v3-years', flows: '.v3-hub-label', classify: '[data-analysis="classification"]', regions: '[data-analysis="regions"]', matrix: '.v3-matrix', municipalities: '[data-municipality]', population: '.v3-population' };
const nf = new Intl.NumberFormat('en-GB');
const number = value => Number(value.replace(/[−–]/g, '-').replace(/[^\d.+-]/g, ''));
const name = iso => iso === 'HR-21' ? 'City of Zagreb' : raw.c[iso].n;
const findIso = label => isos.find(iso => label.startsWith(name(iso)));
const sum = values => values.reduce((a, b) => a + b, 0);
const population = (iso, yi) => raw.c[iso].pe.slice(0, yi + 1).findLast(n => n != null) ?? raw.c[iso].pe.slice(yi).find(n => n != null) ?? raw.c[iso].p;
const net = (iso, year, metric = 'tot', cumulative = false, unit = 'abs') => {
  const yi = years.indexOf(year), c = raw.c[iso];
  const value = sum(years.slice(cumulative ? ix2011 : yi, yi + 1).map(y => {
    const i = years.indexOf(y), internal = c.ii[i] - c.oi[i], external = c.ie[i] - c.oe[i];
    return metric === 'int' ? internal : metric === 'ext' ? external : metric === 'nat' ? c.nat[i] : internal + external + (metric === 'all' ? c.nat[i] : 0);
  }));
  return unit === 'abs' ? value : value / (unit === 'pct' ? c.p : population(iso, yi)) * 100;
};
const flow = (from, to, year, cumulative = false) => sum(od[from][to].slice(cumulative ? ix2011 : years.indexOf(year), years.indexOf(year) + 1));
const rounded = (n, relative = false) => Number(n.toFixed(relative ? 1 : 0));
const failures = [], runtimeErrors = [];
let checks = 0, browser, server, page, origin, fixture = 0;
const check = (title, condition) => { assert.ok(condition, title); checks++; console.log('  ok ' + title); };
const group = async (name, body) => {
  if (process.env.PARITY_GROUP && !new RegExp(process.env.PARITY_GROUP, 'i').test(name)) return;
  console.log('\n' + name); try { await body(); } catch (error) { failures.push(name + ': ' + error.message); console.error('  FAIL ' + error.stack); }
};
const csvRows = csv => csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match => match[1].replace(/""/g, '"')));

async function boot() {
  if (/^https?:\/\//.test(input)) origin = input.replace(/\/$/, '');
  else {
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    server = http.createServer((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname.startsWith('/_vercel/')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('/* platform stub */'); }
      let file = path.resolve(root, '.' + decodeURIComponent(pathname));
      if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end(); }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  }
  browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--lang=en-GB'] });
  page = await browser.newPage();
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.setViewport({ width: 1440, height: 1050 });
  await page.setRequestInterception(true);
  page.on('request', request => request.url().includes('/_vercel/') ? request.respond({ status: 200, contentType: 'text/javascript', body: '' }) : request.continue());
  const session = await page.createCDPSession();
  await session.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: output });
}
async function go(view = 'map', extras = {}) {
  const params = new URLSearchParams({ explore: view, year: '2025', metric: 'tot', l: 'en', ...extras });
  // A distinct query forces a fresh document for each data fixture. Hash-only
  // navigation correctly preserves local UI state such as the search field.
  await page.goto(origin + '/?version=v3&l=en&qa=' + ++fixture + '#' + params, { waitUntil: 'networkidle0' });
  await page.waitForSelector(viewSelectors[view]);
}
async function navigate(view) {
  await page.select('[aria-label="All views"]', view);
  await page.waitForSelector(viewSelectors[view]);
}
async function download(selector, extension) {
  const old = new Map(fs.readdirSync(output).map(name => [name, fs.statSync(path.join(output, name)).mtimeMs]));
  await page.click(selector);
  for (let i = 0; i < 150; i++) {
    const file = fs.readdirSync(output).find(name => name.endsWith(extension) && (!old.has(name) || fs.statSync(path.join(output, name)).mtimeMs > old.get(name)));
    if (file) return { name: file, bytes: fs.readFileSync(path.join(output, file)) };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Download did not finish: ' + selector + '; ' + await page.$eval('.v3-toast', el => el.textContent));
}
async function capture(label) {
  await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
  await page.screenshot({ path: path.join(output, label + '.png'), fullPage: true });
}

(async () => {
  try {
    await boot();
    await group('Navigation and attribution', async () => {
      await go();
      check('all eight native views are offered', JSON.stringify(await page.$$eval('[aria-label="All views"] option', els => els.map(el => el.value))) === JSON.stringify(views));
      check('Maras and Vinovrski link is prominent', await page.$eval('.v3-research a', el => el.href === 'https://hrcak.srce.hr/349820' && el.textContent.includes('Maras') && el.textContent.includes('Vinovrški')));
      for (const view of views) { await navigate(view); check(`${view} opens natively and records the route`, await page.evaluate(v => new URLSearchParams(location.hash.slice(1)).get('explore') === v && !document.querySelector('iframe'), view)); }
      check('municipal geometry contains all 556 places', geo.features.length === 556);
    });

    await group('Classification thresholds and published comparison', async () => {
      for (const config of [{ year: 2024, threshold: 4500 }, { year: 2024, threshold: 500 }, { year: 2024, threshold: 15000 }, { year: 2025, threshold: 4500, pct: 1.5 }, { year: 2024, threshold: 4500, pct: 5 }]) {
        await go('classify', { year: String(config.year), threshold: String(config.threshold), ...(config.pct ? { thresholdUnit: 'pct', thresholdPct: String(config.pct) } : {}) });
        const expected = { gaining: [], neutral: [], losing: [] };
        isos.forEach(iso => { const n = net(iso, config.year, 'tot', true), threshold = config.pct ? raw.c[iso].p * config.pct / 100 : config.threshold; expected[n > 0 ? 'gaining' : n >= -threshold ? 'neutral' : 'losing'].push([name(iso), n]); });
        const actual = await page.$$eval('.v3-analysis-list section', els => els.map(section => ({ title: section.querySelector('h3').textContent, rows: [...section.querySelectorAll('button')].map(button => [button.querySelector('span').textContent, button.querySelector('strong').textContent]) })));
        check(`classification ${config.year}, ${config.pct ? config.pct + '%' : config.threshold} matches every county`, actual.every(({ title, rows }) => rows.length === expected[title].length && rows.every(([label, n]) => expected[title].some(([label2, n2]) => label === label2 && number(n) === n2))));
        check('classification always uses cumulative migration since 2011', await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('sum') === '1' && document.querySelector('.v3-time-mode button:first-child').disabled));
        if (!config.pct && config.year === 2024 && config.threshold === 4500) {
          const note = await page.$eval('.v3-study-comparison', el => el.textContent);
          check('study comparison preserves published 7/7/7 and names both revisions', /7\s*\/\s*7\s*\/\s*7/.test(note) && note.includes('Karlovačka') && note.includes('Koprivničko-križevačka'));
          await capture('classification');
        } else check('changed settings hide the same-settings study comparison', !await page.$('.v3-study-comparison'));
      }
    });

    await group('Regional totals and denominators', async () => {
      const configs = [{ year: 2025, metric: 'tot', sum: false, unit: 'abs' }, { year: 2024, metric: 'all', sum: true, unit: 'abs' }, { year: 2024, metric: 'int', sum: true, unit: 'pct' }, { year: 1998, metric: 'ext', sum: false, unit: 'estimate' }, { year: 2025, metric: 'nat', sum: true, unit: 'estimate' }];
      for (const config of configs) {
        await go('regions', { year: String(config.year), metric: config.metric, ...(config.sum ? { sum: '1' } : {}), ...(config.unit === 'abs' ? {} : { unit: config.unit }) });
        const rows = await page.$$eval('[data-region]', els => els.map(el => [el.dataset.region, el.querySelector('strong').textContent]));
        check(`all five regions match ${config.metric}/${config.unit}/${config.year}/${config.sum ? 'cumulative' : 'annual'}`, rows.length === 5 && rows.every(([region, value]) => {
          const total = sum(regions[region].map(iso => net(iso, config.year, config.metric, config.sum)));
          const denominator = sum(regions[region].map(iso => config.unit === 'pct' ? raw.c[iso].p : population(iso, years.indexOf(config.year))));
          return number(value) === rounded(config.unit === 'abs' ? total : total / denominator * 100, config.unit !== 'abs');
        }));
      }
      await go('regions', { year: '2025', metric: 'tot' });
      for (const [key, members] of Object.entries(regions)) {
        const regionName = await page.$eval(`[data-region="${key}"]`, el => el.querySelector('span').firstChild.textContent);
        await page.click(`[data-region="${key}"]`);
        check(`${key} selection names the region in the summary`, await page.$eval('.v3-intro h1', el => el.textContent) === regionName);
        const actual = (await page.$$eval('[data-stat]', els => els.map(el => el.textContent))).map(number);
        const yi = years.indexOf(2025);
        const expected = [sum(members.map(iso => net(iso, 2025))), sum(members.map(iso => raw.c[iso].ie[yi])), sum(members.map(iso => raw.c[iso].oe[yi])), sum(members.map(iso => net(iso, 2025, 'int')))];
        check(`${key} summary aggregates all member counties`, JSON.stringify(actual) === JSON.stringify(expected));
      }
      await capture('regions');
    });

    await group('OD matrix and corridor details', async () => {
      for (const direction of ['in', 'out', 'net']) {
        for (const cumulative of [false, true]) {
          const year = cumulative ? 2024 : 2018;
          await go('matrix', { dir: direction, year: String(year), ...(cumulative ? { sum: '1' } : {}) });
          const cells = await page.$$eval('[data-matrix-cell]', els => els.map(el => [+el.dataset.matrixCell, el.getAttribute('aria-label')]));
          check(`all 420 OD cells match ${direction}/${year}/${cumulative ? 'cumulative' : 'annual'}`, cells.length === 420 && cells.every(([index, label]) => {
            const a = matrixOrder[Math.floor(index / 21)], b = matrixOrder[index % 21];
            const outgoing = flow(a, b, year, cumulative), incoming = flow(b, a, year, cumulative);
            return number(label.slice(label.lastIndexOf(':') + 1)) === (direction === 'out' ? outgoing : direction === 'in' ? incoming : incoming - outgoing);
          }));
        }
      }
      await go('matrix', { dir: 'net', year: '2018' });
      await page.click('[data-matrix-cell="1"]');
      const expected = [flow('HR-01', 'HR-21', 2018), flow('HR-21', 'HR-01', 2018)];
      check('selected matrix pair reports both measured directions and net', JSON.stringify((await page.$$eval('.v3-pair-stats strong', els => els.map(el => el.textContent))).map(number)) === JSON.stringify([...expected, expected[0] - expected[1]]));
      check('pair detail contains all 28 annual rows', await page.$$eval('.v3-pair tbody tr', els => els.length === 28));
      await page.reload({ waitUntil: 'networkidle0' });
      check('matrix pair survives reload', await page.$eval('.v3-pair', el => el.dataset.pair === 'HR-21/HR-01'));
      await page.focus('[data-matrix-cell="1"]'); await page.keyboard.press('ArrowDown');
      check('matrix keyboard skips the diagonal within the same column', await page.evaluate(() => document.activeElement?.dataset.matrixCell === '43'));
      check('keyboard-focused matrix value is visible', await page.evaluate(() => getComputedStyle(document.activeElement).color !== 'rgba(0, 0, 0, 0)'));
      await page.keyboard.press('ArrowUp');
      check('matrix reverse navigation returns through the same column', await page.evaluate(() => document.activeElement?.dataset.matrixCell === '1'));
      await page.keyboard.press('End'); await page.keyboard.press('ArrowRight');
      check('matrix horizontal navigation stays in its row', await page.evaluate(() => document.activeElement?.dataset.matrixCell === '20'));
      await page.click('[aria-label="Close corridor"]');
      await page.waitForFunction(() => document.activeElement?.dataset.matrixCell === '1');
      check('closing the pair returns focus to its matrix cell', !await page.$('.v3-pair'));
      await capture('matrix');
      await go('flows', { dir: 'net', year: '2018', county: 'HR-21', pair: 'HR-01' });
      check('flow pair uses the same measured net', await page.$eval('.v3-pair-stats div:last-child strong', el => Number(el.textContent.replace(/[−,]/g, c => c === '−' ? '-' : '')) === -334));
      await page.click('.v3-rank-row');
      check('selecting a corridor keeps the chosen hub', await page.$eval('.v3-hub-label select', el => el.value === 'HR-21'));
    });

    await group('Municipality map and source values', async () => {
      for (const direction of ['in', 'out', 'net']) {
        await go('municipalities', { dir: direction, year: '2025', sum: '1' });
        const actual = await page.$$eval('[data-municipality]', els => els.map(el => [+el.dataset.municipality, el.getAttribute('aria-label')]));
        check(`all 556 municipalities match measured ${direction} data`, actual.length === 556 && actual.every(([id, label]) => { const p = geo.features.find(f => f.properties.j === id).properties; return number(label.slice(label.lastIndexOf(':') + 1)) === (direction === 'in' ? p.i : direction === 'out' ? p.o : p.i - p.o); }));
        check('municipality time is normalized to annual 2018', await page.evaluate(() => { const p = new URLSearchParams(location.hash.slice(1)); return p.get('year') === '2018' && !p.has('sum') && !document.querySelector('.v3-timeline'); }));
      }
      await page.type('.v3-municipal-search input', 'cakovec');
      check('municipality search ignores accents', await page.$eval('.v3-municipal-results', el => el.textContent.includes('Čakovec')));
      await page.click('.v3-municipal-results button');
      check('municipality detail includes all three metrics', await page.$eval('.v3-municipal-readout', el => /Arrivals:/.test(el.textContent) && /Departures:/.test(el.textContent) && /Net:/.test(el.textContent)));
      await page.$eval('.v3-municipal-search input', el => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await go('municipalities', { dir: 'net', county: 'HR-17' });
      const count = geo.features.filter(f => isos[f.properties.c] === 'HR-17').length;
      await page.waitForFunction(expected => document.querySelectorAll('.v3-municipal-results button').length === expected, {}, count);
      check('county filter includes every municipality in the county', await page.$$eval('.v3-municipal-results button', els => els.length) === count);
      await capture('municipalities');
      const csv = csvRows((await download('.v3-export', '.csv')).bytes.toString('utf8'));
      check('municipal CSV contains all 556 source rows and provenance', csv.length === 557 && csv.slice(1).every(row => row.includes('2018') && row.some(value => value.includes('CC BY 4.0'))));
    });

    await group('Municipal loading and export guard', async () => {
      const probe = await browser.newPage();
      let release;
      let hold;
      const held = new Promise(resolve => { hold = resolve; });
      try {
        await probe.setRequestInterception(true);
        probe.on('request', request => {
          if (/geo_jls[^/]*\.json(?:\?|$)/.test(request.url())) { release = request; hold(); }
          else if (request.url().includes('/_vercel/')) void request.respond({ status: 200, contentType: 'text/javascript', body: '' });
          else void request.continue();
        });
        await probe.goto(origin + '/?version=v3&l=en#explore=municipalities&year=2018&metric=tot&l=en&dir=net&finding=6', { waitUntil: 'domcontentloaded' });
        await probe.waitForSelector('.v3-geo-loading');
        await held;
        check('CSV, SVG and PNG wait for municipal geometry', await probe.$$eval('.v3-export-actions button', els => els.length === 3 && els.every(el => el.disabled)));
        check('municipal finding does not claim unloaded figures', !await probe.$('.v3-finding'));
        await release.continue(); release = null;
        await probe.waitForSelector('[data-municipality]');
        await probe.waitForFunction(() => [...document.querySelectorAll('.v3-export-actions button')].every(el => !el.disabled));
        check('all exporters enable once measured geometry arrives', await probe.$$eval('[data-municipality]', els => els.length === 556));
        check('municipal finding appears after its data arrives', await probe.$eval('.v3-finding', el => el.textContent.includes('Split') && el.textContent.includes('Solin')));
      } finally { if (release) await release.abort().catch(() => {}); await probe.close(); }
    });

    await group('Annual and cumulative grids with population fallback', async () => {
      for (const config of [{ sum: false, unit: 'abs', metric: 'tot' }, { sum: true, unit: 'abs', metric: 'all' }, { sum: true, unit: 'pct', metric: 'int' }, { sum: false, unit: 'estimate', metric: 'ext' }]) {
        await go('trends', { metric: config.metric, ...(config.sum ? { sum: '1' } : {}), ...(config.unit === 'abs' ? {} : { unit: config.unit }) });
        const cells = await page.$$eval('[data-grid-cell]', els => els.map(el => el.getAttribute('aria-label')));
        check(`every ${config.sum ? 315 : 588} grid cell matches ${config.metric}/${config.unit}`, cells.length === (config.sum ? 315 : 588) && cells.every(label => {
          const iso = findIso(label), year = Number(label.match(/(\d{4}):/)[1]);
          return number(label.slice(label.lastIndexOf(':') + 1)) === rounded(net(iso, year, config.metric, config.sum, config.unit), config.unit !== 'abs');
        }));
        await page.focus('[data-grid-cell="0"]');
        check('focused grid value has a visible exact readout', await page.evaluate(() => { const cell = document.activeElement; return document.querySelector('.v3-years-readout strong')?.textContent === cell?.getAttribute('aria-label')?.split(': ').at(-1); }));
      }
      await go('map', { year: '1998', unit: 'estimate', metric: 'ext' });
      check('missing 1998 population estimate names its 2001 fallback', await page.$eval('.v3-den-note', el => el.textContent.includes('2001')));
      await go('map', { year: '2025', unit: 'estimate', metric: 'ext' });
      check('missing 2025 population estimate names its 2024 fallback', await page.$eval('.v3-den-note', el => el.textContent.includes('2024')));
      const rows = await page.$$eval('[data-county]', els => els.map(el => [el.dataset.county, el.getAttribute('aria-label')]));
      check('all counties use the source 2024 estimate for 2025', rows.every(([iso, label]) => number(label.slice(label.lastIndexOf(':') + 1)) === rounded(net(iso, 2025, 'ext', false, 'estimate'), true)));
    });

    await group('All 15 guided findings', async () => {
      const expectedViews = ['flows', 'map', 'map', 'population', 'classify', 'regions', 'municipalities', 'map', 'map', 'map', 'map', 'map', 'trends', 'trends', 'matrix'];
      await go();
      check('all 15 findings are offered', await page.$$eval('[aria-label="Guided findings"] option', els => els.length === 16));
      for (let i = 0; i < 15; i++) {
        await page.select('[aria-label="Guided findings"]', String(i));
        await page.waitForSelector(viewSelectors[expectedViews[i]]);
        const caption = await page.$eval('.v3-finding p', el => el.textContent);
        check(`finding ${i + 1} opens its native view and caption`, caption.length > 70 && await page.$eval('[aria-label="All views"]', (el, value) => el.value === value, expectedViews[i]));
        await page.reload({ waitUntil: 'networkidle0' });
        check(`finding ${i + 1} survives a shared-URL reload`, await page.$eval('.v3-finding p', el => el.textContent) === caption);
        await navigate(expectedViews[i] === 'map' ? 'trends' : 'map');
        check(`finding ${i + 1} clears when leaving its state`, !await page.$('.v3-finding') && await page.evaluate(() => !new URLSearchParams(location.hash.slice(1)).has('finding')));
      }
    });

    await group('Native population panels and CSV', async () => {
      await go('population', { panel: 'age', year: '2017' });
      check('all external age bands match source', JSON.stringify(await page.$$eval('.v3-pop-age-table tbody tr', els => els.map(el => [el.querySelector('th').textContent, ...[...el.querySelectorAll('td')].map(td => td.textContent)]))) === JSON.stringify([...demo.ages].reverse().map((age, i) => [age, nf.format(demo.ext.o[15 - i]), nf.format(demo.ext.d[15 - i])])));
      check('age panel explicitly keeps national 2025 scope', await page.$eval('.v3-pop-scope', el => el.textContent.includes('Fixed at 2025') && el.textContent.includes('all of Croatia')));
      await page.click('.v3-pop-segment button:nth-child(2)');
      check('all internal age bands match source', JSON.stringify(await page.$$eval('.v3-pop-age-table tbody td', els => els.map(el => el.textContent))) === JSON.stringify([...demo.intm].reverse().map(n => nf.format(n))));
      await page.reload({ waitUntil: 'networkidle0' });
      check('internal age mode survives reload', await page.$eval('.v3-pop-segment button:nth-child(2)', el => el.getAttribute('aria-pressed') === 'true') && await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('age') === 'int'));
      let csv = csvRows((await download('.v3-pop-export', '.csv')).bytes.toString('utf8'));
      check('age CSV contains every age band and both sex totals', csv.length === 19 && csv.some(row => row.includes('female')));
      await go('population', { panel: 'citizenship', year: '2017' });
      check('citizenship route normalizes to its first published year', await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('year') === '2021' && document.querySelector('.v3-pop-cit-year[aria-pressed="true"]').textContent.includes('2021')));
      for (let i = 0; i < 5; i++) {
        await page.click(`.v3-pop-cit-year:nth-child(${i + 1})`);
        const rows = await page.$$eval('.v3-pop-table tbody tr', els => els.map(el => [...el.querySelectorAll('td')].map(td => td.textContent)));
        check(`citizenship ${cit.years[i]} groups match`, JSON.stringify(rows) === JSON.stringify(['hr', 'sus', 'ukr', 'eu', 'az', 'ost'].map(key => [nf.format(cit.g[key].d[i]), nf.format(cit.g[key].o[i]), nf.format(cit.g[key].d[i] - cit.g[key].o[i])])));
        check('citizenship year updates the share URL', await page.evaluate(y => new URLSearchParams(location.hash.slice(1)).get('year') === String(y), cit.years[i]));
      }
      csv = csvRows((await download('.v3-pop-export', '.csv')).bytes.toString('utf8'));
      check('citizenship CSV includes every group in all five years', csv.length === 36);
      await page.click('.v3-pop-tabs button:nth-child(3)');
      check('country residual closes both national totals', await page.$eval('.v3-pop-country-table', el => ['13,300', '10,163', '56,665', '37,485'].every(value => el.textContent.includes(value))));
      csv = csvRows((await download('.v3-pop-export', '.csv')).bytes.toString('utf8'));
      check('country CSV includes top 12, remainder and total', csv.length === 15 && csv.some(row => row.includes('Other countries')));
      await page.click('.v3-pop-tabs button:nth-child(4)');
      await page.select('.v3-pop-field select', 'HR-01');
      check('local corridors match every supplied inbound row', JSON.stringify((await page.$$eval('.v3-pop-municipal-table tbody tr td:last-child', els => els.map(el => el.textContent))).map(number)) === JSON.stringify(jls.c['HR-01'].in.map(row => row[2])));
      const controls = await page.$$('.v3-pop-controls .v3-pop-segment');
      await (await controls[1].$$('button'))[2].click();
      check('gross direction retains all supplied inbound and outbound rows', await page.$$eval('.v3-pop-municipal-table tbody tr', els => els.length) === jls.c['HR-01'].in.length + jls.c['HR-01'].out.length);
      csv = csvRows((await download('.v3-pop-export', '.csv')).bytes.toString('utf8'));
      check('local corridor CSV explicitly identifies gross measured counts', csv.slice(1).every(row => row.includes('gross_both_directions') && row.includes('measured')));
      await page.reload({ waitUntil: 'networkidle0' });
      check('population tab and county survive reload', await page.$eval('.v3-pop-tabs button:last-child', el => el.getAttribute('aria-pressed') === 'true') && await page.$eval('.v3-pop-field select', el => el.value === 'HR-01'));
      check('local gross direction survives reload', await page.$$eval('.v3-pop-municipal-table tbody tr', els => els.length) === jls.c['HR-01'].in.length + jls.c['HR-01'].out.length);
      await page.click('.v3-pop-controls .v3-pop-segment button:nth-child(2)');
      await page.reload({ waitUntil: 'networkidle0' });
      check('within-county scope survives reload with every source row', JSON.stringify((await page.$$eval('.v3-pop-municipal-table tbody tr td:last-child', els => els.map(el => el.textContent))).map(number)) === JSON.stringify(jls.c['HR-01'].loc.map(row => row[2])) && await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('local') === '1'));
    });

    await group('Dark/light responsive layouts', async () => {
      for (const theme of ['dark', 'light']) {
        await go(); await page.evaluate(theme => localStorage.setItem('atlas-v3-theme', theme), theme);
        for (const width of [320, 390, 768]) {
          await page.setViewport({ width, height: 900 });
          for (const view of views) {
            await go(view);
            check(`${theme} ${width}px ${view} has no page overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          }
        }
      }
      await page.setViewport({ width: 390, height: 900 });
      await go('population');
      for (let i = 0; i < panels.length; i++) { await page.click(`.v3-pop-tabs button:nth-child(${i + 1})`); check(`phone population ${panels[i]} has no page overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
      await capture('mobile-population');
      await page.evaluate(() => document.documentElement.style.fontSize = '200%');
      for (const view of views) { await navigate(view); check(`200% text ${view} has no page overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
      await page.evaluate(() => document.documentElement.style.fontSize = '');
      await page.setViewport({ width: 1440, height: 1050 });
    });

    await group('Standalone figures', async () => {
      await go('classify', { year: '2024' });
      const svg = await download('[aria-label="Export SVG"]', '.svg');
      const svgText = svg.bytes.toString('utf8');
      check('SVG includes study attribution, licence and embedded fonts', svgText.includes('Maras') && svgText.includes('Vinovrški') && svgText.includes('https://hrcak.srce.hr/349820') && svgText.includes('CC BY') && svgText.includes('base64,'));
      check('SVG is valid and contains all county geometry', await page.evaluate(source => { const d = new DOMParser().parseFromString(source, 'image/svg+xml'); return !d.querySelector('parsererror') && d.querySelectorAll('path').length >= 21 && +d.documentElement.getAttribute('height') > 500; }, svgText));
      const png = await download('[aria-label="Export PNG"]', '.png');
      check('PNG is a real image with useful dimensions', png.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && png.bytes.readUInt32BE(16) >= 1000 && png.bytes.readUInt32BE(20) >= 1000);
      check('PNG has visible content rather than a blank canvas', await page.evaluate(async url => { const image = new Image(); image.src = url; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100; const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, 100, 100); const data = context.getImageData(0, 0, 100, 100).data; const colors = new Set(); for (let i = 0; i < data.length; i += 4) colors.add([data[i], data[i + 1], data[i + 2]].join(',')); return colors.size > 100; }, 'data:image/png;base64,' + png.bytes.toString('base64')));
      await go('matrix', { year: '2018', dir: 'net' });
      const matrixSvg = (await download('[aria-label="Export SVG"]', '.svg')).bytes.toString('utf8');
      check('matrix SVG includes every cell and measured/IPF context', await page.evaluate(source => { const d = new DOMParser().parseFromString(source, 'image/svg+xml'); return !d.querySelector('parsererror') && d.querySelectorAll('rect').length >= 441 && source.includes('2018') && source.includes('IPF'); }, matrixSvg));
      check('temporary figure nodes are removed after export', await page.evaluate(() => ![...document.body.children].some(el => el.tagName.toLowerCase() === 'svg')));
    });
    await group('Runtime health', async () => { check('no uncaught JavaScript errors', runtimeErrors.length === 0); });
  } finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
  if (failures.length) { console.error(`\n${checks} passed; ${failures.length} PARITY GROUPS FAILED\n` + failures.join('\n')); process.exitCode = 1; }
  else console.log(`\n${checks} V3 ${process.env.PARITY_GROUP ? 'FOCUSED ' : ''}PARITY CHECKS PASS`);
})().catch(error => { console.error(error); process.exitCode = 1; });
