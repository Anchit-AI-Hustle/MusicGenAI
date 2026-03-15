import Replicate from "replicate";

export interface ModelVersion {
  id: string;
  version: string;
  fallbacks: string[];
}

export const MODELS = {
  ACE_STEP: "minimax/music-01",
  STABLE_AUDIO: "stability-ai/stable-audio",
  PUNJABI_FINE_TUNE: "anchittandon/punjabi-ace-step"
};

let cachedVersions: Record<string, { version: string, timestamp: number }> = {};
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

export async function getLatestModelVersion(modelId: string, replicate?: Replicate): Promise<string> {
  // Check cache first
  const cached = cachedVersions[modelId];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.version;
  }

  // If no replicate instance provided and not in cache, fallback to hardcoded stable versions
  if (!replicate) {
    console.warn(`[Model Version API] Replicate instance not provided for ${modelId}, using fallback`);
    return getFallbackVersion(modelId);
  }

  try {
    const [owner, name] = modelId.split("/");
    const model = await replicate.models.get(owner, name);
    const latestVersion = model.latest_version?.id;

    if (!latestVersion) {
      throw new Error(`No latest version found for model ${modelId}`);
    }

    cachedVersions[modelId] = {
      version: latestVersion,
      timestamp: Date.now()
    };

    return latestVersion;
  } catch (error) {
    console.error(`[Model Version API] Error fetching latest version for ${modelId}:`, error);
    // Fallback if API fails
    const fallback = getFallbackVersion(modelId);
    if (fallback) return fallback;
    throw error;
  }
}

function getFallbackVersion(modelId: string): string {
  switch (modelId) {
    case process.env.PUNJABI_ACE_STEP_MODEL_ID:
        return "latest";
    case MODELS.ACE_STEP:
      return "cc38668bd8b0304ddfa0c9fbdd26bed70defd6e246db1cc60cceebba54b4239e"; // March 2024 stable
    case MODELS.STABLE_AUDIO:
      return "812b1cc162cb5f69ec9873d611ee67e3fd04be85160d5ed703bc984d72d24403"; // May 2024 stable
    default:
      return "";
  }
}

export function clearVersionCache() {
  cachedVersions = {};
}
