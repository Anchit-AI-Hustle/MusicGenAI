type EnvMap = Record<string, string | undefined>;

const metaEnv = (import.meta as ImportMeta & { env?: EnvMap }).env ?? {};
const nodeEnv: EnvMap =
  typeof process !== "undefined" && process.env ? process.env : {};

function normalizeEnvValue(value: string | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\n/g, "")
    .replace(/\r?\n/g, "");
}

export function getEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = normalizeEnvValue(metaEnv[key]) || normalizeEnvValue(nodeEnv[key]);
    if (value) return value;
  }
  return "";
}

export const PUNJABI_ACE_STEP_MODEL_ID = getEnv(
  "PUNJABI_ACE_STEP_MODEL_ID",
  "VITE_PUNJABI_ACE_STEP_MODEL_ID",
  "NEXT_PUBLIC_PUNJABI_ACE_STEP_MODEL_ID",
);

export const ELEVENLABS_API_KEY = getEnv(
  "ELEVENLABS_API_KEY",
  "VITE_ELEVENLABS_API_KEY",
  "NEXT_PUBLIC_ELEVENLABS_API_KEY",
);

export const TELEMETRY_SINK_URL = getEnv(
  "TELEMETRY_SINK_URL",
  "VITE_TELEMETRY_SINK_URL",
  "NEXT_PUBLIC_TELEMETRY_SINK_URL",
);

export const TELEMETRY_DISABLE_CONSOLE = getEnv(
  "TELEMETRY_DISABLE_CONSOLE",
  "VITE_TELEMETRY_DISABLE_CONSOLE",
  "NEXT_PUBLIC_TELEMETRY_DISABLE_CONSOLE",
);
