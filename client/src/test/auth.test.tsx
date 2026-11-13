import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, ProtectedRoute } from '@/features/auth/AuthContext';
import { setAccessToken } from '@/lib/api';

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function mockApi(user: { role: string } | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.endsWith('/auth/refresh')) return user ? json(200, { success: true, data: { accessToken: 'token', user } }) : json(401, { success: false, error: { code: 'REFRESH_MISSING', message: 'no' } });
      if (url.endsWith('/auth/me')) return json(200, { success: true, data: { _id: 'u1', name: 'Test User', email: 't@example.com', ...user } });
      return json(404, { success: false, error: { code: 'NOT_FOUND', message: 'nope' } });
    }),
  );
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>login page</p>} />
            <Route path="/account" element={<p>passenger home</p>} />
            <Route element={<ProtectedRoute roles={['ADMIN']} />}>
              <Route path="/admin" element={<p>admin console</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('ProtectedRoute', () => {
  it('sends guests to the login page', async () => {
    mockApi(null);
    renderAt('/admin');
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('sends a signed-in user with the wrong role to their own home', async () => {
    mockApi({ role: 'PASSENGER' });
    renderAt('/admin');
    expect(await screen.findByText('passenger home')).toBeInTheDocument();
    expect(screen.queryByText('admin console')).not.toBeInTheDocument();
  });

  it('restores the session from the refresh cookie and admits the right role', async () => {
    mockApi({ role: 'ADMIN' });
    renderAt('/admin');
    expect(await screen.findByText('admin console')).toBeInTheDocument();
  });
});
