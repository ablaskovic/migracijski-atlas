import { D, FLOWN, ISOS, KLAB, MXORD, REG, YEARS, denName, flowBadge, fsum, jlsVal, klasOf, mxCell, regVal, val, yrsCols, yrsOrder } from '../lib/metrics.ts';
import { jlsGeo } from '../lib/geoAsync.ts';
import { PAPER, paperCaveatLine, paperThrLine, regionReadingLine } from '../lib/credits.ts';
import { colors, countyName, domain, downloadFile, ranked, unitName, value, viewName, type AtlasState } from './model.ts';
import { exportFigure } from './figureExport.ts';

const SOURCE = 'DZS / CBS: https://podaci.dzs.hr';
const OD_SOURCE = 'Pitoski et al. 2021; CC BY 4.0; https://doi.org/10.1186/s40649-021-00093-0; DZS / CBS';
export function exportDataCSV(s: AtlasState) {
  const from = s.cum ? 2011 : YEARS[s.yi], year = YEARS[s.yi], hub = s.county ?? 'HR-21';
  const unit = s.den === 'abs' ? 'people' : s.den === 'rel11' ? '% of 2011 census' : unitName(s);
  let rows: (string | number)[][];
  if (s.view === 'flows' || s.view === 'matrix') {
    const pairs = s.view === 'flows' ? ISOS.filter(i => i !== hub).map(i => [hub, i]) : MXORD.flatMap(r => MXORD.filter(c => c !== r).map(c => [r, c]));
    rows = [['Selected county ISO', 'Selected county', 'Partner ISO', 'Partner', 'From year', 'To year', 'Direction', 'People', 'Selected to partner', 'Partner to selected', 'Net gain for selected', 'Method', 'Source'], ...pairs.map(([r, c]) => [r, D[r].n, c, D[c].n, from, year, s.dir, mxCell(r, c, s.dir, s.yi, s.cum), fsum(r, c, s.yi, s.cum), fsum(c, r, s.yi, s.cum), fsum(c, r, s.yi, s.cum) - fsum(r, c, s.yi, s.cum), flowBadge(s.yi, s.cum), OD_SOURCE])];
  } else if (s.view === 'municipalities') {
    const features = jlsGeo()?.features ?? [];
    rows = [['Municipality ID', 'Municipality', 'County', 'Year', 'Direction', 'People', 'Arrivals', 'Departures', 'Net', 'Source'], ...features.map(({ properties: p }) => [p.j, p.n, D[ISOS[p.c]].n, 2018, s.dir, jlsVal(p, s.dir), p.i, p.o, p.i - p.o, OD_SOURCE])];
  } else if (s.view === 'classify') {
    rows = [['County ISO', 'County', 'From year', 'To year', 'Net migration', 'Classification', 'Loss threshold', 'Threshold unit', 'Source', 'Study'], ...ISOS.map(i => [i, D[i].n, from, year, val(i, s.yi, 'tot', 'abs', true), KLAB[klasOf(i, s.yi, s.thr, s.thrRel, s.thrPct)], s.thrRel ? s.thrPct : s.thr, s.thrRel ? '% of 2011 census' : 'people', SOURCE, PAPER.citation + ' ' + PAPER.url])];
  } else if (s.view === 'regions') {
    rows = [['Region', 'Counties', 'From year', 'To year', 'Metric', 'Unit', 'Value', 'Source', 'Grouping note'], ...Object.keys(REG).map(k => [REG[k].name, REG[k].c.join(';'), from, year, s.flow, unit, regVal(k, s.yi, s.flow, s.den, s.cum), SOURCE, regionReadingLine()])];
  } else if (s.view === 'trends') {
    rows = [['County ISO', 'County', 'From year', 'To year', 'Metric', 'Unit', 'Value', 'Source'], ...yrsOrder(s.flow, s.den, yrsCols(s.cum)).flatMap(iso => yrsCols(s.cum).map(yi => [iso, D[iso].n, s.cum ? 2011 : YEARS[yi], YEARS[yi], s.flow, s.den === 'relest' ? denName(s.den, yi) : unit, value(iso, { ...s, yi }), SOURCE]))];
  } else {
    rows = [['County ISO', 'County', 'From year', 'To year', 'Metric', 'Unit', 'Value', 'Source'], ...ranked(s).map(iso => [iso, D[iso].n, from, year, s.flow, unit, value(iso, s), SOURCE])];
  }
  downloadFile('\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n'), 'text/csv;charset=utf-8', `atlas-${s.view === 'trends' ? `${s.cum ? 2011 : YEARS[0]}-${YEARS[YEARS.length - 1]}` : `${s.cum ? '2011–' : ''}${year}`}-${s.view === 'flows' ? `flows-${s.dir}` : s.view === 'map' || s.view === 'trends' ? s.flow : s.view}.csv`);
}

