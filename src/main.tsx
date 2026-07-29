import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App.tsx'
import './index.css'
import { runNavAccessConsistencyCheck } from './lib/navAccessConsistency'

if (import.meta.env.DEV) {
  runNavAccessConsistencyCheck();
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
