import { defineConfig } from "@trigger.dev/sdk";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_iuxkpbspnwrsfnjooibn",
  dirs: ["./src/trigger"],
  runtime: "node",
  build: {
    extensions: [
      // Copies the variables the tasks read from the local .env to the deployed
      // environment on every `trigger.dev deploy`. TRIGGER_SECRET_KEY and
      // CLERK_SECRET_KEY are deliberately not here: tasks never need them.
      syncEnvVars(async () =>
        [
          "NEON_AI_GATEWAY_TOKEN",
          "NEON_AI_GATEWAY_BASE_URL",
          "TELEGRAM_BOT_TOKEN",
          "FIRECRAWL_API_KEY",
          "DAYTONA_API_KEY",
          "DATABASE_URL",
          "CLERK_PUBLISHABLE_KEY",
          "CLERK_OAUTH_CLIENT_ID",
        ]
          .filter((name) => process.env[name])
          .map((name) => ({ name, value: process.env[name]! }))
      ),
    ],
  },
  maxDuration: 3600, // seconds
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
});
