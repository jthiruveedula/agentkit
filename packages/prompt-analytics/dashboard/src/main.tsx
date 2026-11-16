import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initFx } from "./lib/hooks";
import "./styles.css";
import "./components/atlas.css";

initFx();
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
