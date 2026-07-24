/* Shared types. The State literal unions mirror the v4 single-file control
   values; scripts/verify.cjs exercises the transitions over them. */

export type View = 'saldo' | 'klas' | 'reg' | 'flow';
export type Flow = 'tot' | 'int' | 'ext' | 'nat' | 'all';
export type Den = 'abs' | 'rel11' | 'relest';
export type Dir = 'out' | 'in' | 'net';
export type Klas = 'gain' | 'neu' | 'loss';
export type JlsTab = 'inter' | 'loc';

export interface State {
  view: View;
  flow: Flow;
  den: Den;
  cum: boolean;
  yi: number;
  thr: number;
  playing: boolean;
  hl: string | null;
  sel: string | null;   /* non-null whenever view === 'flow' (autoselect invariant) */
  dir: Dir;
  flowSeen: boolean;
  citz: boolean;
  jls: boolean;
  jlsTab: JlsTab;
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

export interface CountyProps { shapeISO: string; shapeName: string }
export interface RegionProps { reg: string }
