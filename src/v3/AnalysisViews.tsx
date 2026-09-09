import { useRef, useState } from 'react';
import { ISOS, KLAB, MXORD, PAPER_KLAS_DIFF, RDOM, REG, REGOF, YEARS, flowBadge, fsum, klasOf, mxCell, mxMax, netAt, paperKlasComparable, pragText, regVal, val } from '../lib/metrics.ts';
import { PAPER, paperSplit, regionReadingLine } from '../lib/credits.ts';
import { geoStatus, regGeo, regFailed, retryGeo, useGeo } from '../lib/geoAsync.ts';
import { asClassic, colors, countyName, unitName, type AtlasState } from './model.ts';
import MapCanvas from './MapCanvas.tsx';
import Icon from './Icon.tsx';
import TableScroll from './TableScroll.tsx';
import './analysis.css';

type Props = { s: AtlasState; light: boolean; update: (patch: Partial<AtlasState>) => void; format: (n: number, relative?: boolean) => string };
const classColors = { gain: '#64ccb2', neu: '#92a4b3', loss: '#e89081' };

export function ClassificationView({ s, light, update, format }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const L = (hr: string, en: string) => s.lang === 'hr' ? hr : en;
  const category = (iso: string) => klasOf(iso, s.yi, s.thr, s.thrRel, s.thrPct);
  const describe = (iso: string) => `${countyName(iso, s.lang)} · ${KLAB[category(iso)]} · ${format(val(iso, s.yi, 'tot', 'abs', true))}`;
  return <div className="v3-analysis" data-analysis="classification">
    <div className="v3-section-heading"><div><h2>{L('Tri smjera promjene.', 'Three directions of change.')}</h2><p>{L('Ukupan migracijski saldo od 2011.', 'Total net migration since 2011')} · {YEARS[s.yi]}</p></div></div>
    <div className="v3-threshold"><label>{L('Vrsta praga', 'Threshold basis')}<select value={s.thrRel ? 'pct' : 'abs'} onChange={e => update({ thrRel: e.target.value === 'pct' })}><option value="abs">{L('Broj osoba', 'People')}</option><option value="pct">{L('% popisa 2011.', '% of 2011 census')}</option></select></label><label>{L('Prag gubitka', 'Loss threshold')}<input type="range" aria-label={L('Prag gubitka', 'Loss threshold')} min={s.thrRel ? .5 : 500} max={s.thrRel ? 5 : 15000} step={s.thrRel ? .1 : 500} value={s.thrRel ? s.thrPct : s.thr} onChange={e => update(s.thrRel ? { thrPct: +e.target.value } : { thr: +e.target.value })} /></label><output>{pragText(asClassic(s))}</output><button className="v3-button" onClick={() => update({ thr: 4500, thrRel: false, yi: YEARS.indexOf(2024) })}>{L('Postavke rada', 'Study settings')}</button></div>
    <div className="v3-class-key">{(['gain', 'neu', 'loss'] as const).map(k => <div key={k}><i style={{ background: classColors[k] }} /><strong>{ISOS.filter(i => category(i) === k).length}</strong><span>{KLAB[k]}</span></div>)}</div>
    <div className="v3-analysis-map"><MapCanvas s={s} light={light} hover={hover} onHover={setHover} onSelect={county => update({ county })} direction={s.dir} format={format} fillCounty={iso => classColors[category(iso)]} describeCounty={describe} /><div className="v3-analysis-list">{(['gain', 'neu', 'loss'] as const).map(k => <section key={k}><h3><i style={{ background: classColors[k] }} />{KLAB[k]}</h3>{ISOS.filter(i => category(i) === k).map(i => <button key={i} onClick={() => update({ county: i })} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} aria-pressed={s.county === i}><span>{countyName(i, s.lang)}</span><strong>{format(val(i, s.yi, 'tot', 'abs', true))}</strong></button>)}</section>)}</div></div>
    <p className="v3-data-note">{L('Dobitak: saldo > 0. Neutralno: od −praga do 0. Gubitak: saldo < −praga. Relativni prag računa se zasebno prema popisu stanovništva 2011. svake županije.', 'Gain: net > 0. Neutral: −threshold through 0. Loss: net < −threshold. Relative thresholds use each county’s 2011 census population.')} <a href={PAPER.url} target="_blank" rel="noreferrer">{PAPER.short}</a></p>
    {paperKlasComparable(asClassic(s)) && <div className="v3-study-comparison"><strong>{L('Usporedba s objavljenim radom', 'Comparison with the published study')}</strong><p>{L('Objavljeni raspored dobitak / neutralno / gubitak', 'Published gain / neutral / loss split')}: {paperSplit()}. {L('Atlas primjenjuje istu granicu na novije podatke DZS-a; razlike', 'The atlas applies the same rule to newer CBS data; differences')}:</p>{PAPER_KLAS_DIFF.map(d => <p key={d.iso}>{countyName(d.iso, s.lang)}: {KLAB[d.paper]} → {KLAB[d.here]} ({format(d.v)}).</p>)}</div>}
  </div>;
}

