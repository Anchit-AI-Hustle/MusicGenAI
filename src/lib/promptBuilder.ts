import { CreativeContext } from "@/types/creative-context";
import { buildMasterPrompts } from "./inference/prompt-builder";
import { generateCompositionPlan } from "./inference/composition-engine";

/**
 * Standard interface for the generation pipeline.
 * Delegates to the v2 PromptBuilder for production-grade strings.
 */
export function buildMasterPrompt(context: CreativeContext): string {
  const plan = generateCompositionPlan(
    context.genre,
    context.mood,
    context.duration,
    context.vocalLanguage
  );

  const prompts = buildMasterPrompts(context, plan);

  return `
[MASTER MUSIC GEN BLUEPRINT V2]
INSTRUMENTAL: ${prompts.instrumentalPrompt}
VOCALS: ${prompts.vocalPrompt}
MIXING: ${prompts.mixingInstruction}

DESCRIPTION: ${context.songDescription}
`.trim();
}
