import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadConfig } from './lib/config';
import './styles.css';

// Configuration must exist before anything renders: the auth mode decides
// whether the first screen is a sign-in page or the dashboard.
loadConfig().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
