const paths = {
  map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
  trend: 'M4 4v16h16M7 14l4-5 4 3 5-7',
  flow: 'M5 6h13m-4-4 4 4-4 4M19 18H6m4-4-4 4 4 4',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  sun: 'M12 3V1m0 22v-2M3 12H1m22 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4m0-12.8 1.4-1.4M4.2 19.8l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z',
  share: 'M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  info: 'M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  close: 'm6 6 12 12M6 18 18 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  reset: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  chevron: 'm9 5 7 7-7 7',
  play: 'm8 4 12 8-12 8V4Z',
  pause: 'M8 4v16M16 4v16',
  check: 'm5 12 4 4L19 6',
  external: 'M13 3h8v8m0-8L10 14M10 5H3v16h16v-7',
} as const;

export default function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
