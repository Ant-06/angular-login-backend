import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

const allowedEnvironments = [
  "development",
  "staging",
  "production",
  "test",
] as const;

const nodeEnv = process.env.NODE_ENV || "development";

if (
  !allowedEnvironments.includes(nodeEnv as (typeof allowedEnvironments)[number])
) {
  throw new Error(`Invalid NODE_ENV: ${nodeEnv}`);
}

// Load the environment file selected by NODE_ENV.
// Variables supplied by the hosting platform take precedence.
const profilePath = path.resolve(process.cwd(), `.env.${nodeEnv}`);

dotenv.config({
  path: profilePath,
  override: false,
});

const envSchema = z.object({
  NODE_ENV: z.enum(allowedEnvironments),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ALLOWED_ORIGINS: z.string().min(1),
});

const result = envSchema.safeParse({
  ...process.env,
  NODE_ENV: nodeEnv,
});

if (!result.success) {
  console.error("Environment validation failed:");
  console.error(result.error.flatten().fieldErrors);

  throw new Error(`Missing or invalid configuration for ${nodeEnv}`);
}

const env = result.data;

export default env;
