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

/**
 * Consume one generation from the authenticated user's durable database quota.
 * The database function performs an atomic upsert, so cold starts and concurrent
 * serverless instances cannot reset or split the counter.
 */
export async function checkRateLimit(client: RateLimitClient): Promise<RateLimitResult> {
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
