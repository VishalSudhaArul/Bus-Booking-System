import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, GuestOnly } from '@/features/auth/AuthContext';
import { setAccessToken } from '@/lib/api';
import { redirectFromState, safeInternalPath } from '@/lib/navigation';

const HOME = '/account';

describe('safeInternalPath — open-redirect guard', () => {
  it.each([
    ['/account', '/account'],
    ['/trips/665f1c2e9b1e8a0012a4c001', '/trips/665f1c2e9b1e8a0012a4c001'],
    ['/search?from=Pune&to=Goa&date=2026-12-01', '/search?from=Pune&to=Goa&date=2026-12-01'],
    ['/account/bookings#upcoming', '/account/bookings#upcoming'],
    ['/checkout', '/checkout'],
  ])('keeps internal path %s', (input, expected) => {
    expect(safeInternalPath(input, HOME)).toBe(expected);
  });

  it.each([
    ['protocol-relative', '//evil.com'],
    ['protocol-relative with path', '//evil.com/account'],
    ['backslash after slash', '/\\evil.com'],
    ['double backslash', '\\\\evil.com'],
    ['mixed slashes', '/\\/evil.com'],
    ['backslash then slash', '\\/evil.com'],
    ['tab-split slashes', '/\t/evil.com'],
    ['newline-split slashes', '/\n/evil.com'],
    ['encoded backslash', '/%5Cevil.com'],
    ['encoded backslash lower-case', '/%5cevil.com'],
    ['encoded slashes', '/%2F%2Fevil.com'],
    ['absolute https', 'https://evil.com'],
    ['absolute http', 'http://evil.com/account'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['relative path', 'account'],
    ['leading whitespace + //', '  //evil.com'],
    ['empty', ''],
  ])('rejects %s', (_name, input) => {
    expect(safeInternalPath(input, HOME)).toBe(HOME);
  });

  it('rejects non-string values', () => {
    for (const value of [undefined, null, 42, { pathname: '//evil.com' }, ['/x']]) {
      expect(safeInternalPath(value, HOME)).toBe(HOME);
    }
  });

  it('reads and validates router state', () => {
    expect(redirectFromState({ from: '/checkout' }, HOME)).toBe('/checkout');
    expect(redirectFromState({ from: '/\\evil.com' }, HOME)).toBe(HOME);
    expect(redirectFromState(null, HOME)).toBe(HOME);
    expect(redirectFromState('//evil.com', HOME)).toBe(HOME);
  });
});

describe('why the guard is needed even on React Router 7.18 (GHSA-wrjc-x8rr-h8h6)', () => {
  // React Router renders backslash hrefs verbatim, and browsers read "\" as "/",
  // so "/\evil.com" in an <a href> leaves the site. The router is not a sanitiser:
  // every non-literal target must go through safeInternalPath first.
  const dangerous = ['/\\evil.com', '\\\\evil.com', '\\/evil.com', '/\\/evil.com', '//evil.com'];

  it('documents that <Link> passes such targets through unchanged', () => {
    render(
      <MemoryRouter>
        {dangerous.map((p, i) => (
          <Link key={p} to={p}>{`link-${i}`}</Link>
        ))}
      </MemoryRouter>,
    );
    dangerous.forEach((p, i) => {
      const href = screen.getByText(`link-${i}`).getAttribute('href') ?? '';
      // A browser resolves each of these against our origin to a different host.
      expect(new URL(href.replace(/\\/g, '/'), 'https://busnest.example').host).not.toBe('busnest.example');
      expect(safeInternalPath(p, HOME)).toBe(HOME);
    });
  });

  it('a guarded <Link> always points inside the app', () => {
    render(
      <MemoryRouter>
        {dangerous.map((p, i) => (
          <Link key={p} to={safeInternalPath(p, HOME)}>{`safe-${i}`}</Link>
        ))}
      </MemoryRouter>,
    );
    dangerous.forEach((_p, i) => expect(screen.getByText(`safe-${i}`).getAttribute('href')).toBe(HOME));
  });
});

describe('post-login redirect never leaves the app', () => {
  const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  function Where() {
    const location = useLocation();
    return <p data-testid="where">{location.pathname}</p>;
  }

  async function landAfterLogin(from: string) {
    // A signed-in passenger visiting /login is sent on to `from` by GuestOnly.
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.endsWith('/auth/refresh')
          ? json(200, { success: true, data: { accessToken: 't' } })
          : json(200, { success: true, data: { _id: 'u1', name: 'Test User', email: 't@example.com', role: 'PASSENGER' } }),
      ),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { from } }]}>
          <AuthProvider>
            <Routes>
              <Route element={<GuestOnly />}>
                <Route path="/login" element={<p>login page</p>} />
              </Route>
              <Route path="*" element={<Where />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return (await screen.findByTestId('where')).textContent;
  }

  it('follows a legitimate internal "from"', async () => {
    expect(await landAfterLogin('/checkout')).toBe('/checkout');
  });

  it.each(['//evil.com', '/\\evil.com', '\\\\evil.com', 'https://evil.com'])('ignores a malicious "from" (%s) and goes home', async (from) => {
    expect(await landAfterLogin(from)).toBe(HOME);
  });
});
