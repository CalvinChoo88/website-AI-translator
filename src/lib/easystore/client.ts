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

  /**
   * Subscribes this shop to a webhook topic. Confirmed against
   * EasyStore's Postman docs: POST /api/3.0/webhooks.json with
   * {"webhook": {"topic": "...", "url": "..."}}. Note the uninstall
   * topic is "app/uninstall" — no trailing "-ed".
   */
  createWebhook(topic: string, url: string): Promise<{ webhook: { id: number } }> {
    return this.request("webhooks.json", {
      method: "POST",
      body: JSON.stringify({ webhook: { topic, url } }),
    });
  }
}
