import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getLyricsInstruction } from '@/lib/musicData/languages';
import { findGenreByName } from '@/lib/musicData/genres';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const SUGGESTION_FIELDS = [
  'genre', 'mood', 'tempo', 'vocalLanguage', 'artistInspiration', 
  'vocalStyle', 'instrumentation', 'lyricTheme', 'videoStyle'
];

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
    const suggestions: any[] = [];

    // 1. GENRE - Analyze musical style and instruments
    try {
      const genreSystem = `You are a music genre expert. Based on the song description, suggest the most appropriate genre.
Respond with ONLY a single genre name from this list: Pop, Hip Hop, Rock, Electronic, Jazz, Classical, Lo-fi, R&B, Country, Metal, Punjabi, Hindi, Spanish, K-Pop, J-Pop.
If unsure, pick the closest match. Return ONLY the genre name, nothing else.`;

      const genreUser = `Song description: ${description}`;
      
      const genreMsg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 50,
        temperature: 0.8,
        system: genreSystem,
        messages: [{ role: 'user', content: genreUser }],
      });
      
      const genreText = genreMsg.content[0]?.type === 'text' ? genreMsg.content[0].text.trim() : '';
      if (genreText) {
        const genreDef = findGenreByName(genreText);
        if (genreDef) suggestions.push({ field: "genre", value: genreDef.name, confidence: 0.9 });
      }
    } catch (e) { console.error('Genre suggestion failed:', e); }

    // 2. MOOD - Analyze emotional tone
    try {
      const moodSystem = `You are an emotion analysis expert. Analyze the song description and suggest the emotional mood.
Respond with ONE word from: Energetic, Aggressive, Calm, Melancholic, Romantic, Uplifting, Nostalgic, Dark, Happy, Epic, Chill, Tense.
Return ONLY the mood, nothing else.`;

      const moodUser = `Song description: ${description}`;
      
      const moodMsg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 30,
        temperature: 0.8,
        system: moodSystem,
        messages: [{ role: 'user', content: moodUser }],
      });
      
      const moodText = moodMsg.content[0]?.type === 'text' ? moodMsg.content[0].text.trim() : '';
      if (moodText) suggestions.push({ field: "mood", value: moodText, confidence: 0.9 });
    } catch (e) { console.error('Mood suggestion failed:', e); }

    // 3. TEMPO - Analyze energy for BPM
    try {
      const tempoSystem = `You are a tempo analysis expert. Analyze the song description and recommend a BPM.
Respond with a specific BPM number between 60-180.
Consider: fast/dance/intense = 120-160, medium/standard = 100-120, slow/ballad = 60-100.
Return ONLY the number, nothing else.`;

      const tempoUser = `Song description: ${description}`;
      
      const tempoMsg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10,
        temperature: 0.7,
        system: tempoSystem,
        messages: [{ role: 'user', content: tempoUser }],
      });
      
      const tempoText = tempoMsg.content[0]?.type === 'text' ? tempoMsg.content[0].text.trim() : '';
      const tempoNum = parseInt(tempoText.replace(/[^0-9]/g, ''));
      if (tempoNum >= 60 && tempoNum <= 180) {
        suggestions.push({ field: "tempo", value: String(tempoNum), confidence: 0.85 });
      }
    } catch (e) { console.error('Tempo suggestion failed:', e); }

    // 4. VOCAL LANGUAGE - Analyze cultural context
    try {
      const langSystem = `You are a linguistics expert. Based on the song description, recommend the vocal language.
Respond with ONE from: English, Spanish, Punjabi, Hindi, Korean, Japanese, Mandarin, French, Portuguese, Arabic, German, Italian, Russian.
Return ONLY the language, nothing else.`;

      const langUser = `Song description: ${description}`;
      
      const langMsg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 30,
        temperature: 0.7,
        system: langSystem,
        messages: [{ role: 'user', content: langUser }],
      });
      
      const langText = langMsg.content[0]?.type === 'text' ? langMsg.content[0].text.trim() : '';
      if (langText) suggestions.push({ field: "vocalLanguage", value: langText, confidence: 0.9 });
    } catch (e) { console.error('Language suggestion failed:', e); }

    // 5. ARTIST INSPIRATION - Analyze style
    try {
      const artistSystem = `You are a music expert. Based on the song description, suggest 1-2 modern artists whose style matches.
Respond with artist names only, comma separated if multiple.
Return ONLY artist names, nothing else.`;

      const artistUser = `Song description: ${description}`;
      
      const artistMsg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 50,
        temperature: 0.85,
        system: artistSystem,
        messages: [{ role: 'user', content: artistUser }],
      });
      
      const artistText = artistMsg.content[0]?.type === 'text' ? artistMsg.content[0].text.trim() : '';
      if (artistText) suggestions.push({ field: "artistInspiration", value: artistText, confidence: 0.75 });
    } catch (e) { console.error('Artist suggestion failed:', e); }

    // 6. VOCAL STYLE - Analyze delivery
    try {
      const vocalSystem = `You are a vocal production expert. Based on the song description, recommend a vocal style.
Respond with ONE from: Contemporary, Smooth, Husky, Breathless, Rapped,Operatic, Folk, Screamed, whispers, Gritty, Auto-tuned.
Return ONLY the style, nothing else.`;

      const vocalUser = `Song description: ${description}`;
      
      const vocalMsg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 30,
        temperature: 0.7,
        system: vocalSystem,
        messages: [{ role: 'user', content: vocalUser }],
      });
      
      const vocalText = vocalMsg.content[0]?.type === 'text' ? vocalMsg.content[0].text.trim() : '';
      if (vocalText) suggestions.push({ field: "vocalStyle", value: vocalText, confidence: 0.8 });
    } catch (e) { console.error('Vocal style suggestion failed:', e); }

    // 7. INSTRUMENTATION - Analyze instrumentation needs
    try {
      const instSystem = `You are a music arrangement expert. Based on the song description, list 3-5 essential instruments.
Respond with comma-separated instrument names.
Return ONLY instruments, nothing else.`;

      const instUser = `Song description: ${description}`;
      
      const instMsg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 80,
        temperature: 0.8,
        system: instSystem,
        messages: [{ role: 'user', content: instUser }],
      });
      
      const instText = instMsg.content[0]?.type === 'text' ? instMsg.content[0].text.trim() : '';
      if (instText) suggestions.push({ field: "instrumentation", value: instText, confidence: 0.8 });
    } catch (e) { console.error('Instrumentation suggestion failed:', e); }

    // 8. LYRIC THEME - Analyze narrative
    try {
      const themeSystem = `You are a lyricist expert. Based on the song description, suggest an emotional theme for the lyrics.
Respond with a 2-4 word phrase capturing the narrative theme.
Return ONLY the theme, nothing else.`;

      const themeUser = `Song description: ${description}`;
      
      const themeMsg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 50,
        temperature: 0.85,
        system: themeSystem,
        messages: [{ role: 'user', content: themeUser }],
      });
      
      const themeText = themeMsg.content[0]?.type === 'text' ? themeMsg.content[0].text.trim() : '';
      if (themeText) suggestions.push({ field: "lyricTheme", value: themeText, confidence: 0.85 });
    } catch (e) { console.error('Lyric theme suggestion failed:', e); }

    // 9. VIDEO STYLE - Analyze visual concept
    try {
      const videoSystem = `You are a music video visual director. Based on the song description, suggest a visual style.
Respond with ONE from: Neon City Night, Nature Documentary, Abstract Geometric, Vintage Film, Futuristic Sci-Fi, Urban Street, Romantic Sunset, Concert Performance, Animated, Minimalist.
Return ONLY the style, nothing else.`;

      const videoUser = `Song description: ${description}`;
      
      const videoMsg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 30,
        temperature: 0.8,
        system: videoSystem,
        messages: [{ role: 'user', content: videoUser }],
      });
      
      const videoText = videoMsg.content[0]?.type === 'text' ? videoMsg.content[0].text.trim() : '';
      if (videoText) suggestions.push({ field: "videoStyle", value: videoText, confidence: 0.8 });
    } catch (e) { console.error('Video style suggestion failed:', e); }

    return NextResponse.json({ suggestions, seed: uniqueSeed });

  } catch (error) {
    console.error('Error in contextual suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestions' },
      { status: 500 }
    );
  }
}