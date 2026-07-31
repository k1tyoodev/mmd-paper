import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './styles/global.css';

// Vercel Analytics requires Vercel's same-origin insights endpoint. Keep it
// opt-in so non-Vercel production hosts do not request a route they cannot serve.
if (import.meta.env.PROD && import.meta.env.VITE_VERCEL_ANALYTICS === 'true') {
  void import('@vercel/analytics')
    .then(({ inject }) => inject())
    .catch(() => {
      // Optional telemetry must never break the app.
    });
}

const root = document.querySelector('#app');

if (!root) {
  throw new Error('Missing #app root element');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
