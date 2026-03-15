import { kv } from '@vercel/kv';

const RATE_LIMIT_GENERATIONS = 5;
const RATE_LIMIT_WINDOW_HOURS = 1;

// In-memory fallback if KV is not configured
const memoryStore = new Map<string, { count: number, timestamp: number }>();

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean, remaining: number, resetOffset: number }> {
  const windowMs = RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  const key = `ratelimit:gen:${ip}`;

  // Use Vercel KV if available
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const currentCount = await kv.get<number>(key) || 0;
      
      if (currentCount >= RATE_LIMIT_GENERATIONS) {
         // Get TTL to calculate reset offset
         const ttl = await kv.ttl(key);
         return { allowed: false, remaining: 0, resetOffset: ttl > 0 ? ttl * 1000 : windowMs };
      }
      
      const newCount = await kv.incr(key);
      if (newCount === 1) {
          await kv.expire(key, windowMs / 1000); // Expiration in seconds
      }
      
      return { allowed: true, remaining: Math.max(0, RATE_LIMIT_GENERATIONS - newCount), resetOffset: windowMs };
    } catch (error) {
       console.error("[Rate Limiter] KV Error:", error);
       // Fall back to memory if KV fails
       return memoryFallback(ip, windowMs, now);
    }
  } else {
    // Memory fallback
    console.warn("[Rate Limiter] Vercel KV missing. Using in-memory fallback (will reset on server restart/scale)");
    return memoryFallback(ip, windowMs, now);
  }
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
