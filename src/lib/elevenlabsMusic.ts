import { CreativeContext } from "@/types/creative-context";
import { buildElevenLabsMusicPrompt, buildElevenLabsTTSPrompt } from "./promptBuilder";
import { formatLyricsForElevenLabs } from "./lyricsFormatter";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

// Mapping vocal styles from PRESET_VOCAL_STYLES to ElevenLabs Voice IDs
const VOICE_MAP: Record<string, string> = {
  "Male Vocal": "pNInz6obbf5AWCGqeA",
  "Female Vocal": "EXAVITQu4vr4xnSDxMaL",
  "Robotic Vocal": "pNInz6obbf5AWCGqeA",
  "Rap Vocal": "pNInz6obbf5AWCGqeA",
  "Choir Vocal": "EXAVITQu4vr4xnSDxMaL",
  "Whisper Vocal": "EXAVITQu4vr4xnSDxMaL",
  "Soulful Diva": "EXAVITQu4vr4xnSDxMaL",
  "Gravely Rock": "pNInz6obbf5AWCGqeA",
  "Opera Tenor": "pNInz6obbf5AWCGqeA",
  "Sultry Jazz": "EXAVITQu4vr4xnSDxMaL",
  "Ethereal Soprano": "EXAVITQu4vr4xnSDxMaL",
  "Aggressive Growl": "pNInz6obbf5AWCGqeA",
  // Legacy keys
  "Clean Male": "pNInz6obbf5AWCGqeA",
  "Clean Female": "EXAVITQu4vr4xnSDxMaL",
  "Pop Belt Female": "EXAVITQu4vr4xnSDxMaL",
  "default": "pNInz6obbf5AWCGqeA",
};

export async function generateElevenLabsMusic(context: CreativeContext): Promise<string> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

    // ElevenLabs does not have a dedicated music generation endpoint.
    // Use the TTS endpoint with the multilingual v2 model, which produces
    // expressive speech/singing suitable for vocal tracks.
    return generateElevenLabsTTS(context);
}

export async function generateElevenLabsTTS(context: CreativeContext): Promise<string> {
   const apiKey = process.env.ELEVENLABS_API_KEY;
   if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

   const voiceId = VOICE_MAP[context.vocalStyle] || VOICE_MAP["default"];
   const text = context.lyrics;

   if (!text) throw new Error("Lyrics are required for TTS");

   const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`, {
     method: "POST",
     headers: {
       "Accept": "audio/mpeg",
       "Content-Type": "application/json",
       "xi-api-key": apiKey
     },
     body: JSON.stringify({
       text: text,
       model_id: "eleven_multilingual_v2", // V2 supports more languages
       voice_settings: {
         stability: 0.5,
         similarity_boost: 0.75,
         style: 0.5, // Expressive style
         use_speaker_boost: true
       }
     })
   });

   if (!response.ok) {
     const error = await response.text();
     throw new Error(`ElevenLabs API error: ${response.status} ${error}`);
   }

   // Return the audio buffer as a base64 string to be uploaded or sent to client
   const arrayBuffer = await response.arrayBuffer();
   const buffer = Buffer.from(arrayBuffer);
   return `data:audio/mpeg;base64,${buffer.toString('base64')}`;
}
