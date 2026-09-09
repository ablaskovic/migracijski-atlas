#!/usr/bin/env node
// Mobile table behavior: real touch selection, readable context and text zoom.
// node scripts/verify-v3-tables.cjs [logs/v3-build | http://127.0.0.1:5173]
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer');
const input = process.argv[2] || 'logs/v3-build';
const output = path.resolve('logs/v3-tables');
fs.mkdirSync(output, { recursive: true });
const cases = [['trends', '', '.v3-years-scroll'], ['matrix', '', '.v3-matrix-scroll'], ['population', 'countries', '.v3-pop-table-scroll'], ['population', 'citizenship', '.v3-pop-table-scroll'], ['population', 'municipal', '.v3-pop-table-scroll'], ['population', 'age', '.v3-pop-table-scroll']];
let browser, server, page, origin, count = 0, sequence = 0;
const errors = [], failures = [];
const check = (title, valid) => { assert.ok(valid, title); count++; console.log('  ok ' + title); };
const group = async (title, callback) => { if (process.env.TABLE_GROUP && !new RegExp(process.env.TABLE_GROUP, 'i').test(title)) return; console.log('\n' + title); try { await callback(); } catch (error) { failures.push(title + ': ' + error.message); console.error('  FAIL ' + error.stack); } };

async function boot() {
  if (/^https?:\/\//.test(input)) origin = input.replace(/\/$/, '');
  else {
    const root = path.resolve(input);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
    server = http.createServer((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname.startsWith('/_vercel/')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(''); }
      let file = path.resolve(root, '.' + decodeURIComponent(pathname));
      if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end(); }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  }
  browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => request.url().includes('/_vercel/') ? request.respond({ status: 200, contentType: 'text/javascript', body: '' }) : request.continue());
}
async function go(view, panel, lang = 'en', zoom = 100) {
  const hash = new URLSearchParams({ explore: view, year: '2025', metric: 'tot', l: lang, panel, ...(panel === 'municipal' ? { county: 'HR-01' } : {}) });
  await page.goto(`${origin}/?version=v3&l=${lang}&tableTest=${++sequence}#${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.v3-table-frame');
  await page.evaluate(async zoom => { document.documentElement.style.fontSize = zoom + '%'; await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }, zoom);
}
async function screenshot(name) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getTiming().iterations)).map(animation => animation.finished.catch(() => {}))));
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: false });
}

(async () => {
  try {
    await boot();
    for (const [width, height] of [[320, 800], [390, 844], [667, 375], [768, 1024]]) {
      await page.setViewport({ width, height, isMobile: true, hasTouch: true });
      for (const lang of ['hr', 'en']) for (const zoom of [100, 200]) {
        await group(`${width}×${height} ${lang} ${zoom}% text`, async () => {
          for (const [view, panel, selector] of cases) {
            await go(view, panel, lang, zoom);
            const state = await page.evaluate(selector => {
              const pane = document.querySelector(selector);
              const rect = pane.getBoundingClientRect();
              const table = pane.querySelector('table');
              const header = table.querySelector('thead th');
              const cell = pane.querySelector('[data-grid-cell],[data-matrix-cell]');
              const hint = pane.parentElement.querySelector('.v3-table-scroll-hint');
              return { page: document.documentElement.scrollWidth, viewport: innerWidth, pane: rect.width, paneHeight: rect.height, viewportHeight: innerHeight,
                overflow: pane.scrollWidth > pane.clientWidth + 1, hint: !!hint, header: getComputedStyle(header).position,
                cell: cell ? { width: cell.getBoundingClientRect().width, height: cell.getBoundingClientRect().height } : null,
                clippedControls: [...document.querySelectorAll('.v3-pop-tabs button,.v3-pop-segment button,.v3-pop-cit-totals span,.v3-pop-export')].filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => el.textContent) };
            }, selector);
            check(`${view}/${panel || 'grid'} stays within the phone and explains actual horizontal overflow`, state.page <= state.viewport && state.pane <= state.viewport && state.hint === state.overflow);
            check(`${view}/${panel || 'grid'} keeps headers and controls readable`, state.header === 'sticky' && state.paneHeight <= state.viewportHeight * .63 + 2 && state.clippedControls.length === 0);
            if (state.cell) check(`${view} touch cells are at least 44×44`, state.cell.width >= 43.9 && state.cell.height >= 43.9);
          }
        });
      }
    }

    await group('Sticky context after horizontal and vertical scrolling', async () => {
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      for (const [view, panel, selector] of cases.filter(([, panel]) => panel !== 'age')) {
        await go(view, panel);
        await page.$eval(selector, pane => { pane.scrollIntoView({ block: 'center' }); pane.scrollLeft = pane.scrollWidth; pane.scrollTop = 160; });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        const anchored = await page.$eval(selector, pane => {
          const frame = pane.getBoundingClientRect(), table = pane.querySelector('table');
          const firstColumn = table.querySelector('tbody th').getBoundingClientRect();
          const heading = table.querySelector('thead th').getBoundingClientRect();
          return { x: Math.abs(firstColumn.left - frame.left), y: Math.abs(heading.top - frame.top), background: getComputedStyle(table.querySelector('tbody th')).backgroundColor };
        });
        check(`${view}/${panel || 'grid'} preserves county/country and column context`, anchored.x < 5 && anchored.y < 5 && anchored.background !== 'rgba(0, 0, 0, 0)');
      }
    });

    await group('Touch and keyboard can reach exact values', async () => {
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await go('trends', '');
      await page.focus('[data-grid-cell="0"]'); await page.keyboard.press('End');
      check('keyboard reaches the final year without hiding it behind sticky names', await page.evaluate(() => {
        const el = document.activeElement, pane = document.querySelector('.v3-years-scroll'), r = el.getBoundingClientRect(), p = pane.getBoundingClientRect(), label = pane.querySelector('tbody th').getBoundingClientRect();
        return el.dataset.gridCell === '27' && r.left >= label.right - 1 && r.right <= p.right + 1;
      }));
      await page.$eval('[data-grid-cell="27"]', el => el.scrollIntoView({ block: 'center', inline: 'center' }));
      await page.tap('[data-grid-cell="27"]');
      await page.waitForFunction(() => !!document.querySelector('.v3-years-readout strong'));
      check('touch selection reveals the exact year-grid value on screen', await page.$eval('.v3-years-readout', el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 2; }));
      await screenshot('phone-year-value');
      await go('matrix', '');
      await page.$eval('[data-matrix-cell="1"]', el => el.scrollIntoView({ block: 'center', inline: 'center' }));
      await page.tap('[data-matrix-cell="1"]');
      await page.waitForFunction(() => document.activeElement?.id === 'v3-pair-title');
      check('touch matrix selection reveals and focuses both directions', await page.$eval('#v3-pair-title', el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 2; }));
      await page.click('[aria-label="Close corridor"]');
      await page.waitForFunction(() => document.activeElement?.dataset.matrixCell === '1');
      check('closing pair detail returns to a visible cell beside its row label', await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(), pane = document.querySelector('.v3-matrix-scroll').getBoundingClientRect(), label = document.querySelector('.v3-matrix tbody th').getBoundingClientRect(); return r.left >= label.right - 1 && r.top >= pane.top && r.bottom <= pane.bottom + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; }));
      for (const lang of ['hr', 'en']) {
        await go('matrix', '', lang, 200);
        await page.$eval('[data-matrix-cell="1"]', el => el.scrollIntoView({ block: 'center', inline: 'center' }));
        await page.tap('[data-matrix-cell="1"]'); await page.waitForSelector('.v3-pair-stats');
        check(`${lang} 200% pair numbers remain readable without clipping`, await page.$$eval('.v3-pair-stats strong', els => els.every(el => el.scrollWidth <= el.clientWidth + 1)));
        await page.click('.v3-pair summary');
        check(`${lang} annual pair table is named and scrollable by keyboard`, await page.$eval('.v3-pair .v3-table-scroll', el => el.tabIndex === 0 && !!el.getAttribute('aria-label') && getComputedStyle(el.querySelector('thead th')).position === 'sticky'));
      }
      await screenshot('phone-pair-large-text');
    });

    await group('Native horizontal swipes preserve selection', async () => {
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      const client = await page.createCDPSession();
      for (const [view, , selector] of cases.slice(0, 2)) {
        await go(view, '');
        const before = await page.$eval(selector, pane => { pane.scrollIntoView({ block: 'center' }); const r = pane.getBoundingClientRect(); return { hash: location.hash, x: r.left + r.width * .8, y: r.top + r.height * .6 }; });
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: before.x, y: before.y }] });
        for (let step = 1; step <= 10; step++) { await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: before.x - step * 15, y: before.y }] }); await new Promise(resolve => setTimeout(resolve, 25)); }
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const after = await page.$eval(selector, pane => ({ left: pane.scrollLeft, hash: location.hash }));
        check(`${view} swipes scroll the table without selecting a cell`, after.left > 20 && after.hash === before.hash);
      }
      await client.detach();
    });

    await group('Rotation and light theme update scroll guidance', async () => {
      await page.setViewport({ width: 320, height: 800, isMobile: true, hasTouch: true });
      await go('population', 'countries');
      check('narrow country table shows its scroll hint', await page.$eval('.v3-pop-table-scroll', el => !!el.parentElement.querySelector('.v3-table-scroll-hint')));
      await page.setViewport({ width: 768, height: 1024, isMobile: true, hasTouch: true });
      await page.waitForFunction(() => { const el = document.querySelector('.v3-pop-table-scroll'); return (el.scrollWidth > el.clientWidth + 1) === !!el.parentElement.querySelector('.v3-table-scroll-hint'); });
      check('rotation removes the hint once all columns fit', await page.$eval('.v3-pop-table-scroll', el => el.scrollWidth <= el.clientWidth + 1 && !el.parentElement.querySelector('.v3-table-scroll-hint')));
      await page.click('[aria-label="Light theme"]');
      check('light sticky labels remain opaque', await page.$eval('.v3-pop-table tbody th', el => getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)'));
      await page.$eval('.v3-pop-table-scroll', el => el.scrollIntoView({ block: 'center' }));
      await screenshot('tablet-light-countries');
    });
    check('no uncaught runtime errors', errors.length === 0);
  } finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
  if (failures.length) { console.error(`\n${count} passed; ${failures.length} MOBILE TABLE GROUPS FAILED\n${failures.join('\n')}`); process.exitCode = 1; }
  else console.log(`\n${count} ${process.env.TABLE_GROUP ? 'FOCUSED ' : ''}V3 MOBILE TABLE CHECKS PASS`);
})().catch(error => { console.error(error); process.exitCode = 1; });
