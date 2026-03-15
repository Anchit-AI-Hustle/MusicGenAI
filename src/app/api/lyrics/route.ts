import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getLyricsInstruction } from '@/lib/musicData/languages';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      theme = 'A futuristic city at night',
      genre = 'Synthwave',
      mood = 'Nostalgic',
      vocals = 'Clean Male',
      language = 'English',
      isInstrumental = false
    } = body;

    // Security
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "API Key Configuration Error" }, { status: 500 });
    }
    
    if (isInstrumental) {
        return NextResponse.json({ lyrics: "" });
    }

    const langInstruction = getLyricsInstruction(language, theme);

    const systemPrompt = `You are an expert lyricist for ${genre} music.
Your task is to write lyrics based on the user's prompt.
The song has a ${mood} mood and features ${vocals} vocals.

LANGUAGE INSTRUCTIONS:
${langInstruction}

FORMATTING INSTRUCTIONS:
Return ONLY the raw lyrics. No intro text, no conversational filler like 'Here are the lyrics'.
Use structural tags exclusively: [Verse], [Chorus], [Pre-Chorus], [Bridge], [Outro].
Do NOT use ANY timestamp tags (like [00:15]) or XML-style timing tags (like <0.5>).
Format cleanly with an empty line between sections.
`;

    const userMessage = `Write a song about: ${theme}`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1024,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const lyricsLine = message.content.find(block => block.type === 'text');
    const lyricsString = lyricsLine?.type === 'text' ? lyricsLine.text : "";

    return NextResponse.json({ lyrics: lyricsString });
  } catch (error) {
    console.error('Error generating lyrics:', error);
    return NextResponse.json(
      { error: 'Failed to generate lyrics. Please try again.' },
      { status: 500 }
    );
  }
}
