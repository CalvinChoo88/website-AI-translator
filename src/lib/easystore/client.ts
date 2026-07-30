import { adminApiUrl } from "./config";

/**
 * Thin wrapper around EasyStore's Admin API. Confirmed auth scheme:
 * every authenticated request carries `EasyStore-Access-Token: {token}`.
 * https://developers.easystore.co/docs/api/authentication
 */
export class EasyStoreAdminClient {
  constructor(
    private readonly shopDomain: string,
    private readonly accessToken: string,
  ) {}

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(adminApiUrl(this.shopDomain, path), {
      ...init,
      headers: {
        "EasyStore-Access-Token": this.accessToken,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `EasyStore API ${init?.method ?? "GET"} ${path} failed (${res.status}): ${body}`,
      );
    }

    return (await res.json()) as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  /** Basic store info — used right after install to seed the shop's source locale. */
  getStore(): Promise<{ store: { name: string; domain: string; language?: string } }> {
    return this.get("store.json");
  }
}
