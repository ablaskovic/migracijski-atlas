import { L } from './i18n.ts';
/* ── What the atlas collects ────────────────────────────────────────────────
   Same reasoning as credits.ts and licences.ts, applied to the one fact about
   this page that a reader could not check for themselves.

   The page mounts Vercel Web Analytics and Speed Insights. Both render nothing
   and each injects one <script defer>; in a production build with no `dsn` they
   resolve to same-origin paths that Vercel's edge proxies, which is why the
   "reaches no third-party origin" invariant the suite asserts still holds. But
   same-origin is a routing fact, not a privacy one: the beacons carry page views
   and Web Vitals to Vercel, whose edge sees the IP and User-Agent in order to
   derive a country and a daily visitor hash.

   None of that was written down anywhere a visitor could read it. A page that
   names four upstream sources, three licences, a DOI, the author and the
   copyright year had no line saying it collects anything at all — the glossary's
   eight sections, the footer, index.html's <noscript>, the README and LICENSE
   were all silent. For an EU audience that is a transparency gap (GDPR Art. 13)
   whether or not consent is separately owed; cookieless analytics that stores
   nothing on the device is the easy case for consent and does not excuse the
   disclosure.

   So this is disclosure, not a consent banner: a modal in front of a map would
   be a heavier answer than the processing warrants, and a banner nobody reads is
   not transparency either. One module, so the glossary section and the footer
   clause cannot drift apart — the same arrangement PAPER and the source list are
   under. Functions rather than constants, because this module's body runs at
   import time, before App's module scope calls setLang. */

/** The processor, named — the glossary links it, the footer does not have room. */
export const ANALYTICS_VENDOR = 'Vercel';
export const ANALYTICS_URL = 'https://vercel.com/docs/analytics/privacy-policy';

/** One sentence for the footer's fixed lane — and it has to *fit* that lane.
    Measured at 1440: the footer wraps to 75 px with room to spare on its last
    line, and the first draft of this sentence was long enough to take a fourth
    one — 88 px of footer, 557 px of map, i.e. the disclosure quietly billed the
    map 13 px. The clause is a sentence shorter now and the full statement is in
    the glossary, where there is room for the reason. */
export const privacyShort = (): string => L(
  'Mjerenje posjeta: Vercel Web Analytics, bez kolačića i pohrane na uređaju.',
  'Usage measurement: Vercel Web Analytics, no cookies or on-device storage.');

/** The full statement, for the glossary, which has room for the reason. */
/* Scoped to the MEASUREMENT, the way privacyShort already is. Unscoped it said
   "nothing is stored on your device" — and privacyState, four lines below and
   rendered in the same glossary section, says the language choice is stored
   locally. Both sentences are true of their own subject and the pair is a
   contradiction on the page, in the one section a reader consults precisely
   because they do not want to take it on trust. The claim that matters is
   unchanged and is the narrower one: the analytics store nothing. */
/* …and the third thing a Speed Insights beacon carries, which "mjere brzine
   učitavanja" does not cover.

   Read out of the script the deployed origin actually serves
   (/_vercel/speed-insights/script.js): every vital is posted as
   {id, type, route, href, value, attribution}, and attribution is
   {eventTarget: largestShiftTarget} for CLS, {eventTarget, eventType} for
   INP/FID, and {eventTarget: element} for anything carrying one. eventTarget is
   web-vitals' CSS selector for the element the measurement is about — a chain of
   tag names, ids and classes, e.g. `#map>g>path.cnt.sel`.

   `beforeSend` cannot strip it: the same script calls it with
   {type: "vital", url, route} only, so dropHash below never sees the field. What
   leaves is therefore which CONTROL a slow interaction was on, and it is worth
   stating that it is not which county: web-vitals builds those selectors from
   nodeName, id and className, and this app's identity lives in `data-iso`,
   `data-j` and `data-a`/`data-b`, none of which appear in one. */
export const privacyNote = (): string => L(
  'Atlas koristi Vercel Web Analytics i Speed Insights: bilježe se posjet stranici i mjere brzine učitavanja. '
  + 'Uz mjeru brzine šalje se i CSS selektor elementa na koji se odnosi — naziv elementa, njegov id i CSS klase '
  + '(npr. gumba koji ste pritisnuli); ne i županija, koridor ni godina koju gledate. '
  + 'Mjerenje ne koristi kolačiće i ništa ne pohranjuje na vašem uređaju. IP adresa i podaci preglednika obrađuju se na '
  + 'Vercelovoj mreži da bi se izveli država posjeta i dnevni anoniman otisak, i ne pohranjuju se kao takvi. '
  + 'Ne postoji prijava, korisnički račun ni profiliranje, a podaci se ne prodaju niti ustupaju trećima.',
  'The atlas uses Vercel Web Analytics and Speed Insights: page views and load-speed metrics. '
  + 'A speed measurement also carries a CSS selector for the element it is about — an element name, its id and '
  + 'its CSS classes (the button you pressed, say); not the county, corridor or year you are looking at. '
  + 'The measurement sets no cookies and stores nothing on your device. Your IP address and browser details are '
  + 'processed at Vercel’s edge to derive a country and a daily anonymous fingerprint, and are not retained '
  + 'as such. There is no sign-in, no account and no profiling, and nothing is sold or passed to third parties.');

/** The half that is a property of the design rather than of the vendor. */
export const privacyState = (): string => L(
  'Stanje atlasa živi u fragmentu URL-a (#v=…&y=…), koji preglednik nikada ne šalje poslužitelju — '
  + 'ono što gledate ostaje na vašem uređaju. Jedino što se sprema lokalno jest odabir jezika.',
  'The atlas’s state lives in the URL fragment (#v=…&y=…), which a browser never sends to a server — '
  + 'what you are looking at stays on your device. The only thing stored locally is your language choice.');

/* The redaction that makes the sentence above true.

   Both beacons ship `location.href`, fragment and all. Measured against the
   deployed insights script: POST /_vercel/insights/view carried
   {"o":"…/?l=en#l=en&v=flow&c=0&y=2018&s=HR-21&pp=HR-01"}, and every Web Vital
   carries an `href` read at measurement time, so the INP and CLS beacons report
   whichever view the reader had moved to by then. That is the county, the
   corridor partner, the view, the direction and the year leaving the device —
   to the same edge privacyNote says derives a country from the IP — while
   privacyState promises in as many words that a browser never sends the
   fragment to a server and that what you are looking at stays on your device.
   The disclosure that MA3 chose instead of a consent gate misstated the one
   fact it exists to state.

   Both packages document `beforeSend` for exactly this, and it costs nothing
   analytically: Vercel reports paths, and every view of this atlas shares one
   path, so the fragment was never a usable dimension. It lives here, beside the
   sentence it makes true, so neither can be edited without the other in view. */
export const dropHash = <E extends { url: string }>(e: E): E => ({ ...e, url: e.url.split('#')[0] });
