import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

// Global error handlers — catch errors outside React's render cycle
// (async handlers, timers, Tauri event listeners, etc.)
window.onerror = (message, source, lineno, colno, error) => {
  console.error('[Global] Uncaught error:', { message, source, lineno, colno, error });
};

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global] Unhandled promise rejection:', event.reason);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
