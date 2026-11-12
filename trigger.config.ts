import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_iuxkpbspnwrsfnjooibn",
  dirs: ["./src/trigger"],
  runtime: "node",
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
