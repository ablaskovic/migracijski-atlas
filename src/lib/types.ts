/* Shared types. The State literal unions mirror the v4 single-file control
   values; scripts/verify.cjs exercises the transitions over them. */

export type View = 'saldo' | 'klas' | 'reg' | 'flow' | 'mx' | 'jmap' | 'yrs';
export type Flow = 'tot' | 'int' | 'ext' | 'nat' | 'all';
export type Den = 'abs' | 'rel11' | 'relest';
export type Dir = 'out' | 'in' | 'net';
export type Klas = 'gain' | 'neu' | 'loss';
export type JlsTab = 'inter' | 'loc';
export type CitzTab = 'grp' | 'zem';
export type AgeTab = 'ext' | 'int';

export interface State {
  view: View;
  flow: Flow;
  den: Den;
  cum: boolean;
  yi: number;
  thr: number;
  thrRel: boolean;      /* klas threshold as % popisa 2011 instead of persons */
  thrPct: number;       /* relative threshold value, percent of 2011 census */
  playing: boolean;
  hl: string | null;
  sel: string | null;   /* non-null whenever view === 'flow' (autoselect invariant) */
  pair: string | null;  /* corridor card partner in flow view */
  pairHl: [string, string] | null;  /* hovered matrix cell (origin, destination) */
  /* hovered cell in the Godine grid, as (county, year index). Its own field
     rather than reusing `hl` + `yi`: the cell names a year that is not the
     selected one, and pointing `hl` at it while the tooltip read `S.yi` would
     have reported a different column's numbers under the hovered county's name. */
  yrHl: [string, number] | null;
  jlsHl: number | null; /* hovered JLS feature index (j) in jmap view */
  regHl: string | null; /* hovered region key in reg view — lights its counties */
  dir: Dir;
  flowSeen: boolean;
  labels: boolean;      /* county name labels on the map */
  citz: boolean;
  jls: boolean;
  age: boolean;         /* dob i spol chip panel */
  help: boolean;        /* "Kako čitati" glossary overlay */
  jlsTab: JlsTab;
  citzTab: CitzTab;
  ageTab: AgeTab;
  story: number | null; /* active Nalazi preset (banner caption index) */
}
export type Patch = Partial<State>;

/* ── generated payload shapes (outputs of tools/pipeline/) ── */

export interface County {
  n: string;              /* full name */
  p: number;              /* census 2011 population */
  ii: number[]; oi: number[]; ie: number[]; oe: number[];   /* in/out × internal/external per year */
  pe: (number | null)[];  /* mid-year population estimate, gaps possible */
  nat: number[];          /* natural change per year */
}
export interface AtlasRaw { years: number[]; c: Record<string, County> }

export interface CitSeries { d: number[]; o: number[] }   /* doseljeni / odseljeni */
export interface CitData { years: number[]; tot: CitSeries; g: Record<string, CitSeries> }

export type JlsRow = [from: number, to: number, n: number];
export interface JlsData {
  names: [name: string, countyIx: number][];
  c: Record<string, { out: JlsRow[]; in: JlsRow[]; loc: JlsRow[] }>;
}

export type OdMatrix = Record<string, Record<string, number[]>>;

/* demo.json — national age/sex + country-of-origin panel (DZS STAN I T3 / II T2 / I T4) */
export interface DemoData {
  year: number;
  ages: string[];
  ext: { d: number[]; o: number[] };   /* vanjska by age group */
  extM: { d: number; o: number };      /* muškarci totals (vanjska) */
  intm: number[];                      /* unutarnja preseljeni by age group */
  intTot: number;                      /* unutarnja ukupno */
  intM: number;                        /* unutarnja muškarci */
  countries: [name: string, d: number, o: number][];
  cTot: [d: number, o: number];        /* vanjska ukupno */
}

export interface CountyProps { shapeISO: string; shapeName: string }
export interface RegionProps { reg: string }
/* geo_jls.json — measured 2018 per-JLS internal-migration totals baked into geometry */
export interface JlsProps { j: number; n: string; c: number; i: number; o: number }
