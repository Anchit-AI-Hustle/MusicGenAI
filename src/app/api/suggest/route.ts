import { NextResponse } from 'next/server';
import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_KEY || '' });

export async function POST(req: Request) {
  try {
    const { description } = await req.json();

    if (!description || description.trim() === '') {
      return NextResponse.json({ suggestions: [] });
    }

    if (!process.env.REPLICATE_API_KEY) {
      return NextResponse.json({ error: "API Key Configuration Error" }, { status: 500 });
    }

    const uniqueSeed = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    // Use a free small language model for suggestions - meta/llama-3-8b-instruct is free and fast
    const output = await replicate.run(
      "meta/llama-3-8b-instruct-0707fb3c0afc33ae18353c49e9b",
      {
        input: {
          prompt: `You are an expert music producer. Analyze this song concept and provide creative suggestions.
Respond JSON only - no markdown formatting.
Song concept: ${description}
Seed: ${uniqueSeed}

Provide one suggestion each for these 9 fields (be creative and unique every time):

Genre: [best matching genre - be specific like "UK Punjabi Drill", "Hyperpop", "Phonk", "Afrobeats"]
Mood: [emotional tone]
Tempo: [number 70-170]
VocalLanguage: [language - English/Spanish/Punjabi/etc]
ArtistInspiration: [1 modern artist name that fits]
VocalStyle: [delivery style]
Instrumentation: [3-4 key instruments]
LyricTheme: [2-4 word narrative]
VideoStyle: [visual concept]

Use the seed to vary your responses - ${uniqueSeed}
Be diverse and creative - don't repeat the same answers.`,
          max_tokens: 400,
          temperature: 0.95,
        }
      }
    );

    const responseText = Array.isArray(output) ? output.map(o => o.text || o).join('') : String(output);

    // Parse the response
    const suggestions: any[] = [];
    const lines = responseText.split('\n');

    for (const line of lines) {
      const match = line.match(/^\s*(\w+):\s*\[?(.*?)\]?\s*$/i);
      if (match) {
        const [, field, value] = match;
        const cleanValue = value.replace(/[\[\]]/g, '').trim();
        if (!cleanValue) continue;

        const fieldMap: Record<string, string> = {
          'genre': 'genre',
          'mood': 'mood',
          'tempo': 'tempo',
          'vocallanguage': 'vocalLanguage',
          'artistinspiration': 'artistInspiration',
          'vocalstyle': 'vocalStyle',
          'instrumentation': 'instrumentation',
          'lyrictheme': 'lyricTheme',
          'videostyle': 'videoStyle',
        };

        const mappedField = fieldMap[field.toLowerCase()];
        if (mappedField && cleanValue) {
          if (mappedField === 'tempo') {
            const num = parseInt(cleanValue.replace(/[^0-9]/g, ''));
            if (num >= 60 && num <= 180) {
              suggestions.push({ field: mappedField, value: String(num), confidence: 0.9 });
            }
          } else {
            suggestions.push({ field: mappedField, value: cleanValue, confidence: 0.85 });
          }
        }
      }
    }

    // Fallback if parsing failed
    if (suggestions.length === 0) {
      return NextResponse.json({ 
        error: "Could not parse suggestions. Try again." 
      }, { status: 500 });
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