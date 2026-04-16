import { NextResponse } from 'next/server';
import { inferContextFromDescription } from '@/lib/contextInference';
import { parseSuggestionResponse } from '@/lib/suggestionParser';

export async function POST(req: Request) {
  try {
    const { description } = await req.json();

    if (!description || description.trim() === '') {
      return NextResponse.json({ suggestions: [] });
    }

    // Add unique seed based on timestamp + random component to ensure unique suggestions each time
    const uniqueSeed = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const seededDescription = `${description} [seed:${uniqueSeed}]`;
    
    const rawInference = await inferContextFromDescription(seededDescription);
    
    if (!rawInference) {
       return NextResponse.json({ error: "Failed to infer" }, { status: 500 });
    }

    // Convert raw JSON inference to our safe parsed suggestion format
    const suggestions = parseSuggestionResponse(JSON.stringify(rawInference));

    return NextResponse.json({ suggestions, seed: uniqueSeed });

  } catch (error) {
    console.error('Error in contextual suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestions' },
      { status: 500 }
    );
  }
}
