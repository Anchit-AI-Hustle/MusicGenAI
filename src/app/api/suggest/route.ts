import { NextResponse } from 'next/server';
import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_KEY || '' });

// Free model for AI suggestions - meta llama
const SUGGEST_MODEL = "meta/llama-3-70b-instruct-0d3bbbe1";

export async function POST(req: Request) {
  try {
    const { description } = await req.json();

    if (!description || description.trim() === '') {
      return NextResponse.json({ suggestions: [] });
    }

    if (!process.env.REPLICATE_API_KEY) {
      return NextResponse.json({ error: "API Key Configuration Error" }, { status: 500 });
    }

    const uniqueSeed = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    // Use Llama 3 for intelligent, creative suggestions
    const prompt = `You are an expert music producer and creative director. 
Analyze this song description and provide UNIQUE creative suggestions.
Be creative, diverse, and avoid generic responses.
Song description: ${description}
Seed: ${uniqueSeed}

Respond with ONLY valid JSON (no other text):
{
  "genre": "specific genre",
  "mood": "emotional tone",
  "tempo": number,
  "vocalLanguage": "language",
  "artistInspiration": "modern artist",
  "vocalStyle": "delivery style",
  "instrumentation": "key instruments",
  "lyricTheme": "narrative theme",
  "videoStyle": "visual concept"
}

Use current music trends. Make each response UNIQUE based on the seed.`;

    const output = await replicate.run(SUGGEST_MODEL, {
      input: {
        prompt,
        temperature: 0.95,
        max_tokens: 500,
      }
    });

    const responseText = Array.isArray(output) ? output.map(o => o.text || o).join('') : String(output);

    // Parse JSON from response
    const suggestions: any[] = [];
    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}');
    
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
      try {
        const data = JSON.parse(jsonString);
        
        if (data.genre) suggestions.push({ field: "genre", value: data.genre, confidence: 0.95 });
        if (data.mood) suggestions.push({ field: "mood", value: data.mood, confidence: 0.95 });
        if (data.tempo && typeof data.tempo === 'number') {
          const bpm = Math.max(60, Math.min(180, data.tempo));
          suggestions.push({ field: "tempo", value: String(bpm), confidence: 0.9 });
        }
        if (data.vocalLanguage) suggestions.push({ field: "vocalLanguage", value: data.vocalLanguage, confidence: 0.9 });
        if (data.artistInspiration) suggestions.push({ field: "artistInspiration", value: data.artistInspiration, confidence: 0.85 });
        if (data.vocalStyle) suggestions.push({ field: "vocalStyle", value: data.vocalStyle, confidence: 0.85 });
        if (data.instrumentation) suggestions.push({ field: "instrumentation", value: data.instrumentation, confidence: 0.85 });
        if (data.lyricTheme) suggestions.push({ field: "lyricTheme", value: data.lyricTheme, confidence: 0.9 });
        if (data.videoStyle) suggestions.push({ field: "videoStyle", value: data.videoStyle, confidence: 0.85 });
      } catch (parseErr) {
        console.error("Parse error:", parseErr, responseText);
      }
    }

    if (suggestions.length === 0) {
      return NextResponse.json({ error: "Could not parse suggestions" }, { status: 500 });
    }

    return NextResponse.json({ suggestions, seed: uniqueSeed });

  } catch (error: any) {
    console.error('Suggestion error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate suggestions' },
      { status: 500 }
    );
  }
}