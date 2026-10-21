import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n.ts";
import "./index.css";
import "./print/print.css";
import { App } from "./App.tsx";

const container = document.getElementById("root");
if (!container) throw new Error("Root container #root was not found.");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
