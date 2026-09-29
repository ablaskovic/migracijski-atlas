import { rememberVersion, versionHref, type Version } from './version.ts';

export default function VersionSwitch({ version }: { version: Version }) {
  const hr = document.documentElement.lang === 'hr';
  // "v2" and "v3" alone do not say what either is; the name says it and keeps the visible code first (WCAG 2.5.3).
  const describe = (v: Version) => v + ' · ' + (v === 'v2' ? (hr ? 'klasična verzija atlasa' : 'classic version of the atlas') : (hr ? 'nova verzija atlasa' : 'new version of the atlas'));
  return <nav className="atlas-version-switch" aria-label={hr ? 'Verzija atlasa' : 'Atlas version'}>
    {(['v2', 'v3'] as const).map(v => <a key={v} href={versionHref(v)}
      aria-label={describe(v)} title={describe(v)}
      aria-current={version === v ? 'page' : undefined}
      onClick={e => { if (version === v) e.preventDefault(); else rememberVersion(version); }}>
      {v}<span className="atlas-version-dot" aria-hidden="true" />
    </a>)}
  </nav>;
}
