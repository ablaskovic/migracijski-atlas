import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { ISOS, IX2011, IX2018, REG, REGOF, YEARS, val } from '../lib/metrics.ts';
import { setLang, storeLang } from '../lib/i18n.ts';
import { APP_VERSION, ATLAS_AUTHOR, CODE_LICENCE, CODE_YEAR, REPO, sources } from '../lib/licences.ts';
import { dropHash } from '../lib/privacy.ts';
import VersionSwitch from '../VersionSwitch.tsx';
import { FLOWS, VIEWS, colors, countyName, domain, findingPatch, normalizeState, readState, stateHash, totals, unitName, viewName, type AtlasState, type Explore } from './model.ts';
import { jlsGeo, useGeo } from '../lib/geoAsync.ts';
import { STORIES } from '../lib/stories.ts';
import type { Den } from '../lib/types.ts';
import Icon from './Icon.tsx';
import MapCanvas from './MapCanvas.tsx';
import TrendChart from './TrendChart.tsx';
import YearsGrid from './YearsGrid.tsx';
import CountyPanel from './CountyPanel.tsx';
import About from './About.tsx';
import ResearchContext from './ResearchContext.tsx';
import PopulationPanels from './PopulationPanels.tsx';
import { ClassificationView, CountySeries, MatrixView, PairDetail, RegionsView } from './AnalysisViews.tsx';
import MunicipalityMap from './MunicipalityMap.tsx';
import { exportDataCSV, exportCurrentFigure } from './exports.ts';
import './v3.css';
import './explorer.css';
import './mobile.css';

const initial = readState();
setLang(initial.lang);

