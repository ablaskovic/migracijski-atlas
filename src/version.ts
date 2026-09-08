export type Version = 'v2' | 'v3';

export function selectedVersion(): Version {
  const explicit = new URLSearchParams(location.search).get('version');
  if (explicit === 'v2' || explicit === 'v3') return explicit;
  // A non-empty legacy hash names a v2 analysis, regardless of saved preference.
  if (location.hash && !location.hash.startsWith('#explore=')) return 'v2';
  if (location.hash.startsWith('#explore=')) return 'v3';
  try { if (sessionStorage.getItem('atlas-version') === 'v2') return 'v2'; } catch { /* Storage is optional. */ }
  return 'v3';
}

export function versionHref(version: Version): string {
  const url = new URL(location.href);
  url.searchParams.set('version', version);
  url.hash = '';
  try { url.hash = sessionStorage.getItem(`atlas-${version}-hash`) ?? ''; } catch { /* Storage is optional. */ }
  // A rewritten path may start with //; keep it a path on this origin.
  return url.href;
}

export function rememberVersion(current: Version, next: Version) {
  try { sessionStorage.setItem(`atlas-${current}-hash`, location.hash); } catch { /* Storage is optional. */ }
  try { sessionStorage.setItem('atlas-version', next); } catch { /* Explicit URL still works. */ }
}