export function RegionsView({ s, light, update, format }: Props) {
  useGeo('reg');
  const [hover, setHover] = useState<string | null>(null);
  const L = (hr: string, en: string) => s.lang === 'hr' ? hr : en;
  const scale = colors(RDOM[s.flow + s.den + s.cum], light);
  const n = (key: string) => regVal(key, s.yi, s.flow, s.den, s.cum);
  const active = (hover ?? s.county) ? REGOF[(hover ?? s.county)!] : null;
  const boundaries = regGeo();
  return <div className="v3-analysis" data-analysis="regions"><div className="v3-section-heading"><div><h2>{L('Pet regija. Povezana slika.', 'Five regions. A connected picture.')}</h2><p>{unitName(s)} · {s.cum ? '2011–' : ''}{YEARS[s.yi]}</p></div></div>
    <div className="v3-analysis-map"><MapCanvas s={s} light={light} hover={hover} onHover={setHover} onSelect={county => update({ county })} direction={s.dir} format={format} fillCounty={iso => scale(n(REGOF[iso]))} describeCounty={iso => `${REG[REGOF[iso]].name}: ${format(n(REGOF[iso]), s.relative)}`} highlightedCounties={active ? REG[active].c : []} {...(boundaries ? { boundaries } : {})} /><div className="v3-region-list">{Object.keys(REG).sort((a, b) => n(b) - n(a)).map(key => <button key={key} data-region={key} aria-pressed={active === key} onClick={() => update({ county: REG[key].c[0] })} onPointerEnter={() => setHover(REG[key].c[0])} onPointerLeave={() => setHover(null)}><span>{REG[key].name}<strong style={{ color: n(key) < 0 ? 'var(--coral)' : 'var(--accent)' }}>{format(n(key), s.relative)}</strong></span><small>{REG[key].c.map(i => countyName(i, s.lang)).join(' · ')}</small></button>)}</div></div>
    {!boundaries && <p className="v3-data-note" role="status">{geoStatus(false)} {regFailed() && <button className="v3-text-button" onClick={() => void retryGeo()}>{L('Pokušaj ponovno', 'Retry')}</button>}</p>}
    <p className="v3-data-note">{regionReadingLine()} {L('Relativna vrijednost = zbroj salda / zbroj stanovništva regije.', 'Relative value = total net change / total regional population.')}</p>
    <div className="v3-legend"><span>{L('Gubitak', 'Loss')}</span><div className="v3-color-key"><div style={{ background: `linear-gradient(90deg,${Array.from({ length: 21 }, (_, i) => scale(RDOM[s.flow + s.den + s.cum] * (i / 10 - 1))).join(',')})` }} /><span>{format(-RDOM[s.flow + s.den + s.cum], s.relative)}</span><span>0</span><span>{format(RDOM[s.flow + s.den + s.cum], s.relative)}</span></div><span>{L('Dobitak', 'Gain')}</span></div>
  </div>;
}

