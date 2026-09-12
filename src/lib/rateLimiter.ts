type RateLimitRow = {
  allowed: boolean;
  remaining: number;
  reset_after_ms: number;
};

type RateLimitClient = {
  rpc(functionName: string): PromiseLike<{
    data: RateLimitRow[] | null;
    error: { message?: string } | null;
  }>;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetOffset: number;
};

const RATE_LIMIT_GENERATIONS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const memoryStore = new Map<string, { count: number; timestamp: number }>();

/**
 * Preserve the legacy IP-based limiter used by /api/generate. Its public
 * contract remains string-based while that route is migrated separately.
 */
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const now = Date.now();
  const record = memoryStore.get(identifier);

  if (!record || now - record.timestamp > RATE_LIMIT_WINDOW_MS) {
    memoryStore.set(identifier, { count: 1, timestamp: now });
    return { allowed: true, remaining: RATE_LIMIT_GENERATIONS - 1, resetOffset: RATE_LIMIT_WINDOW_MS };
  }

  const resetOffset = RATE_LIMIT_WINDOW_MS - (now - record.timestamp);
  if (record.count >= RATE_LIMIT_GENERATIONS) {
    return { allowed: false, remaining: 0, resetOffset };
  }

  record.count += 1;
  memoryStore.set(identifier, record);
  return { allowed: true, remaining: RATE_LIMIT_GENERATIONS - record.count, resetOffset };
}

/**
 * Consume one generation from the authenticated user's durable database quota.
 * The database function performs an atomic upsert, so cold starts and concurrent
 * serverless instances cannot reset or split the counter.
 */
export async function checkDurableRateLimit(client: RateLimitClient): Promise<RateLimitResult> {
  const { data, error } = await client.rpc('consume_ai_music_generation_quota');
  const row = data?.[0];

  if (error || !row || typeof row.allowed !== 'boolean') {
    throw new Error(error?.message || 'Rate-limit storage returned an invalid response.');
  }

  return {
    allowed: row.allowed,
    remaining: Number(row.remaining) || 0,
    resetOffset: Math.max(0, Number(row.reset_after_ms) || 0),
  };
}
