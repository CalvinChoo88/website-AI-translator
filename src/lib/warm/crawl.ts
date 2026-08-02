import { parse, HTMLElement, Node, NodeType } from "node-html-parser";

// Mirrors public/widget/translator.js's skip rules (SKIP_TAGS,
// data-no-translate, the widget's own dropdown container) so a
// server-side crawl translates exactly what the widget would have,
// no more and no less.
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);

// Pages that either aren't real content (admin/API routes) or are
// per-shopper/dynamic (checkout, cart, account) and not worth (or safe
// to) crawl anonymously.
const SKIP_LINK_PREFIXES = ["/checkout", "/cart", "/account", "/admin", "/api"];

const SKIP_EXTENSION =
  /\.(jpe?g|png|gif|svg|webp|ico|pdf|zip|css|m?js|json|xml|mp4|mp3|woff2?|ttf|eot)$/i;

export interface PageContent {
  texts: string[];
  links: string[];
}

function hasSkippedAncestor(node: Node): boolean {
  let current = node.parentNode as HTMLElement | null;
  while (current) {
    if (SKIP_TAGS.has(current.tagName ?? "")) return true;
    if (current.getAttribute("data-no-translate") !== undefined) return true;
    if (current.id === "estranslate-widget") return true;
    current = current.parentNode as HTMLElement | null;
  }
  return false;
}

function collectTexts(root: HTMLElement): string[] {
  const texts: string[] = [];
  function walk(node: Node) {
    if (node.nodeType === NodeType.TEXT_NODE) {
      const value = node.rawText?.trim();
      if (value && !hasSkippedAncestor(node)) texts.push(value);
      return;
    }
    if (node.nodeType === NodeType.ELEMENT_NODE) {
      node.childNodes.forEach(walk);
    }
  }
  walk(root);

  for (const el of root.querySelectorAll("input[placeholder], textarea[placeholder]")) {
    const value = el.getAttribute("placeholder")?.trim();
    if (value && !hasSkippedAncestor(el)) texts.push(value);
  }

  return texts;
}

function normalizeLink(href: string, baseUrl: URL): string | null {
  let target: URL;
  try {
    target = new URL(href, baseUrl);
  } catch {
    return null;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return null;
  if (target.hostname !== baseUrl.hostname) return null;
  if (SKIP_LINK_PREFIXES.some((prefix) => target.pathname.startsWith(prefix))) return null;
  if (SKIP_EXTENSION.test(target.pathname)) return null;

  target.hash = "";
  target.search = "";
  let normalized = target.toString();
  if (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized;
}

function collectLinks(root: HTMLElement, baseUrl: URL): string[] {
  const links = new Set<string>();
  for (const a of root.querySelectorAll("a[href]")) {
    if (hasSkippedAncestor(a)) continue;
    const href = a.getAttribute("href");
    if (!href) continue;
    const normalized = normalizeLink(href, baseUrl);
    if (normalized) links.add(normalized);
  }
  return [...links];
}

/** Parse one fetched storefront page into translatable text + same-origin links to follow. */
export function extractPageContent(html: string, pageUrl: string): PageContent {
  const baseUrl = new URL(pageUrl);
  const root = parse(html);
  return {
    texts: collectTexts(root),
    links: collectLinks(root, baseUrl),
  };
}
