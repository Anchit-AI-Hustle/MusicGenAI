import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../src/lib/rateLimiter';

type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
};

type AuthenticatedUser = {
  id: string;
  client: ReturnType<typeof createClient>;
};

function getSingle(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function getHeader(req: ApiRequest, name: string): string {
  const headers = req.headers || {};
  return getSingle(headers[name.toLowerCase()] || headers[name] || headers[name.toUpperCase()]);
}

function configuredEndpoint(): string | null {
  const raw = process.env.AI_MUSIC_API_URL?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

async function authenticatedUser(req: ApiRequest): Promise<AuthenticatedUser | null> {
  const authorization = getHeader(req, 'authorization');
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return null;

  const url = (
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim();
  const anonKey = (
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  if (!url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  const id = error ? null : data.user?.id || null;
  return id ? { id, client: supabase } : null;
}

function statusSignature(apiKey: string, userId: string, jobId: string): string {
  return createHmac('sha256', apiKey)
    .update(`${userId}:${jobId}`)
    .digest('base64url');
}

function signaturesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader?.('Cache-Control', 'no-store');

  const endpoint = configuredEndpoint();
  const apiKey = process.env.AI_MUSIC_API_KEY?.trim();
  if (!endpoint || !apiKey) {
    res.status(503).json({ error: 'Neural music provider is not configured.' });
    return;
  }

  const auth = await authenticatedUser(req);
  if (!auth) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const method = (req.method || '').toUpperCase();
  let target = endpoint;
  let body: string | undefined;

  if (method === 'POST') {
    let limit;
    try {
      limit = await checkRateLimit(auth.client);
    } catch {
      res.status(503).json({ error: 'Generation rate limiter is unavailable.' });
      return;
    }
    if (!limit.allowed) {
      res.status(429).json({
        error: 'Generation rate limit exceeded.',
        retryAfterSeconds: Math.ceil(limit.resetOffset / 1000),
      });
      return;
    }
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  } else if (method === 'GET') {
    const id = getSingle(req.query?.id);
    const token = getSingle(req.query?.token);
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) {
      res.status(400).json({ error: 'A valid generation ID is required.' });
      return;
    }
    const expected = statusSignature(apiKey, auth.id, id);
    if (!token || !signaturesMatch(expected, token)) {
      res.status(403).json({ error: 'Generation status access denied.' });
      return;
    }
    target = `${endpoint}/${encodeURIComponent(id)}`;
  } else {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const upstream = await fetch(target, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: controller.signal,
    });

    const payload = await upstream.json().catch(() => ({
      error: 'Music provider returned an invalid response.',
    }));

    if (method === 'POST' && upstream.ok && payload && typeof payload === 'object') {
      const jobId = (payload as { id?: unknown }).id;
      if (typeof jobId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(jobId)) {
        res.status(upstream.status).json({
          ...payload,
          statusToken: statusSignature(apiKey, auth.id, jobId),
        });
        return;
      }
    }

    res.status(upstream.status).json(payload);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    res.status(timedOut ? 504 : 502).json({
      error: timedOut ? 'Music provider timed out.' : 'Music provider request failed.',
    });
  } finally {
    clearTimeout(timeout);
  }
}
