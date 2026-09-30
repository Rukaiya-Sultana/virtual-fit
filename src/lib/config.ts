/** Central access to server-side configuration with safe defaults. */

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  get storageRoot() {
    return process.env.STORAGE_ROOT?.trim() || "./.storage";
  },
  get maxUploadBytes() {
    return Math.round(num("MAX_UPLOAD_MB", 10) * 1024 * 1024);
  },
  get tempTtlHours() {
    return num("TEMP_TTL_HOURS", 1);
  },
  get uploadTtlHours() {
    return num("UPLOAD_TTL_HOURS", 24);
  },
  get resultTtlHours() {
    return num("RESULT_TTL_HOURS", 24);
  },
  get aiRateLimitPerMinute() {
    return num("AI_RATE_LIMIT_PER_MINUTE", 12);
  },
  get uploadRateLimitPerMinute() {
    return num("UPLOAD_RATE_LIMIT_PER_MINUTE", 20);
  },
  get adminPassword() {
    return process.env.ADMIN_PASSWORD || "";
  },
  get openRouterKey() {
    return process.env.OPENROUTER_API_KEY?.trim() || "";
  },
  get openRouterModel() {
    return process.env.OPENROUTER_MODEL?.trim() || "meta-llama/llama-3.3-70b-instruct:free";
  },
  /** Max pixel dimension for stored images (server-side re-encode). */
  get maxImageDimension() {
    return 2048;
  },
};

export function requireAdminPassword(): string {
  const pw = config.adminPassword;
  if (!pw || pw.length < 8) {
    throw new Error(
      "ADMIN_PASSWORD must be set to a value of at least 8 characters before using the admin API."
    );
  }
  return pw;
}
