/**
 * Hands a `tel:` (or similar) URL to the OS without navigating the page.
 *
 * Some browsers open a blank tab when a link hands off to an external app.
 * Loading the URL in a throwaway hidden iframe launches the app the same way
 * while the page and tab stay put.
 */
export function openExternalProtocol(url: string) {
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  frame.src = url;
  window.setTimeout(() => frame.remove(), 1000);
}
