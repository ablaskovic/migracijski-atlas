import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

/* The boundary is above <App/> rather than inside it, because what it exists to
   survive is App failing to render at all — see the note in ErrorBoundary. */
/* StrictMode does nothing in a production build — the extra render, the extra
   effect cycle and the warnings are development-only, and the wrapper itself
   is an empty passthrough there. What it buys in dev is the double-invoke:
   every effect is mounted, torn down and mounted again, so an effect whose
   cleanup does not undo its setup
   shows up while the change that broke it is still on screen. Every effect in
   this app is already written that way: useGeo adds and deletes its
   subscriber and sets and clears its warm timer, the hash-sync pair and
   popstate add and remove their listeners, suspendMap sets tabindex -1 and
   restores it, useZoom removes the wheel and click handlers it added, and
   MapView cancels its deferred retry. App's `up()` updater is idempotent too —
   setLang and storeLang write the same value twice — and must stay so, because
   a state updater may be called twice for one dispatch.
   Below the boundary, so a render that throws is still caught by it. */
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary><StrictMode><App /></StrictMode></ErrorBoundary>,
);
