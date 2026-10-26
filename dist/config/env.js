"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const node_path_1 = __importDefault(require("node:path"));
const zod_1 = require("zod");
const allowedEnvironments = [
    "development",
    "staging",
    "production",
    "test",
];
const nodeEnv = process.env.NODE_ENV || "development";
if (!allowedEnvironments.includes(nodeEnv)) {
    throw new Error(`Invalid NODE_ENV: ${nodeEnv}`);
}
// Load the environment file selected by NODE_ENV.
// Variables supplied by the hosting platform take precedence.
const profilePath = node_path_1.default.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv_1.default.config({
    path: profilePath,
    override: false,
});
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(allowedEnvironments),
    PORT: zod_1.z.coerce.number().int().positive().default(3000),
    MONGO_URI: zod_1.z.string().min(1),
    JWT_SECRET: zod_1.z.string().min(32),
    REFRESH_TOKEN_SECRET: zod_1.z.string().min(32),
    ALLOWED_ORIGINS: zod_1.z.string().min(1),
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
exports.default = env;
//# sourceMappingURL=env.js.map