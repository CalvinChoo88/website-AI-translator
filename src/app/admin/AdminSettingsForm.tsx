"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { LANGUAGES } from "@/lib/languages";

interface Props {
  domain: string;
  initialSourceLocale: string;
  initialEnabledLocales: string[];
  initialAutoDetect: boolean;
  initialAutoWarmOnFirstUse: boolean;
  /** null = provider supports the full catalog, no filtering needed. */
  providerSupportedLocales: string[] | null;
}

export function AdminSettingsForm({
  domain,
  initialSourceLocale,
  initialEnabledLocales,
  initialAutoDetect,
  initialAutoWarmOnFirstUse,
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
  const [autoWarmOnFirstUse, setAutoWarmOnFirstUse] = useState(initialAutoWarmOnFirstUse);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied, setCopied] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showThanks, setShowThanks] = useState(() => searchParams.get("upgraded") === "true");

  function dismissThanks() {
    setShowThanks(false);
    // Strip ?upgraded=true so a page refresh doesn't re-show the popup.
    router.replace(pathname);
  }

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
        body: JSON.stringify({ enabledLocales: [...enabled], autoDetect, autoWarmOnFirstUse }),
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
      {showThanks && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: 28,
              maxWidth: 360,
              textAlign: "center",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
          >
            <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Thanks for upgrading!</h2>
            <p style={{ color: "#555", margin: "0 0 20px" }}>
              Your plan is now active. It may take a moment to reflect here.
            </p>
            <button
              onClick={dismissThanks}
              style={{
                padding: "8px 20px",
                background: "#111",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Translation settings</h1>
        <Link href="/admin/faq" style={{ fontSize: 14 }}>
          FAQ
        </Link>
      </div>
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

      <section style={{ margin: "24px 0" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={autoWarmOnFirstUse}
            onChange={(e) => setAutoWarmOnFirstUse(e.target.checked)}
          />
          Auto-translate the rest of my storefront the first time a
          shopper picks a new language (otherwise each page is
          translated the first time any shopper actually views it)
        </label>
        <p style={{ color: "#777", fontSize: 13, margin: "4px 0 0 24px" }}>
          Off by default — this proactively spends translation-provider
          quota on pages nobody has visited yet in that language.
        </p>
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
