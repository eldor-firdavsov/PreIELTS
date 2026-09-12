import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppProviders } from './app/providers.tsx';
import { AppRouter } from './app/router.tsx';
import { initTheme } from './lib/theme.ts';

// Before React mounts, so a student who chose dark never gets a white flash.
initTheme();

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
);
