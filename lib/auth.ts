import "server-only";
import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { getMigrations } from "better-auth/db/migration";
const database = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10000
});
export const auth = betterAuth({
  database,
  emailAndPassword: {
    enabled: true,
    disableSignUp: process.env.BETTER_AUTH_ENABLE_SIGNUP !== "true",
    minPasswordLength: 12
  },
  rateLimit: { enabled: true, window: 60, max: 20 },
  trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [],
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" }
});
let schemaReady: Promise<void> | undefined;
export async function ensureAuthSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const {runMigrations} = await getMigrations(auth.options);
      await runMigrations();
    })().catch(e=>{ schemaReady=undefined; throw e; });
  }
  await schemaReady;
}
