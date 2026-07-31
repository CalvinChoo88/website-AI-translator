"use client";

import { useMemo, useState } from "react";
import { LANGUAGES } from "@/lib/languages";

interface Props {
  domain: string;
  initialSourceLocale: string;
  initialEnabledLocales: string[];
  initialAutoDetect: boolean;
  /** null = provider supports the full catalog, no filtering needed. */
  providerSupportedLocales: string[] | null;
}

export function AdminSettingsForm({
  domain,
  initialSourceLocale,
  initialEnabledLocales,
  initialAutoDetect,
  providerSupportedLocales,
}: Props) {
  const [sourceLocale] = useState(initialSourceLocale);
  const supportedSet = useMemo(
    () => (providerSupportedLocales ? new Set(providerSupportedLocales) : null),
    [providerSupportedLocales],
  );
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(initialEnabledLocales.filter((c) => !supportedSet || supportedSet.has(c))),
  );
  const [autoDetect, setAutoDetect] = useState(initialAutoDetect);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied, setCopied] = useState(false);

  const selectableLanguages = useMemo(
    () =>
      LANGUAGES.filter((l) => l.code !== sourceLocale && (!supportedSet || supportedSet.has(l.code))),
    [sourceLocale, supportedSet],
  );

  const visibleLanguages = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return selectableLanguages;
    return selectableLanguages.filter(
      (l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q),
    );
  }, [selectableLanguages, filter]);

  const embedSnippet =
    typeof window !== "undefined"
      ? `<script src="${window.location.origin}/widget/translator.js" data-shop="${domain}" async></script>`
      : "";

  function toggle(code: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledLocales: [...enabled], autoDetect }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  async function copySnippet() {
    await navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 24px", lineHeight: 1.5 }}>
      <h1>Translation settings</h1>
      <p style={{ color: "#555" }}>
        Store: <strong>{domain}</strong> &middot; Source language:{" "}
        <strong>{sourceLocale}</strong>
      </p>

      <section style={{ margin: "24px 0" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={autoDetect}
            onChange={(e) => setAutoDetect(e.target.checked)}
          />
          Suggest a language automatically based on visitor location (shoppers
          can always change it, and their choice is remembered)
        </label>
      </section>

      <section>
        <h2 style={{ fontSize: 18 }}>Languages to offer</h2>
        {supportedSet && (
          <p style={{ color: "#777", fontSize: 13, marginTop: -4 }}>
            Showing the {supportedSet.size} languages your translation provider supports.
          </p>
        )}
        <input
          type="text"
          placeholder="Search languages…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 12, boxSizing: "border-box" }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 4,
            maxHeight: 320,
            overflowY: "auto",
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 12,
          }}
        >
          {visibleLanguages.map((lang) => (
            <label key={lang.code} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={enabled.has(lang.code)}
                onChange={() => toggle(lang.code)}
              />
              {lang.name}
            </label>
          ))}
        </div>
        <p style={{ color: "#777", fontSize: 13 }}>{enabled.size} language(s) selected</p>
      </section>

      <button
        onClick={save}
        disabled={status === "saving"}
        style={{
          padding: "10px 20px",
          background: "#111",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        {status === "saving" ? "Saving…" : "Save settings"}
      </button>
      {status === "saved" && <span style={{ marginLeft: 12, color: "green" }}>Saved</span>}
      {status === "error" && <span style={{ marginLeft: 12, color: "crimson" }}>Save failed</span>}

      <section style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 18 }}>Add to your storefront</h2>
        <p>Paste this snippet into your theme, just before <code>&lt;/body&gt;</code>:</p>
        <pre
          style={{
            background: "#f5f5f5",
            padding: 12,
            borderRadius: 6,
            overflowX: "auto",
            fontSize: 13,
          }}
        >
          {embedSnippet}
        </pre>
        <button onClick={copySnippet} style={{ padding: "6px 14px", cursor: "pointer" }}>
          {copied ? "Copied" : "Copy snippet"}
        </button>
      </section>
    </main>
  );
}
