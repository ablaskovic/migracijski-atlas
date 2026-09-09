import { useEffect, useState } from 'react';
import { CIT, DEMO, ISOS, JLS, YEARS, cgroups, countryName as countryLabel } from '../lib/metrics.ts';
import type { JlsRow, Lang } from '../lib/types.ts';
import { countyName, downloadFile, fold } from './model.ts';
import Icon from './Icon.tsx';
import './population-panels.css';

type Panel = 'age' | 'citizenship' | 'countries' | 'municipal';
type Direction = 'in' | 'out' | 'net';
interface Props {
  lang: Lang;
  county: string | null;
  yi: number;
  cum: boolean;
  direction: Direction;
  onCounty?: (iso: string) => void;
  tab?: Panel;
  onTab?: (tab: Panel) => void;
  onYear?: (yi: number) => void;
  age?: 'ext' | 'int';
  onAge?: (mode: 'ext' | 'int') => void;
  localScope?: 'inter' | 'local';
  onLocalScope?: (scope: 'inter' | 'local') => void;
  onDirection?: (direction: Direction) => void;
}
type CsvRow = (string | number)[];
const SOURCE = 'DZS STAN-2026-2-1';
const MUNICIPAL_SOURCE = 'CBS special processing; Pitoski et al. (2021); CC BY 4.0; https://doi.org/10.1186/s40649-021-00093-0';
const GROUP_COLORS: Record<string, string> = { hr: '#75e2c1', sus: '#d7b785', ukr: '#bca5e3', eu: '#79aae4', az: '#5acbd6', ost: '#a9b7c4' };
const closestCitYear = (year: number) => CIT.years.includes(year) ? year : year < CIT.years[0] ? CIT.years[0] : CIT.years[CIT.years.length - 1];

function saveCsv(rows: CsvRow[], name: string) {
  const csv = rows.map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  downloadFile('\uFEFF' + csv, 'text/csv;charset=utf-8', name + '.csv');
}

