/**
 * Music Intelligence Engine
 *
 * The "brain" that consumes /knowledge-base/data and produces a unified
 * CompositionPlan. Every downstream stage (audio prompt, video prompt,
 * lyric prompt, post-render mastering, video sync) reads from the same plan.
 *
 * See ../../knowledge-base/README.md for the operating principle.
 */

export * from "./types";
export * from "./chord-progression-bank";
export * from "./genre-knowledge";
export * from "./emotional-arc-planner";
export * from "./engagement-scorer";
export * from "./prompt-assembler";
export * from "./composition-plan";
export * from "./audio-visual-sync";
