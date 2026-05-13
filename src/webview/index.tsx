import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const mountApp = () => {
  try {
    const container = document.getElementById('root');
    if (!container) {
      console.error("CRITICAL: Could not find element with id 'root'. Check webview.html.");
      return;
    }

    console.log("Found #root, mounting React App...");
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log("React App render complete.");
  } catch (error) {
    console.error("CRITICAL: Failed to initialize React App:", error);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp);
} else {
  mountApp();
}
