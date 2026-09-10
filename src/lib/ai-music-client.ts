/**
 * Neural AI Music Client
 *
 * Browser requests carry only the signed-in user's Supabase access token.
 * Provider credentials are attached by the server and never enter the bundle.
 */

import { supabase } from '@/integrations/supabase/client';

export interface GenerationOptions {
  prompt: string;
  genre: string;
  subgenre?: string[];
  mood?: string;
  tempo?: number;
  durationSeconds?: number;
  lyrics?: string;
  vocalStyle?: string;
  vocalLanguage?: string;
  vocalIntensity?: number;
  vocalEffects?: string[];
  vocalStructure?: string;
  lyricTheme?: string;
  isInstrumental?: boolean;
  videoStyle?: string;
  generationDNA?: any;
}

export interface GenerationStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audioUrl?: string;
  progress: number;
  errorMessage?: string;
}

export class AiMusicClient {
  private static instance: AiMusicClient;
  private readonly apiEndpoint = '/api/ai-music';
  private readonly statusTokens = new Map<string, string>();

  private constructor() {}

  static getInstance(): AiMusicClient {
    if (!AiMusicClient.instance) {
      AiMusicClient.instance = new AiMusicClient();
    }
    return AiMusicClient.instance;
  }

  public validateConfig(): { valid: boolean; error?: string } {
    return { valid: true };
  }

  private async sessionHeaders(): Promise<Record<string, string>> {
    const { data, error } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (error || !accessToken) {
      throw new Error('Sign in before using neural music generation.');
    }
    return { Authorization: `Bearer ${accessToken}` };
  }

  async triggerGeneration(options: GenerationOptions): Promise<string> {
    console.log('[AiMusicClient] Triggering neural generation:', options.prompt);
    const authHeaders = await this.sessionHeaders();

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.id || !data.statusToken) {
      throw new Error('Music provider returned an incomplete generation response');
    }
    this.statusTokens.set(data.id, data.statusToken);
    return data.id;
  }

  async pollStatus(id: string, onProgress?: (p: number) => void): Promise<GenerationStatus> {
    let status: GenerationStatus = { id, status: 'pending', progress: 0 };
    const maxAttempts = 120;
    const statusToken = this.statusTokens.get(id);
    if (!statusToken) throw new Error('Generation status token is unavailable.');

    let attempts = 0;
    while (attempts < maxAttempts) {
      attempts++;

      try {
        const authHeaders = await this.sessionHeaders();
        const query = new URLSearchParams({ id, token: statusToken });
        const response = await fetch(`${this.apiEndpoint}?${query.toString()}`, {
          headers: authHeaders,
        });

        if (!response.ok) {
          console.warn(`[AiMusicClient] Polling attempt ${attempts} failed: ${response.status}`);
        } else {
          status = await response.json();
          if (onProgress) onProgress(status.progress);

          if (status.status === 'completed' || status.status === 'failed') {
            this.statusTokens.delete(id);
            return status;
          }
        }
      } catch (error) {
        console.warn('[AiMusicClient] Network error during poll:', error);
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    this.statusTokens.delete(id);
    throw new Error('Neural generation timed out after 10 minutes (Cold Start or Queue Depth issue).');
  }

  async generateMusic(options: GenerationOptions, onProgress?: (p: number, stage: string) => void): Promise<string> {
    try {
      if (onProgress) onProgress(0.1, 'Sending prompt to neural model');
      const id = await this.triggerGeneration(options);

      if (onProgress) onProgress(0.2, 'Neural inference in progress');
      const result = await this.pollStatus(id, (progress) => {
        if (onProgress) onProgress(0.2 + (progress * 0.6), 'Neural inference in progress');
      });

      if (result.status === 'failed') {
        throw new Error(result.errorMessage || 'Neural generation failed');
      }
      if (!result.audioUrl) {
        throw new Error('No audio URL returned from neural engine');
      }
      return result.audioUrl;
    } catch (error) {
      console.error('[AiMusicClient] Generation failure:', error);
      throw error;
    }
  }
}

export const aiMusicClient = AiMusicClient.getInstance();
