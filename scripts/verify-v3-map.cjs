#!/usr/bin/env node
// V3 map gestures and overlay order, driven through actual built browser assets.
// Usage: node scripts/verify-v3-map.cjs [build-directory]
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer');
const root = path.resolve(process.argv[2] || 'logs/v3-build');
const output = path.resolve('logs/v3-map-qa');
fs.mkdirSync(output, { recursive: true });
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Build directory has no index.html: ' + root);
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.json':'application/json', '.svg':'image/svg+xml' };
const server = http.createServer((req,res) => {
  const p = new URL(req.url,'http://local').pathname;
  if (p.startsWith('/_vercel/')) { res.writeHead(200, {'content-type':'text/javascript'}); res.end(''); return; }
  const f = path.resolve(root, '.' + (p === '/' ? '/index.html' : p));
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, {'content-type':mime[path.extname(f)] || 'application/octet-stream'}); res.end(fs.readFileSync(f));
});
const sleep = ms => new Promise(r => setTimeout(r,ms));
let checks = 0;
const check = (name, passed, detail) => { console.log((passed?'PASS ':'FAIL ') + name + (detail ? ' ' + JSON.stringify(detail) : '')); assert.ok(passed,name); checks++; };
(async () => {
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  const browser = await puppeteer.launch({args:['--no-sandbox','--lang=en-GB']});
  const page = await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{ if(m.type()==='error')errors.push(m.text()); });
  const origin='http://127.0.0.1:'+server.address().port;
  const go = async(hash='') => { await page.goto(origin+'/?version=v3&l=en'+hash,{waitUntil:'networkidle0'}); await page.waitForSelector('.v3-map'); await page.$eval('.v3-map',el=>{el.scrollIntoView({block:'center'});el.addEventListener('pointerdown',e=>{window.lastPointer={id:e.pointerId,target:e.target};},{capture:true});}); await sleep(150); };
  const reset=async()=>{await page.click('.v3-map-tools button:nth-child(3)');await sleep(60);};
  const matrix=()=>page.$eval('.v3-map-world',el=>{const m=el.transform.baseVal.consolidate().matrix;return {a:m.a,d:m.d,e:m.e,f:m.f};});
  const point=()=>page.$eval('.v3-map',el=>{const p=new DOMPoint(480,230).matrixTransform(el.getScreenCTM());return {x:p.x,y:p.y};});
  const countyPoint=async(iso='HR-01')=>page.$eval('[data-county="'+iso+'"]',el=>{
    const b=el.getBBox(), m=el.getScreenCTM(), pts=[];
    for(let yi=1;yi<20;yi++)for(let xi=1;xi<20;xi++){
      const p=new DOMPoint(b.x+b.width*xi/20,b.y+b.height*yi/20), s=p.matrixTransform(m);
      if(el.isPointInFill(p)&&document.elementFromPoint(s.x,s.y)===el)pts.push({x:s.x,y:s.y,d:(xi-10)**2+(yi-10)**2});
    }
    pts.sort((a,b)=>a.d-b.d); if(!pts[0])throw new Error('No visible county hit');return pts[0];
  });
  const clickCounty=async iso=>{const p=await countyPoint(iso);await page.mouse.click(p.x,p.y);await sleep(80);};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  try {
    await page.setViewport({width:1440,height:1080});await go();
    const original=await page.$$eval('[data-county]',els=>els.map(e=>[e.dataset.county,e.getAttribute('aria-label')]));
    const p=await countyPoint();await page.mouse.move(p.x,p.y);await sleep(80);
    const outline=await page.evaluate(()=>{const fill=document.querySelector('[data-county="HR-01"]'), edge=document.querySelector('[data-outline="HR-01"]');return {fills:document.querySelectorAll('[data-county]').length,above:!!(fill.compareDocumentPosition(edge)&Node.DOCUMENT_POSITION_FOLLOWING),width:getComputedStyle(edge).strokeWidth,baseWidth:getComputedStyle(fill).strokeWidth,vector:edge.getAttribute('vector-effect'),pointer:getComputedStyle(edge).pointerEvents};});
    check('hover outline is a consistent pointer-transparent layer above county fills',outline.fills===21&&outline.above&&outline.width==='2.5px'&&outline.baseWidth==='1.25px'&&outline.vector==='non-scaling-stroke'&&outline.pointer==='none',outline);
    await page.screenshot({path:path.join(output,'hover.png')});
    const cursor=await point();await page.mouse.move(cursor.x,cursor.y);
    const before=await page.evaluate(({x,y})=>{const m=document.querySelector('.v3-map-world').getScreenCTM();const p=new DOMPoint(x,y).matrixTransform(m.inverse());return {world:{x:p.x,y:p.y},scroll:scrollY};},cursor);
    await page.$eval('.v3-map',el=>el.addEventListener('wheel',e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(document.querySelector('.v3-map-world').getScreenCTM().inverse());window.wheelAnchor={world:{x:p.x,y:p.y},cursor:{x:e.clientX,y:e.clientY}};},{capture:true,once:true}));
    await page.mouse.wheel({deltaY:-200});await sleep(160);
    const after=await page.evaluate(()=>{const {world,cursor}=window.wheelAnchor;const p=new DOMPoint(world.x,world.y).matrixTransform(document.querySelector('.v3-map-world').getScreenCTM());return {distance:Math.hypot(p.x-cursor.x,p.y-cursor.y),scroll:scrollY};});
    check('real wheel zoom keeps the pointer anchor and does not scroll page',(await matrix()).a>1&&after.distance<.1&&after.scroll===before.scroll,after);
    const normalized=[];
    for(const [mode,dy]of [[0,-48],[1,-3],[2,-.2]]){await reset();const result=await page.evaluate(({mode,dy})=>{const el=document.querySelector('.v3-map'),p=new DOMPoint(410,267.5).matrixTransform(el.getScreenCTM());const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:p.x,clientY:p.y,deltaY:dy,deltaMode:mode});el.dispatchEvent(e);return {prevented:e.defaultPrevented,height:el.clientHeight};},{mode,dy});await sleep(50);normalized.push({mode,...result,m:await matrix()});}
    check('wheel line and page delta modes normalize to pixels',normalized.every(x=>x.prevented)&&Math.abs(normalized[0].m.a-normalized[1].m.a)<1e-6&&Math.abs(normalized[2].m.a-Math.exp(normalized[2].height*.2*.002))<1e-6,normalized);
    const ctrlBefore=await matrix();const ctrl=await page.$eval('.v3-map',el=>{const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-300});el.dispatchEvent(e);return e.defaultPrevented;});await sleep(30);
    check('Ctrl+wheel remains available to browser zoom',!ctrl&&same(ctrlBefore,await matrix()));
    await reset();await page.click('.v3-map-tools button:first-child');
    check('zoom buttons retain half-step behavior',(await matrix()).a===1.5);
    const start=await countyPoint();const mb=await matrix();
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+55,start.y+30,{steps:8});await sleep(70);
    const during=await page.evaluate(()=>({captured:window.lastPointer.target.hasPointerCapture(window.lastPointer.id),selected:getSelection().toString(),panning:document.querySelector('.v3-map').classList.contains('is-panning')}));
    const ma=await matrix();const factor=await page.$eval('.v3-map',el=>el.getScreenCTM().a);await page.mouse.up();await sleep(60);
    check('drag tracks responsive pixels and captures the initiating county',Math.abs((ma.e-mb.e)*factor-55)<.2&&Math.abs((ma.f-mb.f)*factor-30)<.2&&during.captured&&during.panning&&during.selected==='',during);
    check('drag never activates a county and releases capture',await page.evaluate(()=>!location.hash.includes('county=')&&!document.querySelector('.v3-map.is-panning')&&!window.lastPointer.target.hasPointerCapture(window.lastPointer.id)));
    await clickCounty('HR-03');check('a normal county click still works immediately after dragging',await page.evaluate(()=>location.hash.includes('county=HR-03')));
    await go();const unzoomed=await countyPoint();const base=await matrix();await page.mouse.move(unzoomed.x,unzoomed.y);await page.mouse.down();await page.mouse.move(unzoomed.x+40,unzoomed.y,{steps:6});await page.mouse.up();
    check('dragging at initial extent neither moves nor selects the map',same(base,await matrix())&&await page.evaluate(()=>!location.hash.includes('county=')));
    await page.click('.v3-map-tools button:first-child');const cancelPoint=await countyPoint();await page.mouse.move(cancelPoint.x,cancelPoint.y);await page.mouse.down();await page.mouse.move(cancelPoint.x+20,cancelPoint.y,{steps:3});
    await page.evaluate(()=>{const {target,id}=window.lastPointer;target.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:id}));});
    const cancelled=await matrix();await page.mouse.move(cancelPoint.x+60,cancelPoint.y,{steps:3});await page.mouse.up();
    check('pointer cancellation stops movement and prevents county activation',same(cancelled,await matrix())&&await page.evaluate(()=>!location.hash.includes('county=')&&!document.querySelector('.v3-map.is-panning')));
    await reset();await page.click('.v3-map-tools button:first-child');
    const lost=await countyPoint();await page.mouse.move(lost.x,lost.y);await page.mouse.down();await page.mouse.move(lost.x+15,lost.y,{steps:3});await page.evaluate(()=>window.lastPointer.target.releasePointerCapture(window.lastPointer.id));await page.mouse.move(lost.x+16,lost.y);await sleep(40);const lostMatrix=await matrix();await page.mouse.move(lost.x+70,lost.y);await page.mouse.up();
    check('unexpected lost capture terminates a drag cleanly',same(lostMatrix,await matrix())&&await page.evaluate(()=>!document.querySelector('.v3-map.is-panning')&&!location.hash.includes('county=')));
    await reset();for(let i=0;i<3;i++)await page.click('.v3-map-tools button:first-child');
    const boundPoint=await point();await page.mouse.move(boundPoint.x,boundPoint.y);await page.mouse.down();await page.mouse.move(3500,2500,{steps:10});await page.mouse.up();const bounded=await matrix();
    check('captured drag outside SVG cannot lose the map beyond its bounds',bounded.a===2.5&&Math.abs(bounded.e)<.1&&Math.abs(bounded.f)<.1,bounded);
    const released=await matrix();await page.mouse.move(boundPoint.x,boundPoint.y);check('release outside SVG leaves no stuck drag',same(released,await matrix()));
    await reset();check('reset restores exact centered extent',same(await matrix(),{a:1,d:1,e:0,f:0}));
    const minPoint=await point();await page.mouse.move(minPoint.x,minPoint.y);await page.mouse.wheel({deltaY:800});await sleep(80);check('wheel zoom cannot go below initial extent',same(await matrix(),{a:1,d:1,e:0,f:0}));
    await page.mouse.wheel({deltaY:-4000});await sleep(80);check('wheel zoom stops at maximum extent',(await matrix()).a===2.5&&await page.$eval('.v3-map-tools button:first-child',el=>el.disabled));await reset();
    check('navigation preserves all county data descriptions',same(original,await page.$$eval('[data-county]',els=>els.map(e=>[e.dataset.county,e.getAttribute('aria-label')]))));
    await page.click('.v3-map-tools button:nth-child(4)');
    const labels=await page.$$eval('.v3-county-labels text',els=>els.map(e=>({name:e.textContent,box:e.getBoundingClientRect().toJSON()})));
    const overlaps=labels.flatMap((a,i)=>labels.slice(i+1).filter(b=>Math.min(a.box.right,b.box.right)-Math.max(a.box.left,b.box.left)>0&&Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.top,b.box.top)>0).map(b=>[a.name,b.name]));
    check('county labels avoid collisions at the initial extent',labels.length>=12&&overlaps.length===0,{count:labels.length,overlaps});
    await page.screenshot({path:path.join(output,'county-labels.png')});
    for(let i=0;i<3;i++)await page.click('.v3-map-tools button:first-child');
    check('zoom reveals smaller county labels',await page.$$eval('.v3-county-labels text',els=>els.length)>labels.length);
    await reset();
    await page.click('.v3-map-tools button:nth-child(4)');check('labels can be turned off',await page.$('.v3-map-labels')===null);
    await page.click('.v3-map-tools button:nth-child(4)');check('city label mode returns after cycling',await page.$$eval('.v3-map-labels text',els=>els.length===7));
    await go('#explore=flows&year=2018&county=HR-21&dir=net');
    const net=await page.evaluate(()=>{const hub=document.querySelector('.v3-corridors circle');return [...document.querySelectorAll('[data-corridor]')].map(el=>({iso:el.dataset.corridor,d:el.getAttribute('d'),width:Number(el.getAttribute('stroke-width')),stroke:el.getAttribute('stroke'),marker:el.getAttribute('marker-end'),label:document.querySelector('[data-county="'+el.dataset.corridor+'"]').getAttribute('aria-label'),hub:[+hub.getAttribute('cx'),+hub.getAttribute('cy')]}));});
    const od=require('../src/data/odm.json');const yi=20;
    check('net corridors use absolute widths, signed colors and arrows toward the gaining county',net.length>0&&net.every(e=>{const n=od[e.iso]['HR-21'][yi]-od['HR-21'][e.iso][yi];const coords=e.d.match(/-?\d+(?:\.\d+)?/g).map(Number);const endpoint=n>=0?coords.slice(-2):coords.slice(0,2);return Number.isFinite(e.width)&&e.width>.8&&e.stroke===(n>=0?'var(--accent)':'var(--coral)')&&e.marker===(n>=0?'url(#v3-arrowhead)':'url(#v3-arrowhead-out)')&&e.label.includes(new Intl.NumberFormat('en-GB').format(Math.abs(n))+' net moves')&&endpoint.every((v,i)=>Math.abs(v-e.hub[i])<.001);}),{corridors:net.length});
    await go();
    const edgeWidths=[];
    for(const scale of [1,2.5]){
      if(scale>1)for(let i=0;i<3;i++)await page.click('.v3-map-tools button:first-child');
      for(const iso of ['HR-01','HR-03','HR-21']){await page.$eval('[data-county="'+iso+'"]',e=>e.focus());edgeWidths.push(await page.$eval('[data-outline="'+iso+'"]',e=>({width:getComputedStyle(e).strokeWidth,vector:e.getAttribute('vector-effect')})));}
    }
    check('selection and focus outlines retain the same non-scaling width at both zoom limits',edgeWidths.length===6&&edgeWidths.every(e=>e.width==='2.5px'&&e.vector==='non-scaling-stroke'));
    await reset();await page.$eval('[data-county="HR-03"]',e=>e.focus());await page.keyboard.press('Enter');check('keyboard county selection remains available',await page.evaluate(()=>location.hash.includes('county=HR-03')));
    await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await go();
    const touchPoint=await point();const cdp=await page.createCDPSession();
    const touches=d=>[{x:touchPoint.x-d,y:touchPoint.y,id:0},{x:touchPoint.x+d,y:touchPoint.y,id:1}];
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches(35)});
    for(let d=40;d<=56;d+=4){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(d)});await sleep(20);}
    const pinch=await matrix();await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);
    check('real two-finger pinch zooms and ends without selecting a county',Math.abs(pinch.a-1.6)<.01&&await page.evaluate(()=>!location.hash.includes('county=')&&!document.querySelector('.v3-map.is-panning')),pinch);
    await reset();const tap=await countyPoint('HR-03');await page.touchscreen.tap(tap.x,tap.y);await sleep(100);check('touch tap still selects the intended county',await page.evaluate(()=>location.hash.includes('county=HR-03')));
    await go();await page.click('.v3-map-tools button:first-child');const mobile=await point();const mobileBefore=await matrix();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mobile.x,y:mobile.y,id:0}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mobile.x+30,y:mobile.y+20,id:0}]});await sleep(60);const mobileAfter=await matrix();await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    check('single-finger touch pans and cancellation clears gesture',!same(mobileBefore,mobileAfter)&&await page.evaluate(()=>!document.querySelector('.v3-map.is-panning')&&!location.hash.includes('county=')));
    await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    const revealed=[];
    for(const kind of ['county','municipality']){
      if(kind==='municipality'){
        await page.select('.v3-explore-controls select','municipalities');
        await page.waitForFunction(()=>document.querySelectorAll('[data-municipality]').length===556);
        await page.$eval('.v3-map',e=>e.scrollIntoView({block:'center'}));
        const p=await point();await page.mouse.move(p.x,p.y);await page.mouse.wheel({deltaY:-160});await sleep(100);
        check('municipal wheel listener works after navigation and asynchronous geometry load',(await matrix()).a>1);
      }
      await reset();for(let i=0;i<3;i++)await page.click('.v3-map-tools button:first-child');
      await page.keyboard.press('Tab');
      const hidden=await page.evaluate(kind=>{
        const clip=document.querySelector('.v3-map').getBoundingClientRect();
        const target=[...document.querySelectorAll('[data-'+kind+']')].find(e=>{const r=e.getBoundingClientRect();return r.right<=clip.left||r.left>=clip.right||r.bottom<=clip.top||r.top>=clip.bottom;});
        if(!target)return null;const id=target.getAttribute('data-'+kind);target.focus();return id;
      },kind);
      await sleep(100);
      const visible=hidden&&await page.evaluate(({kind,id})=>{
        const e=document.querySelector('[data-'+kind+'="'+id+'"]'),r=e.getBoundingClientRect(),clip=document.querySelector('.v3-map').getBoundingClientRect();
        return document.activeElement===e&&r.right>clip.left&&r.left<clip.right&&r.bottom>clip.top&&r.top<clip.bottom;
      },{kind,id:hidden});
      revealed.push({kind,hidden,visible,zoom:(await matrix()).a});
    }
    check('keyboard focus reveals counties and municipalities outside a zoomed viewport',revealed.every(r=>r.hidden&&r.visible&&r.zoom===1),revealed);
    check('interaction runs without browser errors',errors.length===0,errors);
    console.log('TOTAL '+checks+' checks passed');
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

