/** Visible text of rendered markup, for asserting on what a reader sees. */
export const htmlText = (html: string): string =>
  new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
