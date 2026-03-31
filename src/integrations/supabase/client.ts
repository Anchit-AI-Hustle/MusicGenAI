import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function normalizeEnvValue(value: string | undefined): string {
  if (!value) return '';
  return value.trim().replace(/^['"]|['"]$/g, '');
}

const env = import.meta.env as Record<string, string | undefined>;

const projectRef =
  normalizeEnvValue(env.VITE_SUPABASE_PROJECT_ID) ||
  normalizeEnvValue(env.NEXT_PUBLIC_SUPABASE_PROJECT_ID);

const explicitUrl =
  normalizeEnvValue(env.VITE_SUPABASE_URL) ||
  normalizeEnvValue(env.NEXT_PUBLIC_SUPABASE_URL);

const anonKey =
  normalizeEnvValue(env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  normalizeEnvValue(env.VITE_SUPABASE_ANON_KEY) ||
  normalizeEnvValue(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const forceProductionSupabase =
  normalizeEnvValue(env.VITE_FORCE_PRODUCTION_SUPABASE).toLowerCase() === 'true' ||
  normalizeEnvValue(env.NEXT_PUBLIC_FORCE_PRODUCTION_SUPABASE).toLowerCase() === 'true';

const productionUrl = projectRef ? `https://${projectRef}.supabase.co` : '';

const resolvedUrl = forceProductionSupabase && productionUrl ? productionUrl : (explicitUrl || productionUrl);

if (!resolvedUrl || !anonKey) {
  throw new Error('Supabase env vars missing – check Vercel environment configuration');
}

function isLikelyPreviewBranch(url: string, ref?: string): boolean {
  if (!ref) return false;
  try {
    const hostLabel = new URL(url).hostname.split('.')[0];
    return hostLabel !== ref;
  } catch {
    return false;
  }
}

export const SUPABASE_URL = resolvedUrl;
export const SUPABASE_PUBLISHABLE_KEY = anonKey;
export const USING_SUPABASE_PREVIEW_BRANCH = isLikelyPreviewBranch(SUPABASE_URL, projectRef);
export const SUPABASE_PROJECT_REF = projectRef;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  }
});

export async function checkSupabaseConnectivity(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Unknown Supabase connectivity error' };
  }
}

