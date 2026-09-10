import { rememberVersion, versionHref, type Version } from './version.ts';

export default function VersionSwitch({ version }: { version: Version }) {
  return <nav className="atlas-version-switch" aria-label={document.documentElement.lang === 'hr' ? 'Verzija atlasa' : 'Atlas version'}>
    {(['v2', 'v3'] as const).map(v => <a key={v} href={versionHref(v)}
      aria-current={version === v ? 'page' : undefined}
      onClick={e => { if (version === v) e.preventDefault(); else rememberVersion(version); }}>
      {v}<span className="atlas-version-dot" aria-hidden="true" />
    </a>)}
  </nav>;
}
