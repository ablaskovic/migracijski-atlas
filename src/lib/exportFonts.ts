/* Fonts for the exported figure, embedded rather than named.

   Both formats draw text in two places and only one of them could reach the
   real faces. The band (title, eyebrow, legend labels, credits) is drawn by the
   page — on a canvas for the PNG, into the document for the SVG — so it renders
   in Oswald and IBM Plex Mono. The map itself is serialised and rasterised
   through a blob-URL `<img>`, and that document is its own browsing context: it
   cannot see `document.fonts`, so every in-map string — matrix numbers, county
   labels — fell back to whatever the machine happened to have installed. One
   artifact, two mono fonts. The SVG twin was worse: it names families and
   embeds nothing, so it renders in whatever the journal's toolchain has.

   So the faces travel with the figure. Fetched at export time rather than
   imported, because a static import puts ~130 KB of base64 in the entry chunk
   for a feature most readers never use; fetched, it costs one same-origin
   request against an immutable cache, and only when someone exports. App warms
   it on mount so the click is instant.

   Only the two families the exported document actually draws with: IBM Plex
   Mono at 400 and 500, and Oswald (one file per subset covers both weights it
   is used at). IBM Plex Sans is deliberately absent — the only text that asks
   for it is the PNG's canvas legend, which is drawn by the page and already has
   the real face. Both subsets of each, because Croatian county names live in
   latin-ext: č, ć, š, ž and đ are all outside latin. */

import monoLatin from '../fonts/ibm-plex-mono-400-latin.woff2';
import monoLatinExt from '../fonts/ibm-plex-mono-400-latin-ext.woff2';
import mono5Latin from '../fonts/ibm-plex-mono-500-latin.woff2';
import mono5LatinExt from '../fonts/ibm-plex-mono-500-latin-ext.woff2';
import oswaldLatin from '../fonts/oswald-latin.woff2';
import oswaldLatinExt from '../fonts/oswald-latin-ext.woff2';

type Face = { family: string; weight: number; url: string };
const FACES: Face[] = [
  { family: 'IBM Plex Mono', weight: 400, url: monoLatin },
  { family: 'IBM Plex Mono', weight: 400, url: monoLatinExt },
  { family: 'IBM Plex Mono', weight: 500, url: mono5Latin },
  { family: 'IBM Plex Mono', weight: 500, url: mono5LatinExt },
  { family: 'Oswald', weight: 500, url: oswaldLatin },
  { family: 'Oswald', weight: 500, url: oswaldLatinExt },
  { family: 'Oswald', weight: 600, url: oswaldLatin },
  { family: 'Oswald', weight: 600, url: oswaldLatinExt },
];

let css = '';
let pending: Promise<string> | null = null;

async function dataUri(url: string): Promise<string> {
  const b = await (await fetch(url)).blob();
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('font read failed: ' + url));
    r.readAsDataURL(b);
  });
}

/** The @font-face block, or '' if it has not been fetched (or could not be). */
export const fontCss = (): string => css;

/** Fetch once, cache for the session. Safe to call repeatedly. */
export function ensureFonts(): Promise<string> {
  if (css) return Promise.resolve(css);
  /* No unicode-range: the exported document is a fixed set of glyphs, and the
     subsets do not overlap, so the browser can pick per codepoint on its own.
     A failed fetch is not worth failing an export over — the figure then names
     the families as it always did, which is the behaviour being improved on. */
  pending ??= Promise.all(FACES.map(async f => {
    const uri = await dataUri(f.url);
    return `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};`
      + `src:url(${uri}) format('woff2')}`;
  })).then(parts => { css = parts.join(''); return css; })
    .catch(() => { pending = null; return ''; });
  return pending;
}
