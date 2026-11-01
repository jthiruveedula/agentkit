import { useEffect, useState } from "react";
import { onToast } from "../lib/toast";

/** Polite live region plus a visible confirmation that clears itself. */
export function Toaster() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let t = 0;
    const off = onToast((m) => { setMsg(""); requestAnimationFrame(() => setMsg(m)); window.clearTimeout(t); t = window.setTimeout(() => setMsg(""), 3200); });
    return () => { off(); window.clearTimeout(t); };
  }, []);
  return <div className="toast" role="status" aria-live="polite" data-on={msg ? "" : undefined}>{msg}</div>;
}
