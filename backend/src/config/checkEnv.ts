const REQUIRED_ENV_VARS = ["DATABASE_URL", "REDIS_URL", "GEMINI_API_KEY"] as const;

export function checkEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    console.error("Check your .env file locally, or your platform's environment variable settings in production.");
    process.exit(1);
  }
}