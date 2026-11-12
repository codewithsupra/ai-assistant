import { findClerkUserId, linkTelegramUser } from "../db/identities.js";
import {
  claimDueLinks,
  createPendingLink,
  deletePendingLink,
  hasActivePendingLink,
  slowDownLink,
  type PendingLink,
} from "../db/pending-links.js";
import {
  clerkOAuthConfigFromEnv,
  fetchClerkUserId,
  pollDeviceToken,
  startDeviceAuthorization,
  type ClerkOAuthConfig,
  type DeviceAuthorization,
} from "./clerk-device-flow.js";
import { realTelegram, type TelegramIO } from "./telegram-io.js";

export type LinkDeps = {
  telegram: TelegramIO;
  clerk: () => ClerkOAuthConfig;
  fetch?: typeof fetch;
};

export const realLinkDeps: LinkDeps = { telegram: realTelegram, clerk: () => clerkOAuthConfigFromEnv() };

const connectMessage = (auth: DeviceAuthorization) =>
  [
    "Hi! Before we chat, connect your account.",
    "",
    `1. Open ${auth.verificationUriComplete}`,
    "2. Sign in with Google",
    `3. Check that the code shows ${auth.userCode}, then approve`,
    "",
    `Code: ${auth.userCode} (valid for ${Math.round(auth.expiresIn / 60)} minutes)`,
    "",
    "Only approve this if you just asked for it, and never share this link or code with anyone.",
    "When it says you're connected, send me your message again.",
  ].join("\n");

export type StartResult = "started" | "already_pending" | "already_linked";

// A stranger wrote to the bot: send them a Clerk link and code, and remember the open flow in the database.
export const startAccountLink = async (
  { telegramUserId, chatId }: { telegramUserId: string; chatId: number },
  deps: LinkDeps = realLinkDeps
): Promise<StartResult> => {
  if (await findClerkUserId(telegramUserId)) return "already_linked";
  // Repeated messages while a code is still valid start nothing new.
  if (await hasActivePendingLink(telegramUserId)) return "already_pending";

  const auth = await startDeviceAuthorization(deps.clerk(), deps.fetch);
  const linkId = await createPendingLink({
    telegramUserId,
    chatId,
    deviceCode: auth.deviceCode,
    userCode: auth.userCode,
    intervalSeconds: Math.max(auth.interval, 5),
    expiresInSeconds: auth.expiresIn,
  });
  if (!linkId) return "already_pending"; // lost a race with a simultaneous message: the other one sends the code

  try {
    await deps.telegram.sendWithButton(chatId, connectMessage(auth), { text: "Connect your account", url: auth.verificationUriComplete });
  } catch (err) {
    // The person never saw the code: drop the flow so their next message starts a fresh one.
    await deletePendingLink(linkId).catch(() => {});
    throw err;
  }
  return "started";
};

// One flow that is due for a check: ask Clerk whether the person has approved yet.
const settle = async (link: PendingLink, deps: LinkDeps) => {
  const say = (text: string) => deps.telegram.sendText(link.chatId, text).catch(() => {});

  if (link.expiresAt.getTime() <= Date.now()) {
    await deletePendingLink(link.id);
    await say("That link expired before it was approved. Send me a message to get a new one.");
    return;
  }

  const clerk = deps.clerk();
  const poll = await pollDeviceToken(clerk, link.deviceCode, deps.fetch);

  if (poll.status === "pending") return;
  if (poll.status === "slow_down") return slowDownLink(link.id, link.intervalSeconds + 5);
  if (poll.status === "denied") {
    await deletePendingLink(link.id);
    return say("No problem, the connection was cancelled. Message me again whenever you want to try again.");
  }
  if (poll.status === "expired") {
    await deletePendingLink(link.id);
    return say("That link expired before it was approved. Send me a message to get a new one.");
  }

  // Approved. The code can only be used once, so finish now or start over.
  await deletePendingLink(link.id);
  let result;
  try {
    result = await linkTelegramUser(link.telegramUserId, await fetchClerkUserId(clerk, poll.accessToken, deps.fetch));
  } catch (err) {
    console.error("Account link failed:", err instanceof Error ? err.message : "unknown");
    return say("Something went wrong while connecting your account. Send me a message to try again.");
  }
  if (result === "conflict") return say("This Telegram account is already connected to a different account, so I could not connect it again.");
  return say("You're connected! Send me a message to get started.");
};

// Checks every open flow that is due. Safe to run from several processes at once.
export const pollPendingLinks = async (deps: LinkDeps = realLinkDeps) => {
  for (const link of await claimDueLinks(5)) {
    await settle(link, deps).catch((err) => console.error("Link check failed:", err instanceof Error ? err.message : "unknown"));
  }
};

// Starts the background check. Returns a function that stops it.
export const startLinkPoller = (deps: LinkDeps = realLinkDeps, everyMs = 3_000) => {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await pollPendingLinks(deps);
    } catch (err) {
      console.error("Link poller error:", err instanceof Error ? err.message : "unknown");
    } finally {
      busy = false;
    }
  }, everyMs);
  return () => clearInterval(timer);
};
