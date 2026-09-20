// Copy-to-clipboard — label swap only, no toast (silent success is the feedback).
document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const value = btn.dataset.copy || "";
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API unavailable (insecure context, permissions) — fall back silently;
      // the command is already visible in the block for manual copy.
      return;
    }
    btn.dataset.state = "copied";
    btn.setAttribute("aria-label", "Copied");
    setTimeout(() => {
      delete btn.dataset.state;
      btn.setAttribute("aria-label", "Copy to clipboard");
    }, 2500);
  });
});
