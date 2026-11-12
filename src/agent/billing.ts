import { clerkOAuthConfigFromEnv } from "./clerk-device-flow.js";
import { CLERK_USER_ID_PATTERN } from "./session-id.js";

// Clerk Billing: the Telegram bot is for subscribers of the "pro" plan only.
// The check asks Clerk's Backend API for the user's subscription (there is no session to call has() on here).

type FetchLike = typeof fetch;

export const REQUIRED_PLAN_SLUG = "pro";

type SubscriptionItem = { status?: unknown; plan?: { slug?: unknown } | null };

// True when the user has an active (or trialing) subscription item on the required plan.
// A user with no subscription at all (404) simply has no plan. Any other failure throws, so the caller fails closed.
export const hasPlan = async (
  clerkUserId: string,
  slug: string = REQUIRED_PLAN_SLUG,
  deps: { fetch?: FetchLike; secretKey?: string } = {}
): Promise<boolean> => {
  if (!CLERK_USER_ID_PATTERN.test(clerkUserId)) throw new Error("Invalid Clerk user id");
  const secretKey = deps.secretKey ?? process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY must be set to check plans");

  const res = await (deps.fetch ?? fetch)(`https://api.clerk.com/v1/users/${clerkUserId}/billing/subscription`, {
    headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" },
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Clerk billing lookup failed: ${res.status}`);

  const body = (await res.json()) as { subscription_items?: SubscriptionItem[] };
  return (body.subscription_items ?? []).some((item) => item.status === "active" && item.plan?.slug === slug);
};

// The hosted Account Portal's billing page, where a user can upgrade.
// The portal address comes from the instance's own display config, so it is right for dev and production alike.
let cachedBillingUrl: string | undefined;

export const accountPortalBillingUrl = async (deps: { fetch?: FetchLike } = {}): Promise<string> => {
  if (cachedBillingUrl) return cachedBillingUrl;
  const { issuer } = clerkOAuthConfigFromEnv({ ...process.env, CLERK_OAUTH_CLIENT_ID: "unused" });

  const res = await (deps.fetch ?? fetch)(`${issuer}/v1/environment`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Clerk environment lookup failed: ${res.status}`);
  const env = (await res.json()) as { display_config?: { user_profile_url?: unknown } };
  const profileUrl = env.display_config?.user_profile_url;
  if (typeof profileUrl !== "string" || !profileUrl.startsWith("https://")) {
    throw new Error("Clerk environment has no user_profile_url");
  }
  // Billing is a tab of the hosted user profile.
  cachedBillingUrl = `${profileUrl.replace(/\/$/, "")}/billing`;
  return cachedBillingUrl;
};

export const upgradeMessage = (freeLimit: number) =>
  [
    freeLimit > 0
      ? `You've used your ${freeLimit} free chats for this month. Your free chats come back next month, or you can keep going now with the Pro plan ($20/month).`
      : "This assistant is part of the Pro plan ($20/month).",
    "",
    "Tap the button to upgrade from your account's billing page, then message me again.",
  ].join("\n");
