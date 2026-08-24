import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

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
    return (
      <div className="boot" role="alert">
        <div>
          <span className="boot-eyebrow">DZS · 1998.–2025.</span>
          <span className="boot-title">Migracijski atlas županija</span>
        </div>
        <p className="boot-fail" id="renderFail" style={{ opacity: 1 }}>
          Prikaz se nije mogao iscrtati. <a href={location.pathname}>Osvježite stranicu</a>
          {' — ili '}<a href={location.pathname} id="renderFailPlain">otvorite bez poveznice na prikaz</a>.
          {' / The view could not be drawn. '}
          <a href={location.pathname + location.hash}>Reload the page</a>
          {' — or '}<a href={location.pathname}>open it without the permalink</a>.
        </p>
      </div>
    );
  }
}
