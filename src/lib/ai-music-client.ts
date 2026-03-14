/**
 * Neural AI Music Client
 * 
 * Handles interaction with cloud-based neural music generation APIs.
 * Supports asynchronous generation with polling for progress and completion.
 */

export interface GenerationOptions {
  prompt: string;
  genre: string;
  mood?: string;
  tempo?: number;
  durationSeconds?: number;
  lyrics?: string;
  vocalStyle?: string;
  vocalLanguage?: string;
  isInstrumental?: boolean;
  videoStyle?: string;
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
  private apiEndpoint: string = import.meta.env.VITE_AI_MUSIC_API_URL || 'https://api.musevibe.ai/v1/generate';
  private apiKey: string = import.meta.env.VITE_AI_MUSIC_API_KEY || '';

  private constructor() {}

  static getInstance(): AiMusicClient {
    if (!AiMusicClient.instance) {
      AiMusicClient.instance = new AiMusicClient();
    }
    return AiMusicClient.instance;
  }

  /**
   * Validates the client configuration.
   */
  public validateConfig(): { valid: boolean; error?: string } {
    if (!this.apiKey && !this.apiEndpoint.includes('musevibe.ai')) {
       return { valid: false, error: 'VITE_AI_MUSIC_API_KEY is missing.' };
    }
    if (!this.apiEndpoint) {
      return { valid: false, error: 'VITE_AI_MUSIC_API_URL is not configured.' };
    }
    return { valid: true };
  }

  /**
   * Triggers a new music generation request.
   */
  async triggerGeneration(options: GenerationOptions): Promise<string> {
    console.log('[AiMusicClient] Triggering neural generation:', options.prompt);
    
    // In a real implementation, this would be a POST request to the API
    // For now, we simulate the trigger and return a mock generation ID
    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(options)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data.id;
  }

  /**
   * Polls the status of a generation request until it completes or fails.
   */
  async pollStatus(id: string, onProgress?: (p: number) => void): Promise<GenerationStatus> {
    let status: GenerationStatus = { id, status: 'pending', progress: 0 };
    const maxAttempts = 120; // 10 minutes at 5s interval
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        const response = await fetch(`${this.apiEndpoint}/${id}`, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` }
        });

        if (!response.ok) {
          console.warn(`[AiMusicClient] Polling attempt ${attempts} failed: ${response.status}`);
        } else {
          status = await response.json();
          if (onProgress) onProgress(status.progress);

          if (status.status === 'completed' || status.status === 'failed') {
            return status;
          }
        }
      } catch (e) {
        console.warn(`[AiMusicClient] Network error during poll:`, e);
      }

      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error('Neural generation timed out after 10 minutes (Cold Start or Queue Depth issue).');
  }

  /**
   * High-level method to Generate -> Poll -> Return URL
   */
  async generateMusic(options: GenerationOptions, onProgress?: (p: number, stage: string) => void): Promise<string> {
    try {
      if (onProgress) onProgress(0.1, 'Sending prompt to neural model');
      const id = await this.triggerGeneration(options);
      
      if (onProgress) onProgress(0.2, 'Neural inference in progress');
      const result = await this.pollStatus(id, (p) => {
        if (onProgress) onProgress(0.2 + (p * 0.6), 'Neural inference in progress');
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
