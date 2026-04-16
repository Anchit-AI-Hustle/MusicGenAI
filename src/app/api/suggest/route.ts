import { NextResponse } from 'next/server';

const HF_API_URL = "https://api-inference.huggingface.co/models/meta-llama/Llama-3.1-8B-Instruct";

export async function POST(req: Request) {
  try {
    const { description } = await req.json();

    if (!description || description.trim() === '') {
      return NextResponse.json({ suggestions: [] });
    }

    const hfToken = process.env.HUGGINGFACE_API_KEY;
    if (!hfToken) {
      return NextResponse.json({ error: "HuggingFace API key not configured" }, { status: 500 });
    }

    const uniqueSeed = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    const prompt = `You are an expert music producer. Analyze this song description and provide creative suggestions.
Song: ${description}
Seed: ${uniqueSeed}

Respond ONLY with valid JSON (no other text):
{
  "genre": "specific genre like UK Drill, Phonk, Hyperpop, Afrobeats",
  "mood": "emotional tone",
  "tempo": number betwene 70-170,
  "vocalLanguage": "English/Spanish/Punjabi/etc",
  "artistInspiration": "1 modern artist",
  "vocalStyle": "delivery style",
  "instrumentation": "3-4 key instruments",
  "lyricTheme": "narrative theme", 
  "videoStyle": "visual concept"
}

Be creative and unique.`;

    const response = await fetch(HF_API_URL, {
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          temperature: 0.95,
          max_new_tokens: 400,
          return_full_text: false,
        }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("HF API error:", err);
      return NextResponse.json({ error: "AI service temporarily unavailable" }, { status: 503 });
    }

    const result = await response.json();
    const responseText = Array.isArray(result) ? result[0]?.generated_text || '' : result.generated_text || '';

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