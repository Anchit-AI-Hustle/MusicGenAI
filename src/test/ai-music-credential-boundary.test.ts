import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    process.env.AI_MUSIC_API_URL = 'https://provider.example/v1/generate';
    process.env.AI_MUSIC_API_KEY = 'server-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_MUSIC_API_URL;
    delete process.env.AI_MUSIC_API_KEY;
  });

  it('never attaches provider credentials in the browser client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'job_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await aiMusicClient.triggerGeneration({ prompt: 'test', genre: 'ambient' });

    expect(fetchMock).toHaveBeenCalledWith('/api/ai-music', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
  });

  it('attaches the credential only while proxying from the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'job_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { state, response } = responseRecorder();

    await handler({
      method: 'POST',
      body: { prompt: 'test', genre: 'ambient' },
      headers: { 'x-forwarded-for': '203.0.113.10' },
    }, response);

    expect(state.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://provider.example/v1/generate',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer server-secret' }),
      }),
    );
  });

  it('rejects unsafe provider URLs before making a request', async () => {
    process.env.AI_MUSIC_API_URL = 'http://127.0.0.1/internal';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { state, response } = responseRecorder();

    await handler({ method: 'POST', body: {} }, response);

    expect(state.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
