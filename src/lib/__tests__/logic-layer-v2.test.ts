import { describe, it, expect } from 'vitest';
import { GENRE_DATABASE, getModelQualityWarning } from '../musicData/genres';
import { LANGUAGE_DATABASE, getVocalQualityAdvisory } from '../musicData/languages';
import { generateCompositionPlan } from '../inference/composition-engine';
import { buildMasterPrompts } from '../inference/prompt-builder';
import { shouldRecommendHighQualityVocals } from '@/types/creative-context';

describe('Logic Layer v2: Data Integrity', () => {
  it('should have production-grade genre data', () => {
    const drill = GENRE_DATABASE.find(g => g.name === 'UK Drill');
    expect(drill).toBeDefined();
    expect(drill?.bpmMin).toBe(138);
    expect(drill?.primaryInstruments).toContain('distorted 808');
  });

  it('should trigger quality warnings for specific genres', () => {
    const warning = getModelQualityWarning('Punjabi Pop');
    expect(warning).toContain('ACE-Step Punjabi quality');
  });

  it('should recommend HQ vocals for Punjabi', () => {
    expect(shouldRecommendHighQualityVocals('Punjabi')).toBe(true);
    expect(getVocalQualityAdvisory('Punjabi')).toContain('ElevenLabs');
  });
});

describe('Logic Layer v2: Inference Engines', () => {
  it('should generate accurate composition plans', () => {
    const plan = generateCompositionPlan('Electronic', 'Energetic', 180, 'English');
    expect(plan.bpm).toBeGreaterThanOrEqual(124);
    expect(plan.bpm).toBeLessThanOrEqual(132);
    expect(plan.structure.sections.length).toBeGreaterThan(0);
  });

  it('should build master prompts with all v2 segments', () => {
    const context = {
        genre: 'Trap',
        mood: 'Dark',
        vocalLanguage: 'English',
        tempo: 140,
        duration: 180,
        lyrics: 'Test lyrics',
        useHighQualityVocals: false,
        songDescription: 'A dark trap song',
        vocalStyle: 'Rap'
    };
    const plan = generateCompositionPlan(context.genre, context.mood, context.duration, context.vocalLanguage);
    const prompts = buildMasterPrompts(context, plan);
    
    expect(prompts.instrumentalPrompt).toContain('Trap');
    expect(prompts.mixingInstruction).toContain('High-end');
  });
});
