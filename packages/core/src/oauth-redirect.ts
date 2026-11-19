/** Browser schemes that can run code or read local data; never valid OAuth return addresses. */
const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "vbscript:", "file:", "blob:", "about:"]);

function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname === "[::1]" || /^127(\.\d{1,3}){3}$/.test(hostname);
}

/** Scheme and host only, so an error never repeats the authorization code in the query. */
export function describeOAuthRedirect(url: URL) {
  return url.host ? `${url.protocol}//${url.host}` : url.protocol;
}

/**
 * Validates the client return address Supabase gives after OAuth consent and returns it.
 * Allows https, http to a loopback address, and private-use app schemes such as
 * `cursor://` (RFC 8252 §7.1–7.3). Rejects credentials in the URL and code-running schemes.
 */
export function checkOAuthRedirect(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw new Error("Mangler returadresse fra OAuth-tjenesten");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Ugyldig returadresse fra OAuth-tjenesten");
  }
  const allowed =
    !url.username &&
    !url.password &&
    !BLOCKED_SCHEMES.has(url.protocol) &&
    (url.protocol === "https:" ||
      (url.protocol === "http:"
        ? isLoopback(url.hostname)
        : /^[a-z][a-z0-9+.-]*:$/.test(url.protocol)));
  if (!allowed)
    throw new Error(`Ugyldig returadresse fra OAuth-tjenesten (${describeOAuthRedirect(url)})`);
  return url.toString();
}
