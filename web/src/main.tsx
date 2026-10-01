import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";
import { LockGate } from "./components/LockGate.js";
import "./styles/global.css";
import { applyTheme } from "./theme.js";
import { keepPresence } from "./appWindow.js";

// Before the first paint, so the lock screen is already in the chosen colours.
applyTheme();
keepPresence();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LockGate>
        <App />
      </LockGate>
    </BrowserRouter>
  </React.StrictMode>
);
