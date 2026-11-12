// Verifies the Daytona setup: create a sandbox, run Hello World in it, capture the output, delete it.
// Usage: npm run daytona:hello
import { Daytona } from "@daytona/sdk";

if (!process.env.DAYTONA_API_KEY) {
  console.error(
    "DAYTONA_API_KEY is not set. Create a key at https://app.daytona.io/dashboard/keys and add it to .env as DAYTONA_API_KEY=..."
  );
  process.exit(1);
}

const daytona = new Daytona(); // reads DAYTONA_API_KEY from the environment

let sandbox: Awaited<ReturnType<Daytona["create"]>> | undefined;
try {
  sandbox = await daytona.create({ language: "typescript" });
  console.log(`Created sandbox ${sandbox.id}`);

  const response = await sandbox.process.codeRun('console.log("Hello World!")');
  if (response.exitCode !== 0) {
    throw new Error(`Program exited with code ${response.exitCode}: ${response.result}`);
  }
  console.log(`Sandbox output: ${response.result.trim()}`);
} finally {
  if (sandbox) {
    await daytona.delete(sandbox);
    console.log("Deleted sandbox");
  }
}
