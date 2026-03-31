const RATE_LIMIT_GENERATIONS = 5;
const RATE_LIMIT_WINDOW_HOURS = 1;

// In-memory limiter only (keeps deployment independent from Vercel KV provisioning)
const memoryStore = new Map<string, { count: number, timestamp: number }>();

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean, remaining: number, resetOffset: number }> {
  const windowMs = RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  return memoryFallback(ip, windowMs, now);
}

function memoryFallback(ip: string, windowMs: number, now: number) {
    const record = memoryStore.get(ip);
    
    if (!record) {
        memoryStore.set(ip, { count: 1, timestamp: now });
        return { allowed: true, remaining: RATE_LIMIT_GENERATIONS - 1, resetOffset: windowMs };
    }
    
    if (now - record.timestamp > windowMs) {
        // Window expired, reset
        memoryStore.set(ip, { count: 1, timestamp: now });
        return { allowed: true, remaining: RATE_LIMIT_GENERATIONS - 1, resetOffset: windowMs };
    }
    
    if (record.count >= RATE_LIMIT_GENERATIONS) {
        return { allowed: false, remaining: 0, resetOffset: windowMs - (now - record.timestamp) };
    }
    
    record.count += 1;
    memoryStore.set(ip, record);
    return { allowed: true, remaining: RATE_LIMIT_GENERATIONS - record.count, resetOffset: windowMs - (now - record.timestamp) };
}