export function MatrixView({ s, light, update, format }: Props) {
  const [focus, setFocus] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const L = (hr: string, en: string) => s.lang === 'hr' ? hr : en;
  const scale = colors(mxMax(s.dir, s.cum), light);
  return <div className="v3-analysis" data-analysis="matrix"><div className="v3-section-heading"><div><h2>{L('Svaka veza između županija.', 'Every connection between counties.')}</h2><p>{s.dir === 'out' ? L('Redak → stupac: odseljeni', 'Row → column: departures') : s.dir === 'in' ? L('Stupac → redak: doseljeni', 'Column → row: arrivals') : L('Saldo retka: stupac → redak minus redak → stupac', 'Net gain for the row: column → row minus row → column')} · {flowBadge(s.yi, s.cum)}</p></div></div>
    <TableScroll className="v3-matrix-scroll" scrollRef={root} lang={s.lang} label={L('Matrica — pomičite vodoravno', 'Matrix — scroll horizontally')}><table className="v3-matrix" aria-label={L('Matrica migracija između 21 županije', 'Migration matrix between 21 counties')}><thead><tr><th scope="col">{L('Županija', 'County')}</th>{MXORD.map(iso => <th key={iso} scope="col" title={countyName(iso, s.lang)}><abbr title={countyName(iso, s.lang)}>{iso.slice(3)}</abbr></th>)}</tr></thead><tbody>{MXORD.map((row, ri) => <tr key={row}><th scope="row">{row.slice(3)} · {countyName(row, s.lang)}</th>{MXORD.map((col, ci) => {
      const idx = ri * 21 + ci, n = mxCell(row, col, s.dir, s.yi, s.cum);
      const label = `${countyName(row, s.lang)} / ${countyName(col, s.lang)}: ${format(n)}`;
      return <td key={col}>{row === col ? <span className="v3-matrix-diagonal">—</span> : <button data-matrix-cell={idx} title={label} aria-label={label} tabIndex={focus === idx || focus % 22 === 0 && idx === focus + (focus === 440 ? -1 : 1) ? 0 : -1} aria-pressed={s.county === row && s.pair === col} style={{ background: scale(n) }} onClick={e => { update({ county: row, pair: col }); if (e.detail > 0 && matchMedia('(max-width:960px), (pointer:coarse)').matches) requestAnimationFrame(() => { const heading = document.getElementById('v3-pair-title'); heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }); }} onFocus={() => setFocus(idx)} onKeyDown={e => {
        const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 21, ArrowUp: -21, Home: -ci, End: 20 - ci };
        if (!(e.key in step)) return; e.preventDefault();
        const vertical = e.key === 'ArrowDown' || e.key === 'ArrowUp';
        const low = vertical ? ci : ri * 21, high = vertical ? 420 + ci : ri * 21 + 20;
        let next = Math.max(low, Math.min(high, idx + step[e.key]));
        if (next % 22 === 0) {
          const skip = e.key === 'Home' ? 1 : e.key === 'End' ? -1 : step[e.key];
          next = next + skip < low || next + skip > high ? idx : next + skip;
        }
        const target = root.current?.querySelector<HTMLButtonElement>(`[data-matrix-cell="${next}"]`);
        target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }}><span>{Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : n}</span></button>}</td>;
    })}</tr>)}</tbody></table></TableScroll><p className="v3-data-note">{L('Županije su grupirane po regijama. Brojevi stupaca su oznake županija. Odaberite ćeliju za oba smjera i točne godišnje vrijednosti. Tipkovnica: strelice, Home i End.', 'Counties are grouped by region. Column numbers are county codes. Select a cell for both directions and exact annual values. Keyboard: arrows, Home and End.')}</p>
    <PairDetail s={s} update={update} />
  </div>;
}

