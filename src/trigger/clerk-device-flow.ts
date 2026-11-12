import { CLERK_USER_ID_PATTERN } from "./session-id.js";

// Clerk OAuth 2.0 Device Authorization Grant (RFC 8628), used to prove a Telegram user owns a Clerk account.
// Uses a public OAuth client (no secret): only the client id is needed.

type FetchLike = typeof fetch;

export type ClerkOAuthConfig = { issuer: string; clientId: string };

export type DeviceAuthorization = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
};

export type TokenPoll =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "approved"; accessToken: string };

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

// The Clerk Frontend API host is encoded in the publishable key: pk_test_<base64(host + "$")>.
export const clerkOAuthConfigFromEnv = (env: Record<string, string | undefined> = process.env): ClerkOAuthConfig => {
  const publishableKey = env.CLERK_PUBLISHABLE_KEY;
  const clientId = env.CLERK_OAUTH_CLIENT_ID;
  if (!publishableKey || !clientId) throw new Error("CLERK_PUBLISHABLE_KEY and CLERK_OAUTH_CLIENT_ID must be set");

  const host = Buffer.from(publishableKey.replace(/^pk_(test|live)_/, ""), "base64").toString("utf8").replace(/\$$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) throw new Error("CLERK_PUBLISHABLE_KEY does not contain a valid Frontend API host");
  return { issuer: `https://${host}`, clientId };
};

const form = (values: Record<string, string>) => new URLSearchParams(values).toString();
const FORM_HEADERS = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };

export const startDeviceAuthorization = async (
  config: ClerkOAuthConfig,
  fetchImpl: FetchLike = fetch
): Promise<DeviceAuthorization> => {
  const res = await fetchImpl(`${config.issuer}/oauth/device_authorization`, {
    method: "POST",
    headers: FORM_HEADERS,
    body: form({ client_id: config.clientId, scope: "openid" }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof body.device_code !== "string" || typeof body.user_code !== "string") {
    throw new Error(`Clerk device authorization failed: ${res.status} ${String(body.error ?? "unknown_error")}`);
  }
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: String(body.verification_uri),
    verificationUriComplete: String(body.verification_uri_complete ?? body.verification_uri),
    expiresIn: Number(body.expires_in ?? 600),
    interval: Number(body.interval ?? 5),
  };
};

// One poll of the token endpoint. Network errors and 5xx are treated as "pending": the caller keeps polling until expiry.
export const pollDeviceToken = async (
  config: ClerkOAuthConfig,
  deviceCode: string,
  fetchImpl: FetchLike = fetch
): Promise<TokenPoll> => {
  let res: Response;
  try {
    res = await fetchImpl(`${config.issuer}/oauth/token`, {
      method: "POST",
      headers: FORM_HEADERS,
      body: form({ client_id: config.clientId, grant_type: DEVICE_GRANT, device_code: deviceCode }),
    });
  } catch {
    return { status: "pending" };
  }
  if (res.status >= 500) return { status: "pending" };

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && typeof body.access_token === "string") return { status: "approved", accessToken: body.access_token };

  switch (body.error) {
    case "authorization_pending":
      return { status: "pending" };
    case "slow_down":
      return { status: "slow_down" };
    case "access_denied":
      return { status: "denied" };
    case "expired_token":
    case "invalid_grant": // an unknown, expired or already-used device code
      return { status: "expired" };
    default:
      throw new Error(`Clerk token request failed: ${res.status} ${String(body.error ?? "unknown_error")}`);
  }
};

// The Clerk user id of whoever approved the request, read from Clerk's userinfo endpoint.
export const fetchClerkUserId = async (
  config: ClerkOAuthConfig,
  accessToken: string,
  fetchImpl: FetchLike = fetch
): Promise<string> => {
  const res = await fetchImpl(`${config.issuer}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Clerk userinfo failed: ${res.status}`);
  const info = (await res.json()) as { sub?: unknown; user_id?: unknown };
  const id = typeof info.sub === "string" ? info.sub : info.user_id;
  if (typeof id !== "string" || !CLERK_USER_ID_PATTERN.test(id)) throw new Error("Clerk userinfo did not return a user id");
  return id;
};
