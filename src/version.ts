export type Version = 'v2' | 'v3';

export function selectedVersion(): Version {
  const explicit = new URLSearchParams(location.search).get('version');
  if (explicit === 'v2' || explicit === 'v3') return explicit;
  // A non-empty legacy hash names a v2 analysis; every other URL opens v3.
  if (location.hash && !location.hash.startsWith('#explore=')) return 'v2';
  return 'v3';
}

export function versionHref(version: Version): string {
  const url = new URL(location.href);
  url.searchParams.set('version', version);
  let stored = '';
  try { stored = sessionStorage.getItem(`atlas-${version}-hash`) ?? ''; } catch { /* Storage is optional. */ }
  // The stored view kept its own l=, which flipped the language on every switch: the reader's current one goes instead.
  const view = stored.replace(/^#/, '').split('&').filter(Boolean), lang = 'l=' + (document.documentElement.lang === 'en' ? 'en' : 'hr'), at = view.findIndex(part => part.startsWith('l='));
  if (at < 0) view.push(lang); else view[at] = lang;
  url.hash = view.join('&');
  // A rewritten path may start with //; keep it a path on this origin.
  return url.href;
}

export function rememberVersion(current: Version) {
  try { sessionStorage.setItem(`atlas-${current}-hash`, location.hash); } catch { /* Storage is optional. */ }
}
