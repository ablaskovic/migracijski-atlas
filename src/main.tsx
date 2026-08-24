import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

/* The boundary is above <App/> rather than inside it, because what it exists to
   survive is App failing to render at all — see the note in ErrorBoundary. */
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary><App /></ErrorBoundary>,
);