export default function AppV3() {
  const [s, setS] = useState(initial);
  useGeo(s.view === 'municipalities' ? 'jmap' : s.view === 'regions' ? 'reg' : 'saldo');
  const [light, setLight] = useState(() => { try { return localStorage.getItem('atlas-v3-theme') === 'light'; } catch { return false; } });
  const [hover, setHover] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const direction = s.dir;
  const [notice, setNotice] = useState('');
  const [sharing, setSharing] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
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
  const nationalPanel = s.view === 'population' && s.panel !== 'municipal';
  const scopeCounty = s.view === 'flows' ? s.county ?? 'HR-21' : s.county;
  const region = s.view === 'regions' && s.county ? REG[REGOF[s.county]] : null;
  const title = region ? region.name : scopeCounty && !nationalPanel ? countyName(scopeCounty, s.lang) : L('Hrvatska u pokretu.', 'Croatia in motion.');
  const period = s.cum ? `2011–${YEARS[s.yi]}` : String(YEARS[s.yi]);
  const current = totals({ ...s, county: scopeCounty }, region?.c);
  const winners = ISOS.filter(iso => val(iso, s.yi, 'tot', 'abs', s.cum) > 0).length;
  const hub = s.county ?? 'HR-21';
  const flowView = s.view === 'flows' || s.view === 'matrix';
  const fixedYear = s.view === 'municipalities' || s.view === 'population';
  const estimated = flowView && (s.cum || s.yi !== IX2018);
  const max = domain(s);
  const color = colors(max, light);
  const ramp = `linear-gradient(90deg,${Array.from({ length: 21 }, (_, i) => `${color(-max + i / 10 * max)} ${i * 5}%`).join(',')})`;

  function update(patch: Partial<AtlasState>, replace = false, autoplay = false) {
    if (!autoplay && Object.keys(patch).some(k => k !== 'lang')) setPlaying(false);
    const next = normalizeState({ ...state.current, ...patch, den: patch.den ?? (patch.relative === undefined ? state.current.den : patch.relative ? 'rel11' : 'abs'), story: patch.story !== undefined ? patch.story : Object.keys(patch).every(k => k === 'lang') ? state.current.story : null });
    setLang(next.lang); state.current = next; setS(next); setHover(null);
    const url = new URL(location.href); url.hash = stateHash(next); url.searchParams.set('version', 'v3');
    if (url.searchParams.has('l')) url.searchParams.set('l', next.lang);
    if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState'](null, '', url);
  }
  function selectView(view: Explore) {
    const opener = document.activeElement;
    setPlaying(false);
    update((view === 'flows' || view === 'matrix') && !flowView ? { view, yi: IX2018, cum: false } : { view });
    requestAnimationFrame(() => { if (opener && !opener.isConnected) document.querySelector<HTMLElement>('[aria-label="' + (state.current.lang === 'hr' ? 'Svi prikazi' : 'All views') + '"]')?.focus({ preventScroll: true }); });
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
      update({ yi: next }, true, true);
    }, 900);
    const pauseHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pauseHidden);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', pauseHidden); };
  }, [playing]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || dialog.current?.open || e.defaultPrevented) return;
      setPlaying(false);
      if (sharing) closeSharing();
      else if (['flows', 'matrix'].includes(state.current.view) && state.current.pair) document.querySelector<HTMLButtonElement>('.v3-pair .v3-icon-button')?.click();
      else if (state.current.county && state.current.view !== 'flows') inspectCounty(null);
    };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [sharing]);
  async function share() {
    setPlaying(false);
    const url = location.href;
    if (navigator.share && window.matchMedia('(pointer:coarse)').matches) {
      try { await navigator.share({ title: document.title, url }); return; }
      catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); setNotice(L('Poveznica je kopirana.', 'Link copied to clipboard.')); }
    catch { setSharing(url); }
  }
  function closeSharing() {
    setSharing(null);
    document.querySelector<HTMLButtonElement>('.v3-share')?.focus();
  }
  function exportCSV() {
    setPlaying(false);
    if (s.view === 'municipalities' && !jlsGeo()) return;
    exportDataCSV(s);
    setNotice(L('Podaci su izvezeni u CSV.', 'Data exported as CSV.'));
  }
  async function exportImage(format: 'png' | 'svg') {
    setPlaying(false);
    setExporting(true);
    try { await exportCurrentFigure(s, format, light); setNotice(L('Slika je izvezena.', 'Figure exported.')); }
    catch { setNotice(L('Izvoz nije uspio. Pokušajte ponovno nakon učitavanja karte.', 'Export failed. Try again once the map has loaded.')); }
    finally { setExporting(false); }
  }
  function showAbout() { setPlaying(false); dialog.current?.showModal(); }

  function inspectCounty(county: string | null) {
    const previous = state.current.county, view = state.current.view;
    if (view === 'flows') {
      update({ pair: county === (state.current.county ?? 'HR-21') ? null : county });
      if (county && window.matchMedia('(max-width:720px), (pointer:coarse)').matches) requestAnimationFrame(() => {
        const heading = document.getElementById('v3-pair-title');
        heading?.focus({ preventScroll: true });
        heading?.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      return;
    }
    update({ county });
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement | SVGElement>(county ? '.v3-county-detail h2' : `[data-county="${previous}"]`) ?? document.querySelector<HTMLElement>('.v3-explore-controls select');
      target?.focus({ preventScroll: true });
      if (county && window.matchMedia('(max-width:720px)').matches) document.querySelector('.v3-county-panel')?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' });
    });
  }

  const timeline = fixedYear ? null : <div className="v3-timeline"><button className="v3-play" aria-label={playing ? L('Zaustavi animaciju', 'Pause animation') : L('Pokreni animaciju godina', 'Play years')} aria-pressed={playing} onClick={() => { if (!playing && s.yi === YEARS.length - 1) update({ yi: s.cum ? IX2011 : 0 }); setPlaying(!playing); }}><Icon name={playing ? 'pause' : 'play'} size={17} /></button><div className="v3-year-input"><label htmlFor="v3-year">{L('GODINA', 'YEAR')}</label><select id="v3-year" value={s.yi} onChange={e => { setPlaying(false); update({ yi: Number(e.target.value) }); }}>{YEARS.map((y, i) => (!s.cum || i >= IX2011) && <option key={y} value={i}>{y}</option>)}</select></div><div className="v3-slider-wrap"><input aria-label={L('Odaberite godinu', 'Select year')} aria-valuetext={String(YEARS[s.yi])} type="range" min={s.cum ? IX2011 : 0} max={YEARS.length - 1} value={s.yi} onChange={e => { setPlaying(false); update({ yi: Number(e.target.value) }, true); }} style={{ '--progress': `${(s.yi - (s.cum ? IX2011 : 0)) / (YEARS.length - 1 - (s.cum ? IX2011 : 0)) * 100}%` } as CSSProperties} /><div className="v3-year-ticks">{[s.cum ? 2011 : YEARS[0], s.cum ? 2015 : 2005, s.cum ? 2020 : 2015, YEARS[YEARS.length - 1]].map(y => <span key={y} style={{ left: `${(y - (s.cum ? 2011 : YEARS[0])) / (YEARS[YEARS.length - 1] - (s.cum ? 2011 : YEARS[0])) * 100}%` }}>{y}</span>)}</div></div><div className="v3-time-mode" role="group" aria-label={L('Vremensko razdoblje', 'Time window')}><button aria-pressed={!s.cum} disabled={s.view === 'classify'} onClick={() => update({ cum: false })}>{L('Godišnje', 'Annual')}</button><button aria-pressed={s.cum} disabled={s.view === 'population'} onClick={() => update({ cum: true })}>{L('Zbroj od 2011.', 'Total since 2011')}</button></div></div>;
  const sidebarName = (v: Explore) => v === 'classify' ? L('Podjela', 'Classes') : v === 'municipalities' ? L('JLS 2018.', 'Local map') : viewName(v, s.lang);
  const navLabels = [L('Karta', 'Map'), L('Trendovi', 'Trends'), L('Tokovi', 'Flows')];
  const viewIcon = (v: Explore) => v === 'trends' ? 'trend' as const : ['flows', 'matrix', 'population'].includes(v) ? 'flow' as const : 'map' as const;
  return <div className="v3-app" style={{ '--ramp': ramp, '--corridor-color': direction === 'in' ? 'var(--accent)' : 'var(--coral)' } as CSSProperties}>
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
        <span className="v3-side-index">A / 08</span>
        {VIEWS.map(v => <button key={v} title={viewName(v, s.lang)} className={s.view === v ? 'is-active' : ''} aria-current={s.view === v ? 'page' : undefined} onClick={() => selectView(v)}><Icon name={viewIcon(v)} /><span>{sidebarName(v)}</span></button>)}
        <div className="v3-side-bottom"><button onClick={showAbout}><Icon name="info" /><span>{L('O atlasu', 'About')}</span></button><span className="v3-side-coordinate">45° N<br />16° E</span></div>
      </nav>
      <main id="v3-explorer" tabIndex={-1}>
        <section className="v3-intro"><div><div className="v3-eyebrow"><span className="v3-live-dot" />{L('ATLAS MIGRACIJA', 'MIGRATION ATLAS')}<span className="v3-eyebrow-divider">/</span>{region ? L('REGIJA', 'REGION') : scopeCounty && !nationalPanel ? L('ŽUPANIJA', 'COUNTY') : L('NACIONALNI PREGLED', 'NATIONAL OVERVIEW')}</div>
          <h1>{title}</h1><p>{L('Ljudi, mjesta i promjene. Istražite migracije kroz 28 godina.', 'People, places, and change. Explore 28 years of migration.')}</p></div>
          <div className="v3-period"><span>{s.cum ? L('RAZDOBLJE', 'PERIOD') : L('GODINA', 'YEAR')}</span><strong>{period}</strong>{s.county && s.view !== 'flows' && <button onClick={() => inspectCounty(null)}>{L('Cijela Hrvatska', 'All Croatia')} <Icon name="close" size={13} /></button>}</div>
        </section>
        <ResearchContext lang={s.lang} onAbout={showAbout} />
        {s.view !== 'population' && <section className="v3-stats" aria-label={L('Pregled podataka', 'Key figures')}>
          <article className="v3-stat v3-stat-primary"><div className="v3-stat-label">{scopeCounty ? L('Migracijski saldo', 'Net migration') : L('Vanjski migracijski saldo', 'Net external migration')}<Icon name="flow" size={17} /></div><strong className={current.net < 0 ? 'v3-negative' : ''} data-stat="net">{format(current.net)}</strong><span>{L('doseljeni − odseljeni', 'arrivals − departures')} · {period}</span></article>
          <article className="v3-stat"><div className="v3-stat-label">{L('Doseljeni iz inozemstva', 'Arrivals from abroad')}<span className="v3-stat-arrow">↙</span></div><strong data-stat="arrivals">{nf.format(current.arrivals)}</strong><span>{L('registriranih doseljenja', 'registered arrivals')} · {period}</span></article>
          <article className="v3-stat"><div className="v3-stat-label">{L('Odseljeni u inozemstvo', 'Departures abroad')}<span className="v3-stat-arrow is-coral">↗</span></div><strong data-stat="departures">{nf.format(current.departures)}</strong><span>{L('registriranih odseljenja', 'registered departures')} · {period}</span></article>
          <article className="v3-stat"><div className="v3-stat-label">{scopeCounty ? L('Unutarnji migracijski saldo', 'Net internal migration') : L('Županije s pozitivnim saldom', 'Counties with net gains')}<Icon name="map" size={17} /></div><strong data-stat="counties">{scopeCounty ? format((region?.c ?? [scopeCounty]).reduce((sum, iso) => sum + val(iso, s.yi, 'int', 'abs', s.cum), 0)) : <>{winners}<small> / 21</small></>}</strong><span>{scopeCounty ? L('preseljenja između županija', 'moves between counties') : L('više doseljenih nego odseljenih', 'more arrivals than departures')}</span></article>
        </section>
        }
        <section className="v3-workspace" aria-label={L('Istraživanje podataka', 'Explore the data')}>
          <div className="v3-toolbar"><div className="v3-tabs" role="group" aria-label={L('Prikaz', 'View')}>{(['map', 'trends', 'flows'] as const).map((v, i) => <button key={v} className={s.view === v ? 'is-active' : ''} aria-pressed={s.view === v} onClick={() => selectView(v)}><Icon name={viewIcon(v)} size={17} /><span className="v3-tab-long">{[L('Istraži kartu', 'Explore map'), L('Kroz godine', 'Through the years'), L('Migracijski tokovi', 'Migration flows')][i]}</span><span className="v3-tab-short">{navLabels[i]}</span></button>)}</div><div className="v3-export-actions">{s.view !== 'population' && <button className="v3-export" disabled={s.view === 'municipalities' && !jlsGeo()} onClick={exportCSV}><Icon name="download" size={16} />CSV</button>}{s.view !== 'population' && <><button disabled={exporting || s.view === 'municipalities' && !jlsGeo()} onClick={() => void exportImage('svg')} aria-label={L('Izvezi SVG', 'Export SVG')}>SVG</button><button disabled={exporting || s.view === 'municipalities' && !jlsGeo()} onClick={() => void exportImage('png')} aria-label={L('Izvezi PNG', 'Export PNG')}>{exporting ? '…' : 'PNG'}</button></>}</div></div>
          <div className="v3-explore-controls"><label>{L('ISTRAŽI', 'EXPLORE')}<select aria-label={L('Svi prikazi', 'All views')} value={s.view} onChange={e => selectView(e.target.value as Explore)}>{VIEWS.map(v => <option key={v} value={v}>{viewName(v, s.lang)}</option>)}</select></label><label>{L('VOĐENI NALAZI', 'GUIDED FINDINGS')}<select aria-label={L('Vođeni nalazi', 'Guided findings')} value={s.story ?? ''} onChange={e => { if (e.target.value !== '') { setPlaying(false); update(findingPatch(+e.target.value)); } else update({ story: null }); }}><option value="">{L('Odaberite priču…', 'Choose a story…')}</option>{STORIES.map((story, i) => <option key={i} value={i}>{String(i + 1).padStart(2, '0')} · {story.label}</option>)}</select></label></div>
          {s.story != null && (!STORIES[s.story].needs || jlsGeo()) && <div className="v3-finding" role="status"><span className="v3-eyebrow">{L('NALAZ', 'FINDING')} {String(s.story + 1).padStart(2, '0')}</span><p>{STORIES[s.story].cap}</p><button className="v3-icon-button" aria-label={L('Zatvori nalaz', 'Close finding')} onClick={() => { update({ story: null }); requestAnimationFrame(() => document.querySelector<HTMLElement>('.v3-explore-controls label:nth-child(2) select')?.focus({ preventScroll: true })); }}><Icon name="close" size={16} /></button></div>}
          {s.view !== 'classify' && s.view !== 'population' && <div className="v3-filters">{flowView || s.view === 'municipalities' ? <><span className={'v3-data-badge' + (estimated ? ' is-estimate' : '')}><span />{estimated ? L('IPF PROCJENA', 'IPF ESTIMATE') : L('IZMJERENO · 2018.', 'MEASURED · 2018')}</span><div className="v3-segment" role="group" aria-label={L('Smjer migracija', 'Migration direction')}>{(['in', 'out', 'net'] as const).map(d => <button key={d} aria-pressed={direction === d} onClick={() => update({ dir: d })}>{d === 'in' ? L('Doseljavanje', 'Arrivals') : d === 'out' ? L('Odseljavanje', 'Departures') : L('Saldo', 'Net')}</button>)}</div>{s.view === 'flows' && <label className="v3-hub-label">{L('Županija', 'County')}<select value={hub} onChange={e => update({ county: e.target.value, pair: null })}>{ISOS.map(i => <option key={i} value={i}>{countyName(i, s.lang)}</option>)}</select></label>}</> : <><div className="v3-metrics" role="group" aria-label={L('Sastavnica', 'Component')}>{FLOWS.map(f => <button key={f} aria-pressed={s.flow === f} onClick={() => update({ flow: f })}>{metricNames[f]}</button>)}</div><label className="v3-unit"><select aria-label={L('Jedinica', 'Unit')} value={s.den} onChange={e => update({ den: e.target.value as Den })}><option value="abs">{L('Broj osoba', 'People')}</option><option value="rel11">{L('% popisa 2011.', '% of 2011 census')}</option><option value="relest">{L('% procijenjenog stanovništva', '% of estimated population')}</option></select></label></>}</div>}
          {!flowView && s.view !== 'classify' && s.view !== 'municipalities' && s.view !== 'population' && s.den === 'relest' && <p className="v3-data-note v3-den-note">{unitName(s)} · {L('Kumulativni saldo dijeli se stanovništvom na kraju razdoblja.', 'Cumulative net change uses the population at the end of the period.')}</p>}
          {s.view === 'classify' ? <><ClassificationView s={s} light={light} update={update} format={format} />{timeline}</> : s.view === 'regions' ? <><RegionsView s={s} light={light} update={update} format={format} />{timeline}</> : s.view === 'matrix' ? <><MatrixView s={s} light={light} update={update} format={format} />{timeline}</> : s.view === 'municipalities' ? <MunicipalityMap s={s} light={light} update={update} /> : s.view === 'population' ? <><PopulationPanels lang={s.lang} county={s.county} yi={s.yi} cum={s.cum} direction={s.dir} tab={s.panel} onTab={panel => update({ panel })} onCounty={county => update({ county })} onYear={yi => update({ yi, cum: false })} age={s.age} onAge={age => update({ age })} localScope={s.localScope} onLocalScope={localScope => update({ localScope })} onDirection={dir => update({ dir })} />{timeline}</> : s.view === 'trends' ? <div className="v3-trends-view"><div className="v3-section-heading"><div><span className="v3-eyebrow">1998—2025</span><h2>{s.county ? countyName(s.county, s.lang) : L('Kada se smjer promijenio?', 'When did the direction change?')}</h2><p>{s.county ? metricFull[s.flow] : L('Vanjski migracijski saldo Hrvatske', 'Croatia’s net external migration')} · {L('godišnji broj osoba', 'annual number of people')}</p></div>{s.county && <button className="v3-button" onClick={() => inspectCounty(null)}>{L('Cijela Hrvatska', 'All Croatia')}</button>}</div>
            <TrendChart s={{ ...s, cum: false }} onYear={yi => { setPlaying(false); update({ yi, cum: false }); }} />
            {s.county && <CountySeries s={s} />}
            <div className="v3-section-heading"><div><h3>{L('Svaka županija. Svaka godina.', 'Every county. Every year.')}</h3><p>{metricFull[s.flow]} · {(s.den === 'relest' ? L('% procjene za godinu stupca', '% of the column year’s estimate') : unitName(s)) + (s.cum ? L(' · zbroj od 2011.', ' · total since 2011') : L(' · godišnje', ' · annual'))} · {L('Odaberite ćeliju za detalje.', 'Select a cell to inspect.')}</p></div><span className="v3-mini-legend"><i />{L('gubitak', 'loss')}<i />{L('dobitak', 'gain')}</span></div>
            <YearsGrid s={s} light={light} onPick={(county, yi) => update({ county, yi })} />
            {(s.flow === 'tot' || s.flow === 'int' || s.flow === 'all') && <p className="v3-data-note">{L('Prije 2007. zbrojevi doseljenih i odseljenih između županija ne podudaraju se u potpunosti.', 'Before 2007, inter-county arrivals and departures do not fully balance.')}</p>}
          {timeline}</div> : <div className="v3-map-layout"><div className="v3-map-column"><div className="v3-map-heading"><div><h2>{s.view === 'flows' ? countyName(hub, s.lang) : metricFull[s.flow]}</h2><span>{s.view === 'flows' ? direction === 'in' ? L('Odakle ljudi dolaze?', 'Where do people arrive from?') : direction === 'out' ? L('Kamo ljudi odlaze?', 'Where do people move to?') : L('Neto razmjena s drugim županijama', 'Net exchange with other counties') : unitName(s)}<span className="v3-middle-dot">·</span>{period}</span></div><span className="v3-map-meta">{s.view === 'flows' ? '20' : '21'} {s.view === 'flows' ? L('KORIDORA', 'CORRIDORS') : L('ŽUPANIJA', 'COUNTIES')}</span></div>
              <MapCanvas s={s} light={light} hover={hover} onHover={setHover} onSelect={county => inspectCounty(s.county === county && s.view !== 'flows' ? null : county)} format={format} direction={direction} partner={s.pair} />
              <div className="v3-legend">{s.view === 'flows' ? <><span className="v3-flow-key" /><span>{L('Debljina linije = broj preseljenja. Koridori ispod 5 osoba nisu ucrtani.', 'Line width = number of moves. Corridors under 5 people are not drawn.')}</span></> : <><span>{L('Gubitak', 'Loss')}</span><div className="v3-color-key"><div /><span>{format(-max, s.relative)}</span><span>0</span><span>{format(max, s.relative)}</span></div><span>{L('Dobitak', 'Gain')}</span></>}</div>
              {s.view === 'flows' && <p className="v3-data-note">{estimated ? L('Procjena: struktura 2018. skalirana na DZS odseljene; doseljeni približno. Samo godišnja 2018. je izmjerena.', 'Estimate: 2018 structure scaled to CBS out-margins; in-margins approximate. Only annual 2018 is measured.') : L('Izmjereni tokovi između županija · Pitoski i sur. (2021.), CC BY 4.0.', 'Measured inter-county flows · Pitoski et al. (2021), CC BY 4.0.')}</p>}
            {timeline}</div><CountyPanel s={s} hover={hover} setHover={setHover} selectView={selectView} direction={direction} format={format} metricFull={metricFull} inspectCounty={inspectCounty} />
          </div>}

          {s.view === 'flows' && <PairDetail s={s} update={update} />}
          {flowView && <p className="v3-data-note v3-window-note">{estimated ? L('IPF procjena: struktura 2018. skalirana na DZS odseljene; doseljeni približno. Samo godišnja 2018. je izmjerena.', 'IPF estimate: 2018 structure scaled to CBS out-margins; in-margins approximate. Only annual 2018 is measured.') : L('Izmjereni tokovi između županija · Pitoski i sur. (2021.), CC BY 4.0.', 'Measured inter-county flows · Pitoski et al. (2021), CC BY 4.0.')}</p>}
          {s.yi < YEARS.indexOf(2007) && !s.cum && (s.flow === 'tot' || s.flow === 'int' || s.flow === 'all') && <p className="v3-data-note v3-window-note">{L('Prije 2007. zbrojevi doseljenih i odseljenih između županija ne podudaraju se u potpunosti.', 'Before 2007, inter-county arrivals and departures do not fully balance.')}</p>}
        </section>
        <section className="v3-discover" aria-label={L('Polazišta za istraživanje', 'Ways to explore')}><div className="v3-discover-title"><span className="v3-eyebrow">{L('POGLEDAJTE POBLIŽE', 'TAKE A CLOSER LOOK')}</span><h2>{L('Iza svakog broja, promjena.', 'A changing story in every number.')}</h2></div><button onClick={() => { setPlaying(false); update({ view: 'trends', county: null, flow: 'ext', cum: false, yi: YEARS.indexOf(2022) }); }}><span className="v3-discover-number">01</span><div><strong>{L('Promjena smjera', 'A change of direction')}</strong><p>{L('Pratite vanjske migracije od 1998.', 'Trace external migration since 1998.')}</p></div><Icon name="arrow" /></button><button onClick={() => { setPlaying(false); update({ view: 'map', county: null, flow: 'int', relative: false, cum: true, yi: YEARS.length - 1 }); }}><span className="v3-discover-number">02</span><div><strong>{L('Kamo se selimo?', 'Where do we move?')}</strong><p>{L('Unutarnje migracije od 2011. do 2025.', 'Internal migration from 2011 to 2025.')}</p></div><Icon name="arrow" /></button><button onClick={() => { setPlaying(false); update({ view: 'map', county: null, flow: 'all', relative: false, cum: false, yi: YEARS.length - 1 }); }}><span className="v3-discover-number">03</span><div><strong>{L('Šira slika', 'The wider picture')}</strong><p>{L('Migracije zajedno s prirodnim prirastom.', 'Migration alongside natural change.')}</p></div><Icon name="arrow" /></button></section>
        <footer className="v3-footer"><div><span className="v3-footer-mark">a.</span><span>{L('Podaci', 'Data')}: <a href={sources()[0].href} target="_blank" rel="noreferrer">DZS / CBS</a> · {YEARS[0]}–{YEARS[YEARS.length - 1]}<br /><span>{L('Granice', 'Boundaries')}: <a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL 1.0</a></span><br /><span>{L('Autor atlasa', 'Atlas author')}: <span lang="hr">{ATLAS_AUTHOR}</span> · © {CODE_YEAR} · <a href={REPO + '/blob/main/LICENSE'} target="_blank" rel="noreferrer">{CODE_LICENCE}</a>{APP_VERSION() && ` · ${L('Izdanje koda', 'Code release')} ${APP_VERSION()}`}</span></span></div><div className="v3-footer-links"><button onClick={showAbout}>{L('Izvori i metodologija', 'Sources & methodology')}</button><button onClick={() => selectView('classify')}>{L('Klasifikacija i regije', 'Classification & regions')}</button><a href={REPO} target="_blank" rel="noreferrer">GitHub <Icon name="external" size={13} /></a></div></footer>
      </main>
    </div>
    <About dialog={dialog} lang={s.lang} />
    {sharing && <div className="v3-share-fallback" role="dialog" aria-label={L('Kopirajte poveznicu', 'Copy the link')}><label>{L('Kopirajte poveznicu', 'Copy the link')}<input readOnly value={sharing} onFocus={e => e.currentTarget.select()} autoFocus /></label><button className="v3-icon-button" aria-label={L('Zatvori', 'Close')} onClick={closeSharing}><Icon name="close" /></button></div>}
    <div className="v3-toast" role="status" aria-live="polite">{notice && <><Icon name="check" size={17} />{notice}</>}</div>
    <Analytics beforeSend={dropHash} /><SpeedInsights beforeSend={dropHash} />
  </div>;
}
