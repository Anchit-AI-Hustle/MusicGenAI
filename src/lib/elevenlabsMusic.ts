import { CreativeContext } from "@/types/creative-context";
import { buildElevenLabsMusicPrompt, buildElevenLabsTTSPrompt } from "./promptBuilder";
import { formatLyricsForElevenLabs } from "./lyricsFormatter";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

// Mapping broad vocal styles to specific ElevenLabs Voice IDs
const VOICE_MAP: Record<string, string> = {
  "Clean Male": "pNInz6obbf5AWCGqeA", // Example Adam
  "Clean Female": "EXAVITQu4vr4xnSDxMaL", // Example Bella
  "Pop Belt Female": "EXAVITQu4vr4xnSDxMaL",
  // Fallback
  "default": "pNInz6obbf5AWCGqeA"
};

export async function generateElevenLabsMusic(context: CreativeContext): Promise<string> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

    const prompt = buildElevenLabsMusicPrompt(context);
    const lyrics = formatLyricsForElevenLabs(context.lyrics);

    // Call the ElevenLabs Sound Generation API (hypothetical/preview API structure for music)
    // As ElevenLabs music is still in preview for some, we use the standard structure
    // If they have a dedicated /music endpoint, it would go here.
    
    // THIS IS A PLACEHOLDER FOR THE ACTUAL ELEVENLABS MUSIC ENDPOINT
    // If it's standard TTS used for singing:
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
