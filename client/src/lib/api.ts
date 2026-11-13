/**
 * Thin fetch wrapper for the BusNest API.
 *  - unwraps the `{ success, data, meta }` envelope
 *  - attaches the in-memory access token
 *  - on an expired token, refreshes once (via the httpOnly cookie) and retries
 */
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api/v1';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  [key: string]: unknown;
}

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get fieldErrors(): FieldError[] {
    return Array.isArray(this.details) ? (this.details as FieldError[]) : [];
  }
}

// The access token is kept in memory only — never in localStorage — so an XSS
// bug cannot read a long-lived credential. The refresh cookie is httpOnly.
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const setSessionExpiredHandler = (handler: (() => void) | null) => {
  onSessionExpired = handler;
};

type Query = Record<string, string | number | boolean | undefined | null | string[]>;

function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else params.set(key, String(value));
  }
  const qs = params.toString();
  return `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
}

async function parse(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

/** Single-flight refresh: concurrent 401s share one refresh request. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(buildUrl('/auth/refresh'), { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return null;
        const body = await parse(res);
        accessToken = body?.data?.accessToken ?? null;
        return accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  headers?: Record<string, string>;
  /** Skip the refresh-and-retry step (used by the auth endpoints themselves). */
  noRetry?: boolean;
}

export interface ApiResult<T> {
  data: T;
  meta?: PageMeta;
}

async function send<T>(path: string, options: RequestOptions, retried = false): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }

  const body = await parse(res);
  if (res.ok) return { data: body.data as T, meta: body.meta as PageMeta | undefined };

  const code: string = body?.error?.code ?? 'UNKNOWN';
  if (res.status === 401 && !options.noRetry && !retried && accessToken !== null && ['TOKEN_EXPIRED', 'TOKEN_INVALID', 'UNAUTHORIZED'].includes(code)) {
    const fresh = await refreshAccessToken();
    if (fresh) return send<T>(path, options, true);
    onSessionExpired?.();
  }
  throw new ApiError(res.status, code, body?.error?.message ?? 'Something went wrong. Please try again.', body?.error?.details);
}

export const api = {
  get: <T>(path: string, query?: Query) => send<T>(path, { query }).then((r) => r.data),
  /** GET that also returns pagination metadata. */
  page: <T>(path: string, query?: Query) => send<T[]>(path, { query }).then((r) => ({ items: r.data, meta: r.meta as PageMeta })),
  post: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) => send<T>(path, { ...options, method: 'POST', body: body ?? {} }).then((r) => r.data),
  patch: <T>(path: string, body: unknown) => send<T>(path, { method: 'PATCH', body }).then((r) => r.data),
};

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Please try again.');
