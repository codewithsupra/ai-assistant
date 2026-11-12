// Manual check of the one step automated tests cannot do: a real person approving the Clerk device code.
// Usage: npx tsx --env-file=.env scripts/verify-device-flow.ts
// It starts a device authorization, prints the link and code, waits for you to approve it in a browser,
// then prints the Clerk user id Clerk returns. It does not touch the database or Telegram.
import {
  clerkOAuthConfigFromEnv,
  fetchClerkUserId,
  pollDeviceToken,
  startDeviceAuthorization,
} from "../src/trigger/clerk-device-flow.js";

const clerk = clerkOAuthConfigFromEnv();
const auth = await startDeviceAuthorization(clerk);

console.log(`\nOpen:  ${auth.verificationUriComplete}`);
console.log(`Code:  ${auth.userCode}   (valid ${Math.round(auth.expiresIn / 60)} minutes)\n`);
console.log("Sign in with Google and approve. Waiting...");

const deadline = Date.now() + auth.expiresIn * 1000;
let interval = Math.max(auth.interval, 5);

while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, interval * 1000));
  const poll = await pollDeviceToken(clerk, auth.deviceCode);
  if (poll.status === "slow_down") interval += 5;
  if (poll.status === "denied") throw new Error("You denied the request");
  if (poll.status === "expired") throw new Error("The code expired");
  if (poll.status === "approved") {
    console.log(`\nApproved. Clerk user id: ${await fetchClerkUserId(clerk, poll.accessToken)}`);
    process.exit(0);
  }
}
throw new Error("Timed out waiting for approval");
