import { describe, test, expect } from "vitest";
import { inferContextFromDescription } from "../contextInference";
import { buildMasterPrompt } from "../promptBuilder";
import { CreativeContext } from "../../types/creative-context";

describe("Logic Layer Verification", () => {
  test("Infers Punjabi Drill context correctly", () => {
    const prompt = "Punjabi drill rap about street life in Toronto, dark and intense mood, AP Dhillon style";
    const inference = inferContextFromDescription(prompt);
    
    expect(inference.genre).toBe("Punjabi Drill");
    expect(inference.vocalLanguage).toBe("Punjabi");
    expect(inference.artistInspiration).toBe("AP Dhillon");
    expect(inference.tempo).toBeGreaterThanOrEqual(138);
    expect(inference.tempo).toBeLessThanOrEqual(148);
  });

  test("Infers Latin Reggaeton context correctly", () => {
    const prompt = "energetic Latin reggaeton party track for a summer beach club, Bad Bunny style";
    const inference = inferContextFromDescription(prompt);
    
    expect(inference.genre).toBe("Reggaeton");
    expect(inference.mood).toBe("Energetic");
    expect(inference.artistInspiration).toBe("Bad Bunny");
    // Expected: 95 (typical) + 20 (energetic) = 115. Reggaeton max is 100.
    expect(inference.tempo).toBe(100); 
  });

  test("Master Prompt Builder generates valid prompt structure", () => {
    const mockContext: CreativeContext = {
      genre: "Punjabi Drill",
      subgenre: "UK Punjabi drill",
      tempo: 142,
      duration: 120,
      mood: "Aggressive",
      songStructure: "verse-chorus-verse",
      vocalStyle: "Aggressive male rap",
      vocalIntensity: 85,
      vocalLanguage: "Punjabi",
      vocalLanguages: ["Punjabi", "English"],
      vocalEffects: ["auto-tune", "heavy reverb"],
      lyrics: "...",
      lyricTheme: "Street",
      artistInspiration: "AP Dhillon",
      videoStyle: "Cinematic night city",
      songDescription: "A dark punjabi drill track",
    };

    const masterPrompt = buildMasterPrompt(mockContext);
    
    expect(masterPrompt).toContain("[MASTER MUSIC GEN BLUEPRINT]");
    expect(masterPrompt).toContain("IDENTITY: A aggressive Punjabi Drill track in the style of UK Punjabi drill.");
    expect(masterPrompt).toContain("SPECS: Tempo: 142 BPM.");
    expect(masterPrompt).toContain("INSTRUMENTATION:");
    expect(masterPrompt).toContain("VOCALS:");
    expect(masterPrompt).toContain("INSPIRATION: Inspired by AP Dhillon:");
  });
});
