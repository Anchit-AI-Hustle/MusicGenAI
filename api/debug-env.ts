import { createClient } from '@supabase/supabase-js';

type ApiResponse = {
  status(code: number): ApiResponse;
  json(body: unknown): void;
};

function normalize(value: string | undefined): string {
  if (!value) return '';
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function isPreviewBranchUrl(url: string, projectRef: string): boolean {
  try {
    const hostLabel = new URL(url).hostname.split('.')[0];
    return Boolean(projectRef) && hostLabel !== projectRef;
  } catch {
    return false;
  }
}

export default async function handler(_req: unknown, res: ApiResponse) {
  const url =
    normalize(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    normalize(process.env.VITE_SUPABASE_URL);
  const anonKey =
    normalize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    normalize(process.env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    normalize(process.env.VITE_SUPABASE_ANON_KEY);
  const projectRef =
    normalize(process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID) ||
    normalize(process.env.VITE_SUPABASE_PROJECT_ID);

  const payload: Record<string, unknown> = {
    url,
    anonKeyExists: Boolean(anonKey),
    nodeEnv: process.env.NODE_ENV,
    previewBranchDetected: isPreviewBranchUrl(url, projectRef),
    projectRef,
  };

  if (!url || !anonKey) {
    res.status(500).json({
      ...payload,
      error: 'Supabase env vars missing – check Vercel environment configuration',
    });
    return;
  }

  try {
    const supabase = createClient(url, anonKey);
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      res.status(500).json({
        ...payload,
        dbConnectivityOk: false,
        dbError: error.message,
      });
      return;
    }

    res.status(200).json({
      ...payload,
      dbConnectivityOk: true,
    });
  } catch (error: any) {
    res.status(500).json({
      ...payload,
      dbConnectivityOk: false,
      dbError: error?.message || 'Unknown Supabase connectivity error',
    });
  }
}
