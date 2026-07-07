import { inject } from "@vercel/analytics";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.css";

inject();

const root = document.querySelector("#app");

if (!root) {
  throw new Error("Missing #app root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