export function PairDetail({ s, update }: { s: AtlasState; update: (patch: Partial<AtlasState>) => void }) {
  const L = (hr: string, en: string) => s.lang === 'hr' ? hr : en;
  const hub = s.county ?? 'HR-21', partner = s.pair;
  if (!partner || partner === hub) return <p className="v3-data-note">{L('Odaberite koridor za usporedbu oba smjera.', 'Select a corridor to compare both directions.')}</p>;
  const outgoing = fsum(hub, partner, s.yi, s.cum), incoming = fsum(partner, hub, s.yi, s.cum);
  const nf = new Intl.NumberFormat(s.lang);
  return <section className="v3-pair" data-pair={`${hub}/${partner}`}><div className="v3-panel-title"><h3 id="v3-pair-title" tabIndex={-1}>{countyName(hub, s.lang)} ↔ {countyName(partner, s.lang)}</h3><button className="v3-icon-button" aria-label={L('Zatvori koridor', 'Close corridor')} onClick={() => { update({ pair: null }); requestAnimationFrame(() => { const target = document.querySelector<HTMLElement | SVGElement>(s.view === 'matrix' ? `[data-matrix-cell="${MXORD.indexOf(hub) * 21 + MXORD.indexOf(partner)}"]` : `[data-county="${partner}"]`); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }); }}><Icon name="close" size={16} /></button></div><p className="v3-data-note">{flowBadge(s.yi, s.cum)} · {s.cum ? '2011–' : ''}{YEARS[s.yi]}</p><div className="v3-pair-stats"><div><span>{L('Prema odabranoj županiji', 'To selected county')}</span><strong>{nf.format(incoming)}</strong></div><div><span>{L('Iz odabrane županije', 'From selected county')}</span><strong>{nf.format(outgoing)}</strong></div><div><span>{L('Saldo odabrane županije', 'Selected county net')}</span><strong className={incoming < outgoing ? 'v3-negative' : ''}>{nf.format(incoming - outgoing)}</strong></div></div><AnnualLines s={s} series={[{ label: `${countyName(partner, s.lang)} → ${countyName(hub, s.lang)}`, color: 'var(--accent)', values: YEARS.map((_, yi) => fsum(partner, hub, yi, false)) }, { label: `${countyName(hub, s.lang)} → ${countyName(partner, s.lang)}`, color: 'var(--coral)', values: YEARS.map((_, yi) => fsum(hub, partner, yi, false)) }]} /><details><summary>{L('Godišnji podaci za oba smjera', 'Annual data for both directions')}</summary><TableScroll className="v3-table-scroll" lang={s.lang} label={L('Godišnji podaci za oba smjera', 'Annual data for both directions')}><table className="v3-data-table"><thead><tr><th>{L('Godina', 'Year')}</th><th>→ {countyName(hub, s.lang)}</th><th>→ {countyName(partner, s.lang)}</th><th>{L('Metoda', 'Method')}</th></tr></thead><tbody>{YEARS.map((y, yi) => <tr key={y}><th>{y}</th><td>{nf.format(fsum(partner, hub, yi, false))}</td><td>{nf.format(fsum(hub, partner, yi, false))}</td><td>{flowBadge(yi, false)}</td></tr>)}</tbody></table></TableScroll></details></section>;
}

export function CountySeries({ s }: { s: AtlasState }) {
  if (!s.county) return null;
  const L = (hr: string, en: string) => s.lang === 'hr' ? hr : en;
  return <AnnualLines s={s} series={[{ label: L('Unutarnje', 'Internal'), color: 'var(--accent)', values: YEARS.map((_, yi) => netAt(s.county!, yi, 'int')) }, { label: L('Vanjske', 'External'), color: '#739dce', values: YEARS.map((_, yi) => netAt(s.county!, yi, 'ext')) }, { label: L('Prirodni prirast', 'Natural change'), color: 'var(--coral)', values: YEARS.map((_, yi) => netAt(s.county!, yi, 'nat')) }]} />;
}

function AnnualLines({ s, series }: { s: AtlasState; series: { label: string; color: string; values: number[] }[] }) {
  const hi = Math.max(1, ...series.flatMap(d => d.values)), lo = Math.min(0, ...series.flatMap(d => d.values));
  const x = (i: number) => 55 + i / (YEARS.length - 1) * 665, y = (n: number) => 150 - (n - lo) / (hi - lo) * 130;
  return <div className="v3-annual-lines"><svg viewBox="0 0 750 180" role="img" aria-label={s.lang === 'hr' ? 'Godišnje serije, broj osoba' : 'Annual series, number of people'}><line x1="55" x2="720" y1={y(0)} y2={y(0)} stroke="var(--border)" />{[lo, hi].map(n => <text key={n} x="49" y={y(n) + 4} textAnchor="end">{new Intl.NumberFormat(s.lang, { notation: 'compact' }).format(n)}</text>)}{[0, 9, 20, 27].map(i => <text key={i} x={x(i)} y="175" textAnchor="middle">{YEARS[i]}</text>)}{series.map(line => <g key={line.label}><path d={line.values.map((n, i) => `${i ? 'L' : 'M'}${x(i)},${y(n)}`).join(' ')} fill="none" stroke={line.color} strokeWidth="2.5" />{line.values.map((n, i) => <circle key={i} cx={x(i)} cy={y(n)} r="3" fill={line.color}><title>{line.label} · {YEARS[i]}: {new Intl.NumberFormat(s.lang).format(n)}</title></circle>)}</g>)}</svg><div>{series.map(line => <span key={line.label}><i style={{ background: line.color }} />{line.label}</span>)}</div><p className="v3-data-note">{s.lang === 'hr' ? 'Godišnje vrijednosti · broj osoba' : 'Annual values · people'}</p></div>;
}
