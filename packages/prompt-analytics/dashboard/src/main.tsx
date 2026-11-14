import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initFx, initGlass } from "./lib/hooks";
import { applySettings, loadSettings } from "./lib/settings";
import "./styles.css";

initFx();
initGlass();
applySettings(loadSettings());
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