function tableFigure(s: AtlasState, light: boolean): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const matrix = s.view === 'matrix', cols = matrix ? MXORD : yrsCols(s.cum), rows = matrix ? MXORD : yrsOrder(s.flow, s.den, yrsCols(s.cum));
  const width = 1240, cellWidth = 940 / cols.length, height = 80 + rows.length * 27;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
  const textColor = light ? '#273f4d' : '#bfced7';
  const scale = colors(domain(s), light);
  const label = (text: string, x: number, y: number, size = 12) => { const el = document.createElementNS(svg.namespaceURI, 'text'); el.setAttribute('x', String(x)); el.setAttribute('y', String(y)); el.setAttribute('fill', textColor); el.setAttribute('font-size', String(size)); el.textContent = text; svg.append(el); };
  cols.forEach((col, i) => label(matrix ? String(col).slice(3) : String(YEARS[Number(col)]), 280 + i * cellWidth, 33, matrix ? 12 : 10));
  rows.forEach((row, ri) => {
    label((matrix ? row.slice(3) + ' · ' : '') + countyName(row, s.lang), 8, 66 + ri * 27, 12);
    cols.forEach((col, ci) => {
      const rect = document.createElementNS(svg.namespaceURI, 'rect');
      rect.setAttribute('x', String(275 + ci * cellWidth)); rect.setAttribute('y', String(49 + ri * 27)); rect.setAttribute('width', String(cellWidth - 3)); rect.setAttribute('height', '23'); rect.setAttribute('rx', '2');
      const source = document.querySelector<HTMLElement>(matrix ? `[data-matrix-cell="${ri * 21 + ci}"]` : `[data-grid-cell="${ri * cols.length + ci}"]`);
      rect.setAttribute('fill', source ? getComputedStyle(source).backgroundColor : matrix ? 'transparent' : scale(val(row, Number(col), s.flow, s.den, s.cum))); svg.append(rect);
    });
  });
  return svg;
}

export async function exportCurrentFigure(s: AtlasState, format: 'png' | 'svg', light: boolean) {
  const table = s.view === 'trends' || s.view === 'matrix';
  const svg = table ? tableFigure(s, light) : document.querySelector<SVGSVGElement>('.v3-workspace svg.v3-map');
  if (!svg || s.view === 'municipalities' && !jlsGeo()) throw Error('Figure is not ready');
  if (table) { svg.style.position = 'fixed'; svg.style.left = '-10000px'; document.body.append(svg); }
  const L = (hr: string, en: string) => s.lang === 'hr' ? hr : en;
  const flow = s.view === 'flows' || s.view === 'matrix', municipal = s.view === 'municipalities';
  const period = s.view === 'trends' ? `${s.cum ? 2011 : YEARS[0]}–${YEARS[YEARS.length - 1]}` : `${s.cum ? '2011–' : ''}${YEARS[s.yi]}`;
  const notes = [flow || municipal ? OD_SOURCE : SOURCE];
  if (flow) notes.push(flowBadge(s.yi, s.cum), L('IPF: struktura 2018. skalirana na odseljene DZS-a; doseljeni približno. Godišnja 2018. je izmjerena.', 'IPF: 2018 structure scaled to CBS out-margins; in-margins approximate. Annual 2018 is measured.'));
  if (s.view === 'flows') notes.push(L('Koridori ispod 5 osoba nisu ucrtani; potpuni podaci su u CSV-u.', 'Corridors under 5 people are not drawn; complete data is in the CSV.'));
  if (s.view === 'classify' || s.view === 'regions') notes.push(PAPER.citation, PAPER.url, paperCaveatLine());
  if (s.view === 'classify') notes.push(paperThrLine(s.thrRel));
  if (s.view === 'regions') notes.push(regionReadingLine());
  if (municipal) notes.push(L('Samo preseljenja između gradova/općina; uključena preseljenja unutar županije. Vanjske migracije nisu uključene.', 'Only moves between cities/municipalities, including within a county. External migration excluded.'));
  if (!flow && !municipal && s.flow !== 'ext' && s.flow !== 'nat') notes.push(L('Prije 2007. unutarnji doseljeni i odseljeni ne podudaraju se potpuno.', 'Before 2007, internal arrivals and departures do not fully balance.'));
  const direction = s.dir === 'in' ? L('Doseljavanje', 'Arrivals') : s.dir === 'out' ? L('Odseljavanje', 'Departures') : L('Saldo odabrane županije', 'Net gain for selected county');
  try {
    await exportFigure(svg, format, {
      title: `${L('Migracijski atlas', 'Migration atlas')} · ${viewName(s.view, s.lang)}`,
      subtitle: `${flow || municipal ? direction : FLOWN[s.flow]} · ${period} · ${flow || municipal ? L('broj osoba', 'people') : unitName(s)}${s.view === 'flows' ? ' · ' + countyName(s.county ?? 'HR-21', s.lang) : ''}`,
      legend: s.view === 'classify' ? `${KLAB.gain}: > 0 · ${KLAB.neu}: ${s.thrRel ? `−${s.thrPct}%` : `−${s.thr}`} … 0 · ${KLAB.loss}: < ${s.thrRel ? `−${s.thrPct}%` : `−${s.thr}`}` : flow || municipal ? L('Zeleno: doseljavanje / dobitak · koraljno: odseljavanje / gubitak. Debljina linije = broj osoba.', 'Teal: arrivals / gains · coral: departures / losses. Line width = people.') : L('Koraljno: gubitak · sivo: oko nule · zeleno: dobitak. Skala je stalna kroz godine.', 'Coral: loss · grey: around zero · teal: gain. Scale is fixed across years.'),
      notes, filename: `atlas-v3-${s.view}-${period}`,
    });
  } finally { if (table) svg.remove(); }
}
