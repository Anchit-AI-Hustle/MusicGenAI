import { describe, it, expect } from 'vitest';
import { generateDefaultLyrics, generateLyricCues } from '../vocal-engine';
import { type SectionPlan } from '../music-engine';

describe('Multilingual Lyric Generation', () => {
  const mockStructure: SectionPlan[] = [
    { name: 'intro', duration: 4, energy: 0.2, description: '' },
    { name: 'verse 1', duration: 8, energy: 0.6, description: '' },
    { name: 'chorus', duration: 8, energy: 0.8, description: '' },
    { name: 'outro', duration: 4, energy: 0.3, description: '' },
  ];

  const mockStructurev2: SectionPlan[] = [
    { name: 'verse 1', duration: 16, energy: 0.6, description: '' },
    { name: 'chorus', duration: 16, energy: 0.8, description: '' },
  ];

  it('should detect Punjabi context and generate a blend of Punjabi and English', () => {
    const prompt = "Punjabi drill rap about street life in Delhi";
    const genres = ["rap", "drill"];
    
    const lyrics = generateDefaultLyrics(prompt, genres, "aggressive", mockStructurev2, {
      tempo: 140,
      vocalStyle: 'rap',
      vocalIntensity: 8
    });

    console.log('DEBUG Punjabi Lyrics:', JSON.stringify(lyrics));
    
    expect(lyrics.toLowerCase()).toContain('[punjabi]');
    expect(lyrics.toLowerCase()).toContain('delhi');
  });

  it('should detect Spanish context and generate appropriate markers', () => {
    const prompt = "Latin reggaeton party track with smooth vocals";
    const genres = ["reggaeton", "pop"];
    
    const lyrics = generateDefaultLyrics(prompt, genres, "sexy", mockStructurev2);

    console.log('DEBUG Spanish Lyrics:', JSON.stringify(lyrics));

    expect(lyrics.toLowerCase()).toContain('[spanish]');
    expect(lyrics.toLowerCase()).toContain('latin');
  });

  it('should generate lyric cues with correct language tags', () => {
    const lyrics = `
[Verse]
[English]
[00:00] Hello world
[Spanish]
[00:04] Hola mundo
    `.trim();

    const cues = generateLyricCues(lyrics, mockStructurev2, 32, {
      tempo: 120,
      vocalStyle: 'melodic_singing',
      vocalIntensity: 5
    });

    console.log('DEBUG Cues:', JSON.stringify(cues));

    expect(cues[0].language).toBe('english');
    expect(cues[1].language).toBe('spanish');
  });
});
