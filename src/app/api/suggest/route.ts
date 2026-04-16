import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { parseSuggestionResponse } from '@/lib/suggestionParser';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export async function POST(req: Request) {
  try {
    const { description } = await req.json();

    if (!description || description.trim() === '') {
      return NextResponse.json({ suggestions: [] });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "API Key Configuration Error" }, { status: 500 });
    }

    const uniqueSeed = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    const systemPrompt = `You are an expert music producer and creative director.
Your task is to analyze a user's song description and suggest optimal production parameters.
Be creative and varied - avoid always suggesting the same choices.

Analyze the description and respond with JSON containing these fields:
- genre: The best matching genre(s)
- mood: The emotional tone that fits best
- tempo: A specific BPM based on the mood (60-180 range)
- vocalLanguage: The most appropriate vocal language
- artistInspiration: 1-2 modern artists whose style fits this concept
- vocalStyle: Suitable vocal style for this genre
- instrumentation: Key instruments for this sound
- lyricTheme: A compelling theme for lyrics

Be diverse and creative - don't use the same artists or tempos repeatedly.
Use your knowledge of current music trends.`;

    const userMessage = `Analyze this song concept and suggest production parameters: ${description}

Seed for uniqueness: ${uniqueSeed}`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 512,
      temperature: 0.9,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const responseBlock = message.content.find(block => block.type === 'text');
    const responseText = responseBlock?.type === 'text' ? responseBlock.text : '';

    if (!responseText) {
      return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
    }

    const suggestions = parseSuggestionResponse(responseText);

    if (!suggestions || suggestions.length === 0) {
      return NextResponse.json({ error: "Failed to parse suggestions" }, { status: 500 });
    }

    return NextResponse.json({ suggestions, seed: uniqueSeed });

  } catch (error) {
    console.error('Error in contextual suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestions' },
      { status: 500 }
    );
  }
}