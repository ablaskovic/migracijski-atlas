import { Component } from 'react';
import type { ErrorInfo, MouseEvent, ReactNode } from 'react';

/* The last thing between a render throw and a blank cream rectangle.

   React 19's default for an uncaught render or commit error is to unmount the
   root — and by then createRoot has already replaced index.html's `.boot`
   markup, so the ten-second "Učitavanje predugo traje / This is taking too long"
   line the front door ships for exactly this purpose cannot come back. Measured
   against dist/: on `#v=saldo&c=1&y=2024&s=HR-18`, one TypeError thrown from
   inside the commit phase took #root's innerHTML from 174.323 characters to 0,
   document.body.innerText to the empty string, and
   querySelectorAll('a,button,select,input') from 42 to 0 — so no reload
   affordance of any kind was left. The background stayed rgb(244,245,242) and
   the tab title stayed "Migracijski atlas županija · 1998.–2025.", so the tab
   looks alive; the only trace is two console lines a reader never sees.

   The hash is untouched by any of that, so a hash-deterministic defect
   reproduces on every reload and for every recipient of the shared link, with no
   in-page way out. index.html's own note claims the boot-fail message covers
   this ("a malformed permalink used to be another") — true only before React
   mounts, which is the half this covers.

   Deliberately static: bilingual, because a render throw may well have come from
   the i18n path, and built from literals and `location` alone so the fallback
   cannot itself re-throw. The two affordances are the two #bootFail already
   offers — reload, and reload without the fragment — because a permalink is the
   most likely thing to have carried the reader into an unrenderable state. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(err: Error, info: ErrorInfo) {
    /* the console is the only place a cause can go, and it is where the two
       export handlers already put theirs */
    console.error('render failed', err, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    /* Two addresses, and both of them whole. Each of the four links was built
       from `location.pathname` alone or, for one of them, pathname + hash — so
       three things were wrong at once.
       The Croatian "Osvježite stranicu" was byte-identical to the "otvorite bez
       poveznice" beside it: the link that says RELOAD threw away the very
       permalink that carried the reader here, and the reader was offered two
       different things to try when there was one. Measured on a forced render
       throw at `#v=saldo&c=1&y=2024&s=HR-18`, pressing it landed on
       `…#v=saldo&c=1&y=2024` with `s=HR-18` gone.
       All four dropped `location.search`, and `?l=en` is the English UI's only
       crawlable address — sitemap.xml lists it and index.html hreflangs it.
       storeLang() persists a language only on an explicit toggle, so a reader who
       arrived on that shared link has nothing stored and every affordance here
       returned them to the Croatian page.
       And the English "Reload the page" pointed at the URL already in the bar,
       which the navigate algorithm treats as a same-document fragment
       navigation: measured, no request, no reload, #renderFail still on screen
       and the href unchanged — App is unmounted, so nothing answers the popstate
       either. It only reloaded when the URL happened to carry a query string.
       And every one of them was built from a RAW `location.pathname`, which on
       this deploy is attacker-shaped. vercel.json rewrites index.html for every
       path outside /assets/ and /fonts/, so `https://migracijski-atlas.hr//evil.example/`
       is a URL the site answers with the app — and there `location.pathname` is
       the string `//evil.example/`, which as an href is a protocol-relative URL
       the browser resolves against the scheme alone. Measured on a forced render
       throw at that address: all four links, the two reading “Osvježite
       stranicu” / “Reload the page” among them, resolved to
       http://evil.example/ — off-origin, under the atlas’s own eyebrow and
       title, at the moment the reader has been told something went wrong and
       asked to click. `location.origin` is a plain string read that cannot
       throw, so the rule below still holds; absolute, a leading `//` in the path
       can no longer be read as an authority.
       `location.reload()` is a literal call on `location`, inside this file's own
       "built from literals and location alone" rule, and it re-requests the same
       URL, which is what the word promises. The plain pair keeps the query and
       drops only the fragment, which is exactly what it says. */
    const at = location.origin + location.pathname + location.search;
    const here = at + location.hash;
    const plain = at;
    const reload = (e: MouseEvent) => { e.preventDefault(); location.reload(); };
    return (
      <div className="boot" role="alert">
        <div>
          <span className="boot-eyebrow">DZS · 1998.–2025.</span>
          <span className="boot-title">Migracijski atlas županija</span>
        </div>
        <p className="boot-fail" id="renderFail" style={{ opacity: 1 }}>
          Prikaz se nije mogao iscrtati. <a href={here} onClick={reload}>Osvježite stranicu</a>
          {' — ili '}<a href={plain} id="renderFailPlain">otvorite bez poveznice na prikaz</a>.
          {' / The view could not be drawn. '}
          <a href={here} onClick={reload}>Reload the page</a>
          {' — or '}<a href={plain}>open it without the permalink</a>.
        </p>
      </div>
    );
  }
}
