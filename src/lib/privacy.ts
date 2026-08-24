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

/** One sentence for the footer's fixed lane. */
export const privacyShort = (): string => L(
  'Mjerenje posjeta: Vercel Web Analytics — bez kolačića i bez podataka pohranjenih na uređaju.',
  'Usage measurement: Vercel Web Analytics — no cookies and nothing stored on your device.');

/** The full statement, for the glossary, which has room for the reason. */
export const privacyNote = (): string => L(
  'Atlas koristi Vercel Web Analytics i Speed Insights: bilježe se posjet stranici i mjere brzine učitavanja. '
  + 'Nema kolačića i ništa se ne pohranjuje na vašem uređaju. IP adresa i podaci preglednika obrađuju se na '
  + 'Vercelovoj mreži da bi se izveli država posjeta i dnevni anoniman otisak, i ne pohranjuju se kao takvi. '
  + 'Ne postoji prijava, korisnički račun ni profiliranje, a podaci se ne prodaju niti ustupaju trećima.',
  'The atlas uses Vercel Web Analytics and Speed Insights: page views and load-speed metrics. '
  + 'There are no cookies and nothing is stored on your device. Your IP address and browser details are '
  + 'processed at Vercel’s edge to derive a country and a daily anonymous fingerprint, and are not retained '
  + 'as such. There is no sign-in, no account and no profiling, and nothing is sold or passed to third parties.');

/** The half that is a property of the design rather than of the vendor. */
export const privacyState = (): string => L(
  'Stanje atlasa živi u fragmentu URL-a (#v=…&y=…), koji preglednik nikada ne šalje poslužitelju — '
  + 'ono što gledate ostaje na vašem uređaju. Jedino što se sprema lokalno jest odabir jezika.',
  'The atlas’s state lives in the URL fragment (#v=…&y=…), which a browser never sends to a server — '
  + 'what you are looking at stays on your device. The only thing stored locally is your language choice.');
