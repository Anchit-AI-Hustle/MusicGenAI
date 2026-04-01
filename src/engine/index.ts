export { buildGenerationIntent } from './intentBuilder'
export { buildAlbumPlan } from './albumPlanBuilder'
export {
  suggestMusicPrompt,
  suggestMood,
  suggestTempo,
  suggestSongStructure,
  suggestVocalStyle,
  suggestVideoStyle,
  enhanceField,
  newAlternativeField,
} from './suggestEngine'
export type {
  RawUserInput,
  NormalizedInput,
  GenerationIntent,
  ConflictReport,
  ConflictEntry,
  VocalProfile,
  LyricsProfile,
  VisualProfile,
  AudioParameters,
  GenreProfile,
  MoodVector,
  ArtistStyleVector,
  StructureSegment,
} from './types'
export { RawUserInputSchema } from './schema'
