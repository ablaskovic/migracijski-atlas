import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { D, ISOS, IX2011, IX2018, YEARS, flowOf, val } from '../lib/metrics.ts';
import { setLang, storeLang } from '../lib/i18n.ts';
import { REPO, sources } from '../lib/licences.ts';
import { dropHash } from '../lib/privacy.ts';
import VersionSwitch from '../VersionSwitch.tsx';
import { rememberVersion, versionHref } from '../version.ts';
import { FLOWS, colors, countyName, domain, downloadFile, ranked, readState, stateHash, totals, value, type AtlasState, type Explore } from './model.ts';
import Icon from './Icon.tsx';
import MapCanvas from './MapCanvas.tsx';
import TrendChart from './TrendChart.tsx';
import YearsGrid from './YearsGrid.tsx';
import CountyPanel from './CountyPanel.tsx';
import About from './About.tsx';
import './v3.css';

const initial = readState();
setLang(initial.lang);

export default function AppV3() {
  const [s, setS] = useState(initial);
  const [light, setLight] = useState(() => { try { return localStorage.getItem('atlas-v3-theme') === 'light'; } catch { return false; } });
  const [hover, setHover] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const direction = s.dir;
  const [notice, setNotice] = useState('');
  const [sharing, setSharing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const state = useRef(s); state.current = s;
  const L = (hr: string, en: string) => s.lang === 'hr' ? hr : en;
  const nf = new Intl.NumberFormat(s.lang === 'hr' ? 'hr-HR' : 'en-GB');
  const format = (n: number, relative = false) => {
    const f = new Intl.NumberFormat(s.lang === 'hr' ? 'hr-HR' : 'en-GB', { minimumFractionDigits: relative ? 1 : 0, maximumFractionDigits: relative ? 1 : 0 });
    const abs = f.format(Math.abs(n));
    return (abs === f.format(0) ? '' : n > 0 ? '+' : '−') + abs + (relative ? ' %' : '');
  };
  const metricNames = { tot: L('Saldo migracija', 'Net migration'), int: L('Unutarnje', 'Internal'), ext: L('Vanjske', 'External'), nat: L('Prirodni prirast', 'Natural change'), all: L('Migracije + prirast', 'Migration + natural change') };
  const metricFull = { tot: L('Migracijski saldo', 'Net migration'), int: L('Unutarnji migracijski saldo', 'Net internal migration'), ext: L('Vanjski migracijski saldo', 'Net external migration'), nat: L('Prirodni prirast', 'Natural change'), all: L('Migracije + prirodni prirast', 'Migration + natural change') };
  const title = s.county ? countyName(s.county, s.lang) : L('Hrvatska u pokretu.', 'Croatia in motion.');
  const period = s.cum ? `2011–${YEARS[s.yi]}` : String(YEARS[s.yi]);
  const current = totals(s);
  const winners = ISOS.filter(iso => val(iso, s.yi, 'tot', 'abs', s.cum) > 0).length;
  const order = ranked(s);
  const hub = s.county ?? 'HR-21';
  const estimated = s.view === 'flows' && (s.cum || s.yi !== IX2018);
  const max = domain(s);
  const color = colors(max, light);
  const ramp = `linear-gradient(90deg,${Array.from({ length: 21 }, (_, i) => `${color(-max + i / 10 * max)} ${i * 5}%`).join(',')})`;

  function update(patch: Partial<AtlasState>, replace = false) {
    const next = { ...state.current, ...patch };
    if (next.view === 'trends') next.cum = false;
    if (next.cum && next.yi < IX2011) next.yi = IX2011;
    setLang(next.lang); state.current = next; setS(next); setHover(null);
    const url = new URL(location.href); url.hash = stateHash(next); url.searchParams.set('version', 'v3');
    if (url.searchParams.has('l')) url.searchParams.set('l', next.lang);
    if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState'](null, '', url);
  }
  function selectView(view: Explore) {
    setPlaying(false);
    update(view === 'flows' && s.view !== 'flows' ? { view, yi: IX2018, cum: false } : { view });
  }
  useEffect(() => {
    const url = new URL(location.href); url.hash = stateHash(state.current);
    history.replaceState(null, '', url);
    const pop = () => {
      const next = readState(); setLang(next.lang); setS(next); state.current = next; setPlaying(false); setHover(null);
      const url = new URL(location.href); url.hash = stateHash(next); history.replaceState(null, '', url);
    };
    window.addEventListener('popstate', pop); window.addEventListener('hashchange', pop);
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('hashchange', pop); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset['theme'] = light ? 'light' : 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f3f6f7' : '#0c131b');
    try { localStorage.setItem('atlas-v3-theme', light ? 'light' : 'dark'); } catch { /* Optional preference. */ }
  }, [light]);
  useEffect(() => { document.title = (s.lang === 'hr' ? 'Migracijski atlas' : 'Migration atlas') + ' · ' + title + ' · ' + period; }, [s.lang, title, period]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = state.current.yi + 1;
      if (next >= YEARS.length) { setPlaying(false); return; }
      update({ yi: next }, true);
    }, 900);
    const pauseHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pauseHidden);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', pauseHidden); };
  }, [playing]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && !dialog.current?.open) { setPlaying(false); if (sharing) closeSharing(); else if (state.current.county) inspectCounty(null); } };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [sharing]);
  async function share() {
    try { await navigator.clipboard.writeText(location.href); setNotice(L('Poveznica je kopirana.', 'Link copied to clipboard.')); }
    catch { setSharing(true); }
  }
  function closeSharing() {
    setSharing(false);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.v3-share')?.focus());
  }
  function exportCSV() {
    const rows = s.view === 'flows' ? [
      ['Origin ISO', 'Origin', 'Destination ISO', 'Destination', 'From year', 'To year', 'People', 'Method', 'Source'],
      ...ISOS.filter(iso => iso !== hub).map(iso => {
        const from = direction === 'in' ? iso : hub, to = direction === 'in' ? hub : iso;
        return [from, D[from].n, to, D[to].n, s.cum ? 2011 : YEARS[s.yi], YEARS[s.yi], flowOf(hub, direction, iso, s.yi, s.cum), estimated ? 'IPF estimate: 2018 structure scaled to CBS out-margins; in-margins approximate' : 'Measured 2018', 'Pitoski et al. 2021, CC BY 4.0, doi.org/10.1186/s40649-021-00093-0; DZS / CBS'];
      }),
    ] : s.view === 'trends' ? [
      ['County ISO', 'County', 'Year', 'Metric', 'Unit', 'Value', 'Source'],
      ...ISOS.flatMap(iso => YEARS.map((year, yi) => [iso, D[iso].n, year, s.flow, s.relative ? '% of 2011 census' : 'people', value(iso, { ...s, yi, cum: false }), 'DZS / CBS: podaci.dzs.hr'])),
    ] : [
      ['County ISO', 'County', 'From year', 'To year', 'Metric', 'Unit', 'Value', 'Source'],
      ...order.map(iso => [iso, D[iso].n, s.cum ? 2011 : YEARS[s.yi], YEARS[s.yi], s.flow, s.relative ? '% of 2011 census' : 'people', value(iso, s), 'DZS / CBS: podaci.dzs.hr']),
    ];
    downloadFile('\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n'), 'text/csv;charset=utf-8', `atlas-${s.view === 'trends' ? `${YEARS[0]}-${YEARS[YEARS.length - 1]}` : period}-${s.view === 'flows' ? `flows-${direction}` : s.flow}.csv`);
    setNotice(L('Podaci su izvezeni u CSV.', 'Data exported as CSV.'));
  }
  function showAbout() { setPlaying(false); dialog.current?.showModal(); }

  function inspectCounty(county: string | null) {
    const previous = state.current.county, view = state.current.view;
    update({ county });
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement | SVGElement>(view === 'flows' ? '.v3-hub-label select' : county ? '.v3-county-detail h2' : `[data-county="${previous}"]`);
      target?.focus({ preventScroll: true });
      if (county && view !== 'flows' && window.matchMedia('(max-width:720px)').matches) document.querySelector('.v3-county-panel')?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' });
    });
  }

  const timeline = <div className="v3-timeline"><button className="v3-play" aria-label={playing ? L('Zaustavi animaciju', 'Pause animation') : L('Pokreni animaciju godina', 'Play years')} aria-pressed={playing} onClick={() => { if (!playing && s.yi === YEARS.length - 1) update({ yi: s.cum ? IX2011 : 0 }); setPlaying(!playing); }}><Icon name={playing ? 'pause' : 'play'} size={17} /></button><div className="v3-year-input"><label htmlFor="v3-year">{L('GODINA', 'YEAR')}</label><select id="v3-year" value={s.yi} onChange={e => { setPlaying(false); update({ yi: Number(e.target.value) }); }}>{YEARS.map((y, i) => (!s.cum || i >= IX2011) && <option key={y} value={i}>{y}</option>)}</select></div><div className="v3-slider-wrap"><input aria-label={L('Odaberite godinu', 'Select year')} aria-valuetext={String(YEARS[s.yi])} type="range" min={s.cum ? IX2011 : 0} max={YEARS.length - 1} value={s.yi} onChange={e => { setPlaying(false); update({ yi: Number(e.target.value) }, true); }} style={{ '--progress': `${(s.yi - (s.cum ? IX2011 : 0)) / (YEARS.length - 1 - (s.cum ? IX2011 : 0)) * 100}%` } as CSSProperties} /><div className="v3-year-ticks">{[s.cum ? 2011 : YEARS[0], s.cum ? 2015 : 2005, s.cum ? 2020 : 2015, YEARS[YEARS.length - 1]].map(y => <span key={y} style={{ left: `${(y - (s.cum ? 2011 : YEARS[0])) / (YEARS[YEARS.length - 1] - (s.cum ? 2011 : YEARS[0])) * 100}%` }}>{y}</span>)}</div></div><div className="v3-time-mode" role="group" aria-label={L('Vremensko razdoblje', 'Time window')}><button aria-pressed={!s.cum} onClick={() => update({ cum: false })}>{L('Godišnje', 'Annual')}</button><button aria-pressed={s.cum} disabled={s.view === 'trends'} onClick={() => update({ cum: true })}>{L('Zbroj od 2011.', 'Total since 2011')}</button></div></div>;
  const navLabels = [L('Karta', 'Map'), L('Trendovi', 'Trends'), L('Tokovi', 'Flows')];
  const viewIcon = (v: Explore) => v === 'map' ? 'map' as const : v === 'trends' ? 'trend' as const : 'flow' as const;
  return <div className="v3-app" style={{ '--ramp': ramp } as CSSProperties}>
    <a className="v3-skip" href="#v3-explorer" onClick={e => { e.preventDefault(); document.getElementById('v3-explorer')?.focus(); }}>{L('Preskoči na istraživanje', 'Skip to exploration')}</a>
    <header className="v3-header">
      <a className="v3-brand" href="?version=v3" aria-label={L('Migracijski atlas — početni prikaz', 'Migration atlas — reset view')}><span className="v3-brand-symbol"><Icon name="map" size={25} /></span><span>{L('migracijski', 'migration')}<strong>atlas<span className="v3-brand-period">.</span></strong></span></a>
      <span className="v3-header-caption">{L('HRVATSKA', 'CROATIA')}<span />1998—2025</span>
      <div className="v3-header-actions"><VersionSwitch version="v3" />
        <div className="v3-language" role="group" aria-label={L('Jezik', 'Language')}>{(['hr', 'en'] as const).map(l => <button key={l} aria-pressed={s.lang === l} onClick={() => { storeLang(l); update({ lang: l }); }}>{l.toUpperCase()}</button>)}</div>
        <button className="v3-icon-button" aria-label={light ? L('Tamni prikaz', 'Dark theme') : L('Svijetli prikaz', 'Light theme')} title={light ? L('Tamni prikaz', 'Dark theme') : L('Svijetli prikaz', 'Light theme')} onClick={() => setLight(!light)}><Icon name={light ? 'moon' : 'sun'} size={19} /></button>
        <button aria-label={L('Podijeli prikaz', 'Share this view')} className="v3-button v3-share" onClick={() => void share()}><Icon name="share" size={16} /><span>{L('Podijeli', 'Share')}</span></button>
      </div>
    </header>
    <div className="v3-layout">
      <nav className="v3-sidebar" aria-label={L('Glavna navigacija', 'Main navigation')}>
        <span className="v3-side-index">A / 03</span>
        {(['map', 'trends', 'flows'] as const).map((v, i) => <button key={v} className={s.view === v ? 'is-active' : ''} aria-current={s.view === v ? 'page' : undefined} onClick={() => selectView(v)}><Icon name={viewIcon(v)} /><span>{navLabels[i]}</span></button>)}
        <div className="v3-side-bottom"><button onClick={showAbout}><Icon name="info" /><span>{L('O atlasu', 'About')}</span></button><span className="v3-side-coordinate">45° N<br />16° E</span></div>
      </nav>
      <main id="v3-explorer" tabIndex={-1}>
        <section className="v3-intro"><div><div className="v3-eyebrow"><span className="v3-live-dot" />{L('ATLAS MIGRACIJA', 'MIGRATION ATLAS')}<span className="v3-eyebrow-divider">/</span>{s.county ? L('ŽUPANIJA', 'COUNTY') : L('NACIONALNI PREGLED', 'NATIONAL OVERVIEW')}</div>
          <h1>{title}</h1><p>{L('Ljudi, mjesta i promjene. Istražite migracije kroz 28 godina.', 'People, places, and change. Explore 28 years of migration.')}</p></div>
          <div className="v3-period"><span>{s.cum ? L('RAZDOBLJE', 'PERIOD') : L('GODINA', 'YEAR')}</span><strong>{period}</strong>{s.county && <button onClick={() => update({ county: null })}>{L('Cijela Hrvatska', 'All Croatia')} <Icon name="close" size={13} /></button>}</div>
        </section>
        <section className="v3-stats" aria-label={L('Pregled podataka', 'Key figures')}>
          <article className="v3-stat v3-stat-primary"><div className="v3-stat-label">{s.county ? L('Migracijski saldo', 'Net migration') : L('Vanjski migracijski saldo', 'Net external migration')}<Icon name="flow" size={17} /></div><strong className={current.net < 0 ? 'v3-negative' : ''} data-stat="net">{format(current.net)}</strong><span>{L('doseljeni − odseljeni', 'arrivals − departures')} · {period}</span></article>
          <article className="v3-stat"><div className="v3-stat-label">{L('Doseljeni iz inozemstva', 'Arrivals from abroad')}<span className="v3-stat-arrow">↙</span></div><strong data-stat="arrivals">{nf.format(current.arrivals)}</strong><span>{L('registriranih doseljenja', 'registered arrivals')} · {period}</span></article>
          <article className="v3-stat"><div className="v3-stat-label">{L('Odseljeni u inozemstvo', 'Departures abroad')}<span className="v3-stat-arrow is-coral">↗</span></div><strong data-stat="departures">{nf.format(current.departures)}</strong><span>{L('registriranih odseljenja', 'registered departures')} · {period}</span></article>
          <article className="v3-stat"><div className="v3-stat-label">{s.county ? L('Unutarnji migracijski saldo', 'Net internal migration') : L('Županije s pozitivnim saldom', 'Counties with net gains')}<Icon name="map" size={17} /></div><strong data-stat="counties">{s.county ? format(val(s.county, s.yi, 'int', 'abs', s.cum)) : <>{winners}<small> / 21</small></>}</strong><span>{s.county ? L('preseljenja između županija', 'moves between counties') : L('više doseljenih nego odseljenih', 'more arrivals than departures')}</span></article>
        </section>
        <section className="v3-workspace" aria-label={L('Istraživanje podataka', 'Explore the data')}>
          <div className="v3-toolbar"><div className="v3-tabs" role="group" aria-label={L('Prikaz', 'View')}>{(['map', 'trends', 'flows'] as const).map((v, i) => <button key={v} className={s.view === v ? 'is-active' : ''} aria-pressed={s.view === v} onClick={() => selectView(v)}><Icon name={viewIcon(v)} size={17} /><span className="v3-tab-long">{[L('Istraži kartu', 'Explore map'), L('Kroz godine', 'Through the years'), L('Migracijski tokovi', 'Migration flows')][i]}</span><span className="v3-tab-short">{navLabels[i]}</span></button>)}</div><button className="v3-export" onClick={exportCSV}><Icon name="download" size={16} />CSV</button></div>
          <div className="v3-filters">{s.view === 'flows' ? <><span className={'v3-data-badge' + (estimated ? ' is-estimate' : '')}><span />{estimated ? L('IPF PROCJENA', 'IPF ESTIMATE') : L('IZMJERENO · 2018.', 'MEASURED · 2018')}</span><div className="v3-segment" role="group" aria-label={L('Smjer migracija', 'Migration direction')}>{(['in', 'out'] as const).map(d => <button key={d} aria-pressed={direction === d} onClick={() => update({ dir: d })}>{d === 'in' ? L('Doseljavanje', 'Arrivals') : L('Odseljavanje', 'Departures')}</button>)}</div><label className="v3-hub-label">{L('Županija', 'County')}<select value={hub} onChange={e => update({ county: e.target.value })}>{ISOS.map(i => <option key={i} value={i}>{countyName(i, s.lang)}</option>)}</select></label></> : <><div className="v3-metrics" role="group" aria-label={L('Sastavnica', 'Component')}>{FLOWS.map(f => <button key={f} aria-pressed={s.flow === f} onClick={() => update({ flow: f })}>{metricNames[f]}</button>)}</div><label className="v3-unit"><span className="v3-sr">{L('Jedinica', 'Unit')}</span><select aria-label={L('Jedinica', 'Unit')} value={s.relative ? 'pct' : 'people'} onChange={e => update({ relative: e.target.value === 'pct' })}><option value="people">{L('Broj osoba', 'People')}</option><option value="pct">{L('% popisa 2011.', '% of 2011 census')}</option></select></label></>}</div>
          {s.view === 'trends' ? <div className="v3-trends-view"><div className="v3-section-heading"><div><span className="v3-eyebrow">1998—2025</span><h2>{s.county ? countyName(s.county, s.lang) : L('Kada se smjer promijenio?', 'When did the direction change?')}</h2><p>{s.county ? metricFull[s.flow] : L('Vanjski migracijski saldo Hrvatske', 'Croatia’s net external migration')} · {L('godišnji broj osoba', 'annual number of people')}</p></div>{s.county && <button className="v3-button" onClick={() => update({ county: null })}>{L('Cijela Hrvatska', 'All Croatia')}</button>}</div>
            <TrendChart s={s} onYear={yi => { setPlaying(false); update({ yi, cum: false }); }} />
            <div className="v3-section-heading"><div><h3>{L('Svaka županija. Svaka godina.', 'Every county. Every year.')}</h3><p>{metricFull[s.flow]} · {s.relative ? L('% stanovništva prema popisu 2011.', '% of 2011 census population') : L('godišnji broj osoba', 'annual number of people')} · {L('Odaberite ćeliju za detalje.', 'Select a cell to inspect.')}</p></div><span className="v3-mini-legend"><i />{L('gubitak', 'loss')}<i />{L('dobitak', 'gain')}</span></div>
            <YearsGrid s={s} light={light} onPick={(county, yi) => update({ county, yi, cum: false })} />
            {(s.flow === 'tot' || s.flow === 'int' || s.flow === 'all') && <p className="v3-data-note">{L('Prije 2007. zbrojevi doseljenih i odseljenih između županija ne podudaraju se u potpunosti.', 'Before 2007, inter-county arrivals and departures do not fully balance.')}</p>}
          {timeline}</div> : <div className="v3-map-layout"><div className="v3-map-column"><div className="v3-map-heading"><div><h2>{s.view === 'flows' ? countyName(hub, s.lang) : metricFull[s.flow]}</h2><span>{s.view === 'flows' ? direction === 'in' ? L('Odakle ljudi dolaze?', 'Where do people arrive from?') : L('Kamo ljudi odlaze?', 'Where do people move to?') : (s.relative ? L('% stanovništva prema popisu 2011.', '% of 2011 census population') : L('broj osoba', 'number of people'))}<span className="v3-middle-dot">·</span>{period}</span></div><span className="v3-map-meta">{s.view === 'flows' ? '20' : '21'} {s.view === 'flows' ? L('KORIDORA', 'CORRIDORS') : L('ŽUPANIJA', 'COUNTIES')}</span></div>
              <MapCanvas s={s} light={light} hover={hover} onHover={setHover} onSelect={county => inspectCounty(s.county === county && s.view !== 'flows' ? null : county)} format={format} direction={direction} />
              <div className="v3-legend">{s.view === 'flows' ? <><span className="v3-flow-key" /><span>{L('Debljina linije = broj preseljenja. Koridori ispod 5 osoba nisu ucrtani.', 'Line width = number of moves. Corridors under 5 people are not drawn.')}</span></> : <><span>{L('Gubitak', 'Loss')}</span><div className="v3-color-key"><div /><span>{format(-max, s.relative)}</span><span>0</span><span>{format(max, s.relative)}</span></div><span>{L('Dobitak', 'Gain')}</span></>}</div>
              {s.view === 'flows' && <p className="v3-data-note">{estimated ? L('Procjena: struktura 2018. skalirana na DZS odseljene; doseljeni približno. Samo godišnja 2018. je izmjerena.', 'Estimate: 2018 structure scaled to CBS out-margins; in-margins approximate. Only annual 2018 is measured.') : L('Izmjereni tokovi između županija · Pitoski i sur. (2021.), CC BY 4.0.', 'Measured inter-county flows · Pitoski et al. (2021), CC BY 4.0.')}</p>}
            {timeline}</div><CountyPanel s={s} hover={hover} setHover={setHover} selectView={selectView} direction={direction} format={format} metricFull={metricFull} inspectCounty={inspectCounty} />
          </div>}

          {s.yi < YEARS.indexOf(2007) && !s.cum && (s.flow === 'tot' || s.flow === 'int' || s.flow === 'all') && <p className="v3-data-note v3-window-note">{L('Prije 2007. zbrojevi doseljenih i odseljenih između županija ne podudaraju se u potpunosti.', 'Before 2007, inter-county arrivals and departures do not fully balance.')}</p>}
        </section>
        <section className="v3-discover" aria-label={L('Polazišta za istraživanje', 'Ways to explore')}><div className="v3-discover-title"><span className="v3-eyebrow">{L('POGLEDAJTE POBLIŽE', 'TAKE A CLOSER LOOK')}</span><h2>{L('Iza svakog broja, promjena.', 'A changing story in every number.')}</h2></div><button onClick={() => { setPlaying(false); update({ view: 'trends', county: null, flow: 'ext', cum: false, yi: YEARS.indexOf(2022) }); }}><span className="v3-discover-number">01</span><div><strong>{L('Promjena smjera', 'A change of direction')}</strong><p>{L('Pratite vanjske migracije od 1998.', 'Trace external migration since 1998.')}</p></div><Icon name="arrow" /></button><button onClick={() => { setPlaying(false); update({ view: 'map', county: null, flow: 'int', relative: false, cum: true, yi: YEARS.length - 1 }); }}><span className="v3-discover-number">02</span><div><strong>{L('Kamo se selimo?', 'Where do we move?')}</strong><p>{L('Unutarnje migracije od 2011. do 2025.', 'Internal migration from 2011 to 2025.')}</p></div><Icon name="arrow" /></button><button onClick={() => { setPlaying(false); update({ view: 'map', county: null, flow: 'all', relative: false, cum: false, yi: YEARS.length - 1 }); }}><span className="v3-discover-number">03</span><div><strong>{L('Šira slika', 'The wider picture')}</strong><p>{L('Migracije zajedno s prirodnim prirastom.', 'Migration alongside natural change.')}</p></div><Icon name="arrow" /></button></section>
        <footer className="v3-footer"><div><span className="v3-footer-mark">a.</span><span>{L('Podaci', 'Data')}: <a href={sources()[0].href} target="_blank" rel="noreferrer">DZS / CBS</a> · {YEARS[0]}–{YEARS[YEARS.length - 1]}<br /><span>{L('Granice', 'Boundaries')}: <a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL 1.0</a></span></span></div><div className="v3-footer-links"><button onClick={showAbout}>{L('Izvori i metodologija', 'Sources & methodology')}</button><a href={versionHref('v2')} onClick={() => rememberVersion('v3', 'v2')}>{L('Napredni alati u v2', 'Advanced tools in v2')} <Icon name="external" size={13} /></a><a href={REPO} target="_blank" rel="noreferrer">GitHub <Icon name="external" size={13} /></a></div></footer>
      </main>
    </div>
    <About dialog={dialog} lang={s.lang} />
    {sharing && <div className="v3-share-fallback" role="dialog" aria-label={L('Kopirajte poveznicu', 'Copy the link')}><label>{L('Kopirajte poveznicu', 'Copy the link')}<input readOnly value={location.href} onFocus={e => e.currentTarget.select()} autoFocus /></label><button className="v3-icon-button" aria-label={L('Zatvori', 'Close')} onClick={closeSharing}><Icon name="close" /></button></div>}
    <div className="v3-toast" role="status" aria-live="polite">{notice && <><Icon name="check" size={17} />{notice}</>}</div>
    <Analytics beforeSend={dropHash} /><SpeedInsights beforeSend={dropHash} />
  </div>;
}
