import { generateDefaultLyrics, generateLyricCues } from './src/lib/vocal-engine';

const lyrics = generateDefaultLyrics("A haunting night run through the neon city", ["Cyberpunk", "Synthwave"], "Dark and Driving", [
    { name: 'Intro', duration: 15, energy: 0.3, description: '' },
    { name: 'Verse', duration: 30, energy: 0.5, description: '' },
    { name: 'Chorus', duration: 30, energy: 0.8, description: '' },
    { name: 'Bridge', duration: 15, energy: 0.4, description: '' },
    { name: 'Chorus', duration: 30, energy: 0.9, description: '' },
    { name: 'Outro', duration: 15, energy: 0.2, description: '' },
], { tempo: 120, vocalStyle: 'melodic_singing', vocalIntensity: 7, language: 'English' });

console.log('=== GENERATED STRUCTURED LYRICS ===\\n');
console.log(lyrics);

const cues = generateLyricCues(lyrics, [
    { name: 'Intro', duration: 15, energy: 0.3, description: '' },
    { name: 'Verse', duration: 30, energy: 0.5, description: '' },
    { name: 'Chorus', duration: 30, energy: 0.8, description: '' },
    { name: 'Bridge', duration: 15, energy: 0.4, description: '' },
    { name: 'Chorus', duration: 30, energy: 0.9, description: '' },
    { name: 'Outro', duration: 15, energy: 0.2, description: '' },
], 135, { tempo: 120, vocalStyle: 'melodic_singing', vocalIntensity: 7 });

console.log('\\n=== PARSED TIMESTAMPS ===\\n');
cues.forEach(c => {
    console.log(`[${c.sectionName}] ${c.startTime.toFixed(2)}s -> ${c.endTime.toFixed(2)}s: ${c.text}`);
});
