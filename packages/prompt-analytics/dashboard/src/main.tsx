import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initFx, initGlass } from "./lib/hooks";
import { applySettings, loadSettings } from "./lib/settings";
import { applyTheme, loadTheme } from "./lib/theme";
import "./styles.css";
import "./components/atlas.css";

initFx();
initGlass();
applySettings(loadSettings());
applyTheme(loadTheme());
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
