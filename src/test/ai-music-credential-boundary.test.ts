import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, rateLimitRpcMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  rateLimitRpcMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'user-session-token' } },
        error: null,
      }),
    },
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock.mockImplementation(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
    rpc: rateLimitRpcMock,
  })),
}));

import handler from '../../api/ai-music';
import { aiMusicClient } from '@/lib/ai-music-client';

function responseRecorder() {
  const state: { status?: number; body?: unknown; headers: Record<string, string> } = {
    headers: {},
  };
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value;
    },
  };
  return { state, response };
}

describe('AI music credential boundary', () => {
  beforeEach(() => {
    createClientMock.mockClear();
    rateLimitRpcMock.mockReset().mockResolvedValue({
      data: [{ allowed: true, remaining: 4, reset_after_ms: 3_600_000 }],
      error: null,
    });
    process.env.AI_MUSIC_API_URL = 'https://provider.example/v1/generate';
    process.env.AI_MUSIC_API_KEY = 'server-secret';
    process.env.VITE_SUPABASE_URL = 'https://project.supabase.co';
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_MUSIC_API_URL;
    delete process.env.AI_MUSIC_API_KEY;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('sends only the user session from the browser', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'job_123', statusToken: 'signed-status-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await aiMusicClient.triggerGeneration({ prompt: 'test', genre: 'ambient' });

    expect(fetchMock).toHaveBeenCalledWith('/api/ai-music', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer user-session-token' }),
    }));
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).not.toContain('server-secret');
  });

  it('authenticates the user and attaches the provider key only on the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'job_456' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { state, response } = responseRecorder();

    await handler({
      method: 'POST',
      body: { prompt: 'test', genre: 'ambient' },
      headers: { authorization: 'Bearer user-session-token' },
    }, response);

    expect(state.status).toBe(200);
    expect(state.body).toEqual(expect.objectContaining({
      id: 'job_456',
      statusToken: expect.any(String),
    }));
    expect(fetchMock).toHaveBeenCalledWith(
      'https://provider.example/v1/generate',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer server-secret' }),
      }),
    );
    expect(rateLimitRpcMock).toHaveBeenCalledWith('consume_ai_music_generation_quota');
  });

  it('fails closed when durable rate-limit storage is unavailable', async () => {
    rateLimitRpcMock.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { state, response } = responseRecorder();

    await handler({
      method: 'POST',
      body: { prompt: 'test' },
      headers: { authorization: 'Bearer user-session-token' },
    }, response);

    expect(state.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates sessions against the same Supabase variables as the browser', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://different.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'different-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'job_789' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { response } = responseRecorder();

    await handler({
      method: 'POST',
      body: { prompt: 'test' },
      headers: { authorization: 'Bearer user-session-token' },
    }, response);

    expect(createClientMock).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'publishable-key',
      expect.any(Object),
    );
  });

  it('rejects unauthenticated generation before spending provider quota', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { state, response } = responseRecorder();

    await handler({ method: 'POST', body: {} }, response);

    expect(state.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects status polling without a user-bound signature', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { state, response } = responseRecorder();

    await handler({
      method: 'GET',
      query: { id: 'job_456', token: 'tampered' },
      headers: { authorization: 'Bearer user-session-token' },
    }, response);

    expect(state.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsafe provider URLs before making a request', async () => {
    process.env.AI_MUSIC_API_URL = 'http://127.0.0.1/internal';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { state, response } = responseRecorder();

    await handler({
      method: 'POST',
      body: {},
      headers: { authorization: 'Bearer user-session-token' },
    }, response);

    expect(state.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