export default function PopulationPanels({ lang, county, yi, cum, direction, onCounty, tab, onTab, onYear, age, onAge, localScope, onLocalScope, onDirection }: Props) {
  const L = (hr: string, en: string) => lang === 'hr' ? hr : en;
  const format = (n: number) => new Intl.NumberFormat(lang === 'hr' ? 'hr-HR' : 'en-GB').format(n);
  const [localPanel, setLocalPanel] = useState<Panel>('age');
  const panel = tab ?? localPanel;
  const setPanel = (next: Panel) => { setLocalPanel(next); onTab?.(next); };
  const [localAge, setLocalAge] = useState<'ext' | 'int'>('ext');
  const ageMode = age ?? localAge;
  const setAgeMode = (mode: 'ext' | 'int') => { setLocalAge(mode); onAge?.(mode); };
  const [citYear, setCitYear] = useState(closestCitYear(YEARS[yi]));
  const [municipalCounty, setMunicipalCounty] = useState(county ?? 'HR-21');
  const [localDirection, setLocalDirection] = useState<Direction>(direction);
  const municipalDirection = onDirection ? direction : localDirection;
  const setMunicipalDirection = (dir: Direction) => { setLocalDirection(dir); onDirection?.(dir); };
  const [localMunicipalMode, setLocalMunicipalMode] = useState<'inter' | 'local'>('inter');
  const municipalMode = localScope ?? localMunicipalMode;
  const setMunicipalMode = (scope: 'inter' | 'local') => { setLocalMunicipalMode(scope); onLocalScope?.(scope); };
  const [query, setQuery] = useState('');
  useEffect(() => { setCitYear(closestCitYear(YEARS[yi])); }, [yi]);
  useEffect(() => { if (county) setMunicipalCounty(county); }, [county]);
  useEffect(() => { setLocalDirection(direction); }, [direction]);
  const tabs: [Panel, string][] = [
    ['age', L('Dob i spol', 'Age and sex')], ['citizenship', L('Državljanstvo', 'Citizenship')],
    ['countries', L('Zemlje', 'Countries')], ['municipal', L('Gradovi i općine', 'Towns and municipalities')],
  ];
  const ci = CIT.years.indexOf(citYear);
  const ageTotal = ageMode === 'ext' ? DEMO.cTot[0] : DEMO.intTot;
  const ageValues = ageMode === 'ext' ? DEMO.ext.d : DEMO.intm;
  const peakAge = ageValues.indexOf(Math.max(...ageValues));
  const ageMax = Math.max(...ageValues, ...(ageMode === 'ext' ? DEMO.ext.o : []));
  const countries: [string, number, number][] = [...DEMO.countries, [L('Ostale zemlje', 'Other countries'),
    DEMO.cTot[0] - DEMO.countries.reduce((sum, row) => sum + row[1], 0),
    DEMO.cTot[1] - DEMO.countries.reduce((sum, row) => sum + row[2], 0)]];
  const countryMax = Math.max(...countries.map(row => Math.max(row[1], row[2])));
  const municipalData = JLS.c[municipalCounty];
  const municipalRows: JlsRow[] = municipalMode === 'local' ? municipalData.loc : municipalDirection === 'net'
    ? [...municipalData.in, ...municipalData.out].sort((a, b) => b[2] - a[2]) : municipalData[municipalDirection];
  const municipalName = (j: number) => JLS.names[j][0];
  const municipalTag = (j: number) => {
    const iso = ISOS[JLS.names[j][1]];
    return iso === municipalCounty || municipalName(j) === 'Grad Zagreb' ? '' : countyName(iso, lang);
  };
  const shownMunicipalRows = municipalRows.filter(([from, to]) => fold([municipalName(from), municipalTag(from), municipalName(to), municipalTag(to)].join(' ')).includes(fold(query)));
  const shownCountries = countries.filter(([name]) => fold(countryLabel(name)).includes(fold(query)));
  const isNational = panel !== 'municipal';
  const year = panel === 'citizenship' ? citYear : panel === 'municipal' ? 2018 : DEMO.year;
  const scope = isNational ? L('Hrvatska · nacionalni podaci', 'Croatia · national data') : countyName(municipalCounty, lang);
  const title = panel === 'age' ? L('Tko se seli?', 'Who is moving?') : panel === 'citizenship' ? L('Migracije prema državljanstvu', 'Migration by citizenship')
    : panel === 'countries' ? L('Odakle ljudi dolaze, kamo odlaze?', 'Where do people come from and go?') : L('Koridori između gradova i općina', 'Town and municipality corridors');

  const exportPanel = () => {
    if (panel === 'age') {
      const rows: CsvRow[] = [['scope', 'year', 'migration', 'dimension', 'group', 'arrivals_or_moves', 'departures', 'source']];
      DEMO.ages.forEach((band, i) => rows.push(['Croatia', DEMO.year, ageMode === 'ext' ? 'external' : 'internal_all_levels', 'age', band, ageValues[i], ageMode === 'ext' ? DEMO.ext.o[i] : '', SOURCE + ' I 3 / II 2']));
      rows.push(['Croatia', DEMO.year, ageMode === 'ext' ? 'external' : 'internal_all_levels', 'sex', 'male', ageMode === 'ext' ? DEMO.extM.d : DEMO.intM, ageMode === 'ext' ? DEMO.extM.o : '', SOURCE + ' I 3 / II 2']);
      rows.push(['Croatia', DEMO.year, ageMode === 'ext' ? 'external' : 'internal_all_levels', 'sex', 'female', ageTotal - (ageMode === 'ext' ? DEMO.extM.d : DEMO.intM), ageMode === 'ext' ? DEMO.cTot[1] - DEMO.extM.o : '', SOURCE + ' I 3 / II 2']);
      saveCsv(rows, `atlas-v3-age-sex-${ageMode}-${DEMO.year}`);
    } else if (panel === 'citizenship') {
      const rows: CsvRow[] = [['scope', 'year', 'citizenship_group', 'arrivals', 'departures', 'net', 'source']];
      CIT.years.forEach((y, i) => {
        cgroups().forEach(([key, label]) => rows.push(['Croatia', y, label, CIT.g[key].d[i], CIT.g[key].o[i], CIT.g[key].d[i] - CIT.g[key].o[i], SOURCE + ' table 2']));
        rows.push(['Croatia', y, 'TOTAL', CIT.tot.d[i], CIT.tot.o[i], CIT.tot.d[i] - CIT.tot.o[i], SOURCE + ' table 2']);
      });
      saveCsv(rows, 'atlas-v3-citizenship-2021-2025');
    } else if (panel === 'countries') {
      saveCsv([['scope', 'year', 'country_of_origin_destination', 'arrivals', 'departures', 'net', 'source'],
        ...countries.map(([name, arrivals, departures]) => ['Croatia', DEMO.year, countryLabel(name), arrivals, departures, arrivals - departures, SOURCE + ' I 4']),
        ['Croatia', DEMO.year, 'TOTAL', ...DEMO.cTot, DEMO.cTot[0] - DEMO.cTot[1], SOURCE + ' I 4']], `atlas-v3-countries-${DEMO.year}`);
    } else {
      saveCsv([['year', 'selected_county', 'scope', 'direction', 'from', 'from_county', 'to', 'to_county', 'moves', 'method', 'source'],
        ...municipalRows.map(([from, to, moves]) => [2018, municipalCounty, municipalMode, municipalMode === 'local' ? 'within_county' : municipalDirection === 'net' ? 'gross_both_directions' : municipalDirection,
          municipalName(from), ISOS[JLS.names[from][1]], municipalName(to), ISOS[JLS.names[to][1]], moves, 'measured', MUNICIPAL_SOURCE])], `atlas-v3-municipal-${municipalCounty}-${municipalMode}-${municipalDirection}-2018`);
    }
  };

  return <section className="v3-population" aria-label={L('Stanovništvo i lokalni koridori', 'Population and local corridors')}>
    <div className="v3-pop-tabs" role="group" aria-label={L('Vrsta podataka', 'Data category')}>
      {tabs.map(([key, label]) => <button key={key} aria-pressed={panel === key} onClick={() => { setPanel(key); setQuery(''); }}>{label}</button>)}
    </div>
    <div className="v3-pop-heading">
      <div><span className="v3-eyebrow">{scope} <span>·</span> {year}{lang === 'hr' ? '.' : ''}</span><h2>{title}</h2></div>
      <button className="v3-button v3-pop-export" onClick={exportPanel} aria-label={L('Preuzmi sve podatke ovog prikaza kao CSV', 'Download all data in this panel as CSV')}><Icon name="download" size={16} />CSV</button>
    </div>
    <p className="v3-pop-scope" role="status"><Icon name="info" size={17} /><span>{isNational
      ? panel === 'citizenship'
        ? L(`Nacionalni godišnji podaci za ${CIT.years[0]}.–${CIT.years[CIT.years.length - 1]}. Odabir županije i zbrajanje ne mijenjaju ove brojke.`,
          `National annual data for ${CIT.years[0]}–${CIT.years[CIT.years.length - 1]}. County selection and cumulative mode do not change these figures.`)
          + (YEARS[yi] !== citYear ? L(` Vremenska vrpca: ${YEARS[yi]}.; ovaj prikaz: ${citYear}.`, ` Timeline: ${YEARS[yi]}; this panel: ${citYear}.`) : '')
        : L(`Fiksno ${DEMO.year}. · cijela Hrvatska. Odabrana županija, godina i zbrajanje ne mijenjaju ove podatke.`,
          `Fixed at ${DEMO.year} · all of Croatia. The selected county, year and cumulative mode do not change these data.`)
      : L(`Izmjereno 2018. · unutarnje migracije. ${cum || YEARS[yi] !== 2018 ? `Vremenska vrpca (${cum ? '2011.–' : ''}${YEARS[yi]}.) ne mijenja ovaj popis. ` : ''}Ovi koridori nisu IPF procjene.`,
        `Measured in 2018 · internal migration. ${cum || YEARS[yi] !== 2018 ? `The timeline (${cum ? '2011–' : ''}${YEARS[yi]}) does not change this list. ` : ''}These corridors are not IPF estimates.`)}</span></p>

    {panel === 'age' && <>
      <div className="v3-pop-controls"><div className="v3-pop-segment" role="group" aria-label={L('Vrsta migracije', 'Migration type')}>
        <button aria-pressed={ageMode === 'ext'} onClick={() => setAgeMode('ext')}>{L('Vanjska migracija', 'External migration')}</button>
        <button aria-pressed={ageMode === 'int'} onClick={() => setAgeMode('int')}>{L('Unutarnja migracija', 'Internal migration')}</button>
      </div></div>
      <div className="v3-pop-grid">
        <div className="v3-pop-card">
          <h3>{L('Raspodjela po dobi', 'Age distribution')}</h3><p className="v3-pop-subtitle">{ageMode === 'ext' ? L('Odseljeni lijevo · doseljeni desno', 'Departures on the left · arrivals on the right') : L('Preseljenja unutar Hrvatske, sve razine', 'Moves within Croatia, all levels')}</p>
          <div className="v3-pop-table-scroll" tabIndex={0} role="region" aria-label={L('Tablica podataka; pomaknite vodoravno za sve stupce', 'Data table; scroll horizontally for all columns')}><table className="v3-pop-table v3-pop-age-table">
            <caption className="v3-sr">{L('Migracije prema dobnim skupinama u Hrvatskoj, ', 'Migration by age band in Croatia, ') + DEMO.year}</caption>
            <thead><tr>{ageMode === 'ext' && <th scope="col">{L('Odseljeni', 'Departures')}</th>}<th scope="col">{L('Dob', 'Age')}</th><th scope="col">{ageMode === 'ext' ? L('Doseljeni', 'Arrivals') : L('Preseljeni', 'Moves')}</th></tr></thead>
            <tbody>{DEMO.ages.map((_, index) => { const i = DEMO.ages.length - index - 1; return <tr key={DEMO.ages[i]} className={i === peakAge ? 'is-peak' : ''}>
              {ageMode === 'ext' && <td className="v3-pop-bar-cell v3-pop-left-bar"><i aria-hidden="true" style={{ width: `${DEMO.ext.o[i] / ageMax * 100}%`, background: 'color-mix(in srgb, var(--coral) 18%, transparent)', borderColor: 'var(--coral)' }} /><span>{format(DEMO.ext.o[i])}</span></td>}
              <th scope="row">{DEMO.ages[i]}</th><td className="v3-pop-bar-cell"><i aria-hidden="true" style={{ width: `${ageValues[i] / ageMax * 100}%` }} /><span>{format(ageValues[i])}</span></td>
            </tr>; })}</tbody>
            <tfoot><tr>{ageMode === 'ext' && <td>{format(DEMO.cTot[1])}</td>}<th scope="row">{L('Ukupno', 'Total')}</th><td>{format(ageTotal)}</td></tr></tfoot>
          </table></div>
        </div>
        <div className="v3-pop-side">
          <div className="v3-pop-highlight"><span className="v3-eyebrow">{L('NAJVEĆA DOBNA SKUPINA', 'LARGEST AGE BAND')}</span><strong>{DEMO.ages[peakAge]}</strong><p>{format(ageValues[peakAge])} {ageMode === 'ext' ? L('doseljenih', 'arrivals') : L('preseljenih', 'moves')} · {new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(ageValues[peakAge] / ageTotal * 100)}%</p></div>
          <div className="v3-pop-card"><h3>{L('Raspodjela po spolu', 'Sex distribution')}</h3><p className="v3-pop-subtitle">{L('Ukupno za sve dobne skupine', 'Totals across all age bands')}</p>
            <table className="v3-pop-table v3-pop-sex-table"><caption className="v3-sr">{L('Migracije prema spolu u Hrvatskoj, ', 'Migration by sex in Croatia, ') + DEMO.year}</caption>
              <thead><tr><th scope="col">{L('Spol', 'Sex')}</th><th scope="col">{ageMode === 'ext' ? L('Doseljeni', 'Arrivals') : L('Preseljeni', 'Moves')}</th>{ageMode === 'ext' && <th scope="col">{L('Odseljeni', 'Departures')}</th>}</tr></thead>
              <tbody><tr><th scope="row">{L('Muškarci', 'Men')}</th><td>{format(ageMode === 'ext' ? DEMO.extM.d : DEMO.intM)}<small>{Math.round(100 * (ageMode === 'ext' ? DEMO.extM.d : DEMO.intM) / ageTotal)}%</small></td>{ageMode === 'ext' && <td>{format(DEMO.extM.o)}<small>{Math.round(100 * DEMO.extM.o / DEMO.cTot[1])}%</small></td>}</tr>
                <tr><th scope="row">{L('Žene', 'Women')}</th><td>{format(ageTotal - (ageMode === 'ext' ? DEMO.extM.d : DEMO.intM))}<small>{Math.round(100 * (1 - (ageMode === 'ext' ? DEMO.extM.d : DEMO.intM) / ageTotal))}%</small></td>{ageMode === 'ext' && <td>{format(DEMO.cTot[1] - DEMO.extM.o)}<small>{Math.round(100 * (1 - DEMO.extM.o / DEMO.cTot[1]))}%</small></td>}</tr></tbody>
            </table>
          </div>
          <p className="v3-pop-note">{L('Vanjska migracija znači prelazak državne granice. Unutarnja migracija obuhvaća preseljenja među naseljima unutar Hrvatske, uključujući ona unutar iste županije.', 'External migration crosses the national border. Internal migration includes moves between settlements within Croatia, including moves inside the same county.')}</p>
        </div>
      </div>
      <p className="v3-pop-source">{L('Izvor: DZS STAN-2026-2-1, tablice I 3 / II 2. Objavljeno samo za 2025.', 'Source: CBS STAN-2026-2-1, tables I 3 / II 2. Published for 2025 only.')}</p>
    </>}

    {panel === 'citizenship' && <>
      <div className="v3-pop-cit-chart" role="group" aria-label={L('Odaberite godinu državljanstva', 'Choose citizenship year')}>
        {CIT.years.map((y, i) => <button key={y} className="v3-pop-cit-year" aria-pressed={citYear === y} onClick={() => { setCitYear(y); onYear?.(YEARS.indexOf(y)); }} aria-label={`${y}: ${L('doseljeni', 'arrivals')} ${format(CIT.tot.d[i])}; ${L('odseljeni', 'departures')} ${format(CIT.tot.o[i])}`}>
          <span className="v3-pop-cit-pair" aria-hidden="true">{(['d', 'o'] as const).map(key => <span className={'v3-pop-cit-stack ' + (key === 'o' ? 'is-departures' : '')} key={key}>{cgroups().map(([group]) => <i key={group} style={{ height: `${CIT.g[group][key][i] / Math.max(...CIT.tot.d, ...CIT.tot.o) * 100}%`, background: GROUP_COLORS[group] }} />)}</span>)}</span>
          <strong>{y}</strong><span className="v3-pop-cit-totals"><span>{format(CIT.tot.d[i])}</span><span>{format(CIT.tot.o[i])}</span></span>
        </button>)}
      </div>
      <p className="v3-pop-chart-key">{L('Svake godine: doseljeni lijevo, odseljeni desno. Odaberite godinu za tablicu.', 'Each year: arrivals on the left, departures on the right. Select a year for its table.')}</p>
      <div className="v3-pop-card"><div className="v3-pop-card-heading"><h3>{L('Državljanstvo', 'Citizenship')} · {citYear}{lang === 'hr' ? '.' : ''}</h3><span className="v3-pop-net">{L('Saldo ', 'Net ')}{CIT.tot.d[ci] - CIT.tot.o[ci] > 0 ? '+' : ''}{format(CIT.tot.d[ci] - CIT.tot.o[ci])}</span></div>
        <div className="v3-pop-table-scroll" tabIndex={0} role="region" aria-label={L('Tablica podataka; pomaknite vodoravno za sve stupce', 'Data table; scroll horizontally for all columns')}><table className="v3-pop-table"><caption className="v3-sr">{L('Vanjska migracija prema državljanstvu u Hrvatskoj, ', 'External migration by citizenship in Croatia, ') + citYear}</caption>
          <thead><tr><th scope="col">{L('Državljanstvo', 'Citizenship')}</th><th scope="col">{L('Doseljeni', 'Arrivals')}</th><th scope="col">{L('Odseljeni', 'Departures')}</th><th scope="col">{L('Saldo', 'Net')}</th></tr></thead>
          <tbody>{cgroups().map(([key, label]) => <tr key={key}><th scope="row"><span className="v3-pop-group"><i aria-hidden="true" style={{ background: GROUP_COLORS[key] }} />{label}</span></th><td>{format(CIT.g[key].d[ci])}</td><td>{format(CIT.g[key].o[ci])}</td><td>{format(CIT.g[key].d[ci] - CIT.g[key].o[ci])}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row">{L('Ukupno', 'Total')}</th><td>{format(CIT.tot.d[ci])}</td><td>{format(CIT.tot.o[ci])}</td><td>{format(CIT.tot.d[ci] - CIT.tot.o[ci])}</td></tr></tfoot>
        </table></div>
      </div>
      <p className="v3-pop-source">{L('Prema zemlji državljanstva, ne zemlji podrijetla ili odredišta. DZS STAN-2026-2-1, tablica 2. CSV uključuje svih pet godina.', 'By country of citizenship, not country of origin or destination. CBS STAN-2026-2-1, table 2. CSV includes all five years.')}</p>
    </>}

    {panel === 'countries' && <>
      <div className="v3-pop-controls"><p className="v3-pop-note">{L('Najvećih 12 zemalja po doseljenima, uz ostatak do nacionalnog zbroja.', 'The top 12 countries by arrivals, plus the remainder to the national total.')}</p><label className="v3-pop-search"><Icon name="search" size={16} /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={L('Pronađite zemlju…', 'Find a country…')} aria-label={L('Pronađite zemlju', 'Find a country')} /></label></div>
      <div className="v3-pop-card"><div className="v3-pop-table-scroll" tabIndex={0} role="region" aria-label={L('Tablica podataka; pomaknite vodoravno za sve stupce', 'Data table; scroll horizontally for all columns')}><table className="v3-pop-table v3-pop-country-table"><caption className="v3-sr">{L('Zemlje podrijetla i odredišta, Hrvatska, ', 'Countries of origin and destination, Croatia, ') + DEMO.year}</caption>
        <thead><tr><th scope="col">{L('Zemlja', 'Country')}</th><th scope="col">{L('Doseljeni', 'Arrivals')}</th><th scope="col">{L('Odseljeni', 'Departures')}</th><th scope="col">{L('Saldo', 'Net')}</th></tr></thead>
        <tbody>{shownCountries.map(([name, arrivals, departures]) => <tr key={name} className={name === countries[countries.length - 1][0] ? 'is-remainder' : ''}><th scope="row">{countryLabel(name)}</th>
          <td className="v3-pop-bar-cell"><i aria-hidden="true" style={{ width: `${arrivals / countryMax * 100}%` }} /><span>{format(arrivals)}</span></td>
          <td className="v3-pop-bar-cell"><i aria-hidden="true" style={{ width: `${departures / countryMax * 100}%`, background: 'color-mix(in srgb, var(--coral) 18%, transparent)', borderColor: 'var(--coral)' }} /><span>{format(departures)}</span></td><td>{format(arrivals - departures)}</td></tr>)}
          {!shownCountries.length && <tr><td colSpan={4} className="v3-pop-empty">{L('Nema pronađenih zemalja.', 'No countries found.')} <button onClick={() => setQuery('')}>{L('Očisti pretragu', 'Clear search')}</button></td></tr>}</tbody>
        <tfoot><tr><th scope="row">{L('Ukupno · sve zemlje', 'Total · all countries')}</th><td>{format(DEMO.cTot[0])}</td><td>{format(DEMO.cTot[1])}</td><td>{format(DEMO.cTot[0] - DEMO.cTot[1])}</td></tr></tfoot>
      </table></div></div>
      <p className="v3-pop-source">{L('Zemlja podrijetla/odredišta ne mora biti zemlja državljanstva. „Ostale zemlje” je izračunat ostatak, a ne pojedinačna zemlja. DZS STAN-2026-2-1, tablica I 4. CSV uključuje cijeli popis.', 'Country of origin/destination may differ from country of citizenship. “Other countries” is a calculated remainder, not a single country. CBS STAN-2026-2-1, table I 4. CSV includes the complete list.')}</p>
    </>}

    {panel === 'municipal' && <>
      <div className="v3-pop-controls"><label className="v3-pop-field">{L('Županija', 'County')}<select value={municipalCounty} onChange={e => { setMunicipalCounty(e.target.value); onCounty?.(e.target.value); }}>{ISOS.map(iso => <option key={iso} value={iso}>{countyName(iso, lang)}</option>)}</select></label>
        <div className="v3-pop-segment" role="group" aria-label={L('Obuhvat koridora', 'Corridor scope')}><button aria-pressed={municipalMode === 'inter'} onClick={() => setMunicipalMode('inter')}>{L('Između županija', 'Between counties')}</button><button aria-pressed={municipalMode === 'local'} onClick={() => setMunicipalMode('local')}>{L('Unutar županije', 'Within county')}</button></div>
      </div>
      <div className="v3-pop-controls">{municipalMode === 'inter' && <div className="v3-pop-segment" role="group" aria-label={L('Smjer lokalnih koridora', 'Local corridor direction')}>
        {(['in', 'out', 'net'] as const).map(dir => <button key={dir} aria-pressed={municipalDirection === dir} onClick={() => setMunicipalDirection(dir)}>{dir === 'in' ? L('Dolazni', 'Inbound') : dir === 'out' ? L('Odlazni', 'Outbound') : L('Oba smjera · bruto', 'Both directions · gross')}</button>)}
      </div>}<label className="v3-pop-search"><Icon name="search" size={16} /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={L('Pronađite grad ili općinu…', 'Find a town or municipality…')} aria-label={L('Pronađite grad ili općinu', 'Find a town or municipality')} /></label></div>
      <div className="v3-pop-card"><div className="v3-pop-card-heading"><h3>{L('Najveći zabilježeni koridori', 'Largest recorded corridors')}</h3><span className="v3-pop-count">{shownMunicipalRows.length}/{municipalRows.length}</span></div>
        <div className="v3-pop-table-scroll" tabIndex={0} role="region" aria-label={L('Tablica podataka; pomaknite vodoravno za sve stupce', 'Data table; scroll horizontally for all columns')}><table className="v3-pop-table v3-pop-municipal-table"><caption className="v3-sr">{L('Izmjereni lokalni migracijski koridori, 2018.', 'Measured local migration corridors, 2018')}</caption><thead><tr><th scope="col">{L('Iz grada/općine', 'From town/municipality')}</th><th scope="col">{L('U grad/općinu', 'To town/municipality')}</th><th scope="col">{L('Preseljenja', 'Moves')}</th></tr></thead>
          <tbody>{shownMunicipalRows.map(([from, to, count]) => <tr key={`${from}-${to}`}><th scope="row" lang="hr">{municipalName(from)}{municipalTag(from) && <small>{municipalTag(from)}</small>}</th><td lang="hr">{municipalName(to)}{municipalTag(to) && <small>{municipalTag(to)}</small>}</td><td>{format(count)}</td></tr>)}
            {!shownMunicipalRows.length && <tr><td colSpan={3} className="v3-pop-empty">{query ? L('Nema pronađenih koridora.', 'No corridors found.') : municipalMode === 'local' ? L('Jedna JLS — nema koridora unutar županije.', 'A single municipality — no corridors within the county.') : L('Nema zabilježenih koridora prema drugim županijama.', 'No recorded corridors to other counties.')} {query && <button onClick={() => setQuery('')}>{L('Očisti pretragu', 'Clear search')}</button>}</td></tr>}</tbody>
        </table></div>
      </div>
      <p className="v3-pop-note">{L('Prikazani su najveći koridori dostupni u izvornom skupu, ne sva preseljenja. „Oba smjera” spaja dolazne i odlazne bruto tokove; neto saldo JLS-a nije objavljen u ovom skupu koridora. CSV sadrži sve retke odabranog obuhvata, bez filtra pretrage.', 'These are the largest corridors available in the source dataset, not every move. “Both directions” combines inbound and outbound gross flows; LAU net migration is not published in this corridor dataset. CSV contains every row for the selected scope, without the search filter.')}</p>
      <p className="v3-pop-source">{L('DZS posebna obrada · ', 'CBS special processing · ')}<a href="https://doi.org/10.1186/s40649-021-00093-0" target="_blank" rel="noreferrer">{L('Pitoski i sur. (2021.)', 'Pitoski et al. (2021)')}</a> · CC BY 4.0 · {L('jedina godina izmjerenih tokova na razini gradova/općina: 2018.', 'the only measured year at town/municipality level: 2018.')}</p>
    </>}
  </section>;
}
