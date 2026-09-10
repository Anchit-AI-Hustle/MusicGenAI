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

function getSingle(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader?.('Cache-Control', 'no-store');

  const endpoint = configuredEndpoint();
  const apiKey = process.env.AI_MUSIC_API_KEY?.trim();
  if (!endpoint || !apiKey) {
    res.status(503).json({ error: 'Neural music provider is not configured.' });
    return;
  }

  const method = (req.method || '').toUpperCase();
  let target = endpoint;
  let body: string | undefined;

  if (method === 'POST') {
    const forwardedFor = getSingle(req.headers?.['x-forwarded-for']);
    const ip = forwardedFor.split(',')[0]?.trim() || '127.0.0.1';
    const limit = await checkRateLimit(ip);
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
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) {
      res.status(400).json({ error: 'A valid generation ID is required.' });
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
