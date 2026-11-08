import { z } from "zod";
const schema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().default("postgresql://egpanel:egpanel@localhost:5432/egpanel"),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    SESSION_SECRET: z.string().min(32).default("development-secret-change-before-production"),
    COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
});
export const env = schema.parse(process.env);
