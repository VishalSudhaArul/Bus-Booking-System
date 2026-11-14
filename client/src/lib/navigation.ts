/**
 * Open-redirect guard for navigation targets that are not hard-coded (e.g.
 * "return to where you were" after sign-in).
 *
 * React Router treats `//host` and `scheme:` targets as external URLs, and
 * browsers treat `\` like `/` — so `/\evil.com` can become `//evil.com`.
 * Only same-origin, root-relative application paths are allowed through;
 * anything else falls back to a known-safe path.
 */
export function safeInternalPath(target: unknown, fallback: string): string {
  if (typeof target !== 'string') return fallback;
  const value = target.trim();
  if (value.length === 0 || value.length > 2048) return fallback;

  // Must be root-relative: a single leading "/" followed by a non-slash.
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  // Backslashes (raw or percent-encoded) are normalised to "/" by browsers.
  if (/\\|%5c/i.test(value)) return fallback;
  // Encoded leading slashes ("/%2F%2Fevil.com") and control characters.
  if (/^\/(%2f)/i.test(value)) return fallback;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return fallback;
  }

  // Final check: resolving against our own origin must stay on our origin.
  try {
    const base = 'https://busnest.internal';
    const resolved = new URL(value, base);
    if (resolved.origin !== base) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

/** Reads a `from` path out of router state, validated. */
export function redirectFromState(state: unknown, fallback: string): string {
  const from = state && typeof state === 'object' ? (state as { from?: unknown }).from : undefined;
  return safeInternalPath(from, fallback);
}
