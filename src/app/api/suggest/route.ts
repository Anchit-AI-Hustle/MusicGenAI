import { NextResponse } from 'next/server';
import { inferContextFromDescription } from '@/lib/contextInference';

export async function POST(req: Request) {
  try {
    const { description } = await req.json();

    if (!description || description.trim() === '') {
      return NextResponse.json({ suggestions: [] });
    }

    const uniqueSeed = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
    // Get full context inference
    const context = inferContextFromDescription(description, uniqueSeed);
    
    // Convert to suggestion format
    const suggestions: any[] = [];

    // Genre
    if (context.genre) {
      suggestions.push({ field: "genre", value: context.genre, confidence: 0.9 });
    }
    
    // Mood
    if (context.mood) {
      suggestions.push({ field: "mood", value: context.mood, confidence: 0.9 });
    }
    
    // Tempo
    if (context.tempo) {
      suggestions.push({ field: "tempo", value: String(context.tempo), confidence: 0.85 });
    }
    
    // Vocal Language
    if (context.vocalLanguage || context.language) {
      suggestions.push({ field: "vocalLanguage", value: context.vocalLanguage || context.language, confidence: 0.9 });
    }
    
    // Artist Inspiration
    if (context.artistInspiration) {
      suggestions.push({ field: "artistInspiration", value: context.artistInspiration, confidence: 0.75 });
    }
    
    // Vocal Style
    if (context.vocalStyle) {
      suggestions.push({ field: "vocalStyle", value: context.vocalStyle, confidence: 0.8 });
    }
    
    // Instrumentation
    if (context.instrumentation) {
      suggestions.push({ field: "instrumentation", value: context.instrumentation, confidence: 0.8 });
    }
    
    // Lyric Theme
    if (context.lyricTheme) {
      suggestions.push({ field: "lyricTheme", value: context.lyricTheme, confidence: 0.85 });
    }
    
    // Video Style
    if (context.videoStyle) {
      suggestions.push({ field: "videoStyle", value: context.videoStyle, confidence: 0.8 });
    }

    return NextResponse.json({ suggestions, seed: uniqueSeed });

  } catch (error) {
    console.error('Error in suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestions' },
      { status: 500 }
    );
  }
}