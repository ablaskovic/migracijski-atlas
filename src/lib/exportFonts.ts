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

import { FONT_NOTICE } from './licences.ts';

type Face = { family: string; weight: number | string; url: string };
const FACES: Face[] = [
  { family: 'IBM Plex Mono', weight: 400, url: monoLatin },
  { family: 'IBM Plex Mono', weight: 400, url: monoLatinExt },
  { family: 'IBM Plex Mono', weight: 500, url: mono5Latin },
  { family: 'IBM Plex Mono', weight: 500, url: mono5LatinExt },
  /* One entry per FILE, with the weight range in the descriptor. Oswald was
     listed four times over two files, so every export embedded both Oswald
     subsets twice — the same base64 payload, byte for byte, in two @font-face
     rules that differ only in `font-weight`. CSS Fonts 4 accepts a range there,
     and the atlas uses Oswald at 500 and 600 from a variable file, so one rule
     per subset covers both. */
  { family: 'Oswald', weight: '500 600', url: oswaldLatin },
  { family: 'Oswald', weight: '500 600', url: oswaldLatinExt },
];

let css = '';
let pending: Promise<string> | null = null;
/* Long enough that an ordinary slow connection still embeds real faces, short
   enough that a wedged one does not hold a button for the session. */
const FONT_TIMEOUT = 8000;

async function dataUri(url: string, signal?: AbortSignal): Promise<string> {
  const r0 = await fetch(url, { signal });
  /* `.blob()` succeeds on a 404 body just as happily as on a font, and the
     result is a perfectly valid data: URI for an HTML error page. The faces are
     hashed assets under /assets/, which vercel.json deliberately does NOT rewrite
     to index.html — so after a redeploy an open tab's filenames are gone and the
     fetch really does 404. Without this check the six template strings below
     still build, `css` is assigned a non-empty string, and from then on
     `fontCss()` is truthy, every export embeds six broken faces, and the
     short-circuit at the top of ensureFonts means the retry in its own `.catch`
     can never fire again for the life of the tab. Rejecting restores the
     documented degradation: '' , the families named, and a retry next time. */
  if (!r0.ok) throw new Error('font fetch ' + r0.status + ': ' + url);
  const b = await r0.blob();
  /* an error page is small and a woff2 subset is not — the smallest face here is
     13,3 kB — so this catches a 200-with-a-body-that-is-not-a-font too */
  if (b.size < 1000) throw new Error('font fetch returned a non-font body: ' + url);
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
  /* Bounded. A rejecting fetch was always handled; a *hanging* one was not, and
     hanging is the common shape of a bad network — a captive portal or a proxy
     that accepts the connection and never answers. `pending` then held a promise
     that would never settle, and every later caller got that same promise back:
     exportPNG awaits it as its first statement, so #pngBtn stayed disabled
     reading '…' and the live region stayed "Priprema PNG-a…" for the rest of the
     session, with every further click landing on a disabled button. Only a
     reload recovered. The abort makes the wait fail like any other failure, which
     the catch below already knows how to degrade — the figure names the families,
     which is the documented fallback. */
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FONT_TIMEOUT);
  pending ??= Promise.all(FACES.map(async f => {
    const uri = await dataUri(f.url, ac.signal);
    return `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};`
      + `src:url(${uri}) format('woff2')}`;
  })).then(parts => { css = `/* ${FONT_NOTICE} */` + parts.join(''); return css; })
    .catch(() => { pending = null; return ''; })
    .finally(() => clearTimeout(timer));
  return pending;
}
