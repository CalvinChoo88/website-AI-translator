function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const easystoreConfig = {
  get clientId() {
    return requireEnv("EASYSTORE_CLIENT_ID");
  },
  get clientSecret() {
    return requireEnv("EASYSTORE_CLIENT_SECRET");
  },
  get scopes() {
    return requireEnv("EASYSTORE_SCOPES");
  },
  get appUrl() {
    return requireEnv("APP_URL").replace(/\/$/, "");
  },
  get redirectUri() {
    return `${this.appUrl}/api/auth/callback`;
  },
};

// Verified against https://developers.easystore.co/docs/api/authentication
// (2026-07-30). Re-check before relying on this in production — EasyStore
// can change endpoint shapes without notice like any third-party API.
export const EASYSTORE_AUTHORIZE_HOST = "https://admin.easystore.co";
export const EASYSTORE_API_VERSION = "3.0";

export function adminApiUrl(shopDomain: string, path: string): string {
  const cleanPath = path.replace(/^\//, "");
  return `https://${shopDomain}/api/${EASYSTORE_API_VERSION}/${cleanPath}`;
}
