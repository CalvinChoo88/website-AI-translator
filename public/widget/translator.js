/**
 * EasyStore Website Translator — storefront widget.
 * Embed via: <script src=".../widget/translator.js" data-shop="{shop-domain}" async></script>
 *
 * What it does:
 *  - Renders a language dropdown (bottom-right, overridable via CSS).
 *  - On a shopper's first visit, if the merchant enabled auto-detect,
 *    pre-selects a suggested language based on the visitor's (or their
 *    VPN exit node's — this app does not attempt to unmask real IPs
 *    behind a VPN/proxy) approximate country. The shopper can always
 *    change it.
 *  - Remembers the shopper's choice in a cookie so it isn't re-detected
 *    on every visit.
 *  - Translates visible text on the page by batching text nodes to the
 *    app's /api/translate endpoint (server-side cached per shop+locale).
 */
(function () {
  "use strict";

  var CURRENT_SCRIPT = document.currentScript;
  if (!CURRENT_SCRIPT) return;

  var API_BASE = new URL(CURRENT_SCRIPT.src).origin;
  var SHOP = CURRENT_SCRIPT.getAttribute("data-shop");
  if (!SHOP) {
    console.error("[translator-widget] missing data-shop attribute on script tag");
    return;
  }

  var COOKIE_NAME = "estranslate_locale";
  var COOKIE_DAYS = 180;

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value) {
    var expires = new Date(Date.now() + COOKIE_DAYS * 864e5).toUTCString();
    document.cookie =
      name + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/; SameSite=Lax";
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function (res) {
      if (!res.ok) throw new Error("Request failed: " + url);
      return res.json();
    });
  }

  // --- Collect translatable text nodes -------------------------------

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1 };

  function collectTextNodes(root) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS[parent.tagName]) return NodeFilter.FILTER_REJECT;
        if (parent.closest("[data-no-translate]")) return NodeFilter.FILTER_REJECT;
        if (parent.closest("#estranslate-widget")) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var current;
    while ((current = walker.nextNode())) nodes.push(current);
    return nodes;
  }

  // node -> original text, captured once so we can restore it and so
  // switching locales never re-translates already-translated text.
  var originalText = new WeakMap();
  var textNodes = [];

  function captureOriginals() {
    textNodes = collectTextNodes(document.body);
    textNodes.forEach(function (node) {
      if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    });
  }

  function restoreOriginals() {
    textNodes.forEach(function (node) {
      var original = originalText.get(node);
      if (original !== undefined) node.nodeValue = original;
    });
  }

  // Bumped on every new selection so a slow, still-in-flight chunk from
  // a superseded request can't clobber the DOM after the user has
  // already switched to a different language.
  var currentRequestId = 0;

  function applyTranslations(sourceLocale, targetLocale) {
    var requestId = ++currentRequestId;
    captureOriginals();
    if (targetLocale === sourceLocale) {
      restoreOriginals();
      return Promise.resolve();
    }

    var perNodeText = textNodes.map(function (node) {
      return originalText.get(node);
    });

    // Map each unique string to every node index sharing it, so a
    // single translated result can be applied everywhere it appears
    // (e.g. repeated nav/footer text) as soon as its chunk lands.
    var uniqueTexts = [];
    var nodeIndicesByText = {};
    perNodeText.forEach(function (text, i) {
      var key = text.trim();
      if (!key) return;
      if (!(key in nodeIndicesByText)) {
        nodeIndicesByText[key] = [];
        uniqueTexts.push(key);
      }
      nodeIndicesByText[key].push(i);
    });

    if (uniqueTexts.length === 0) return Promise.resolve();

    // Chunk to stay under the API's per-request cap.
    var CHUNK = 150;
    var chunks = [];
    for (var i = 0; i < uniqueTexts.length; i += CHUNK) chunks.push(uniqueTexts.slice(i, i + CHUNK));

    // Fire every chunk in parallel (rather than one-at-a-time) and
    // apply each one to the DOM as soon as it lands, so the page
    // starts looking translated well before the slowest chunk finishes.
    return Promise.all(
      chunks.map(function (chunkTexts) {
        return fetchJson(API_BASE + "/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shop: SHOP, locale: targetLocale, texts: chunkTexts }),
        }).then(function (data) {
          if (requestId !== currentRequestId) return; // superseded by a newer selection
          chunkTexts.forEach(function (key, idx) {
            var translated = data.translations[idx];
            if (!translated) return;
            nodeIndicesByText[key].forEach(function (nodeIndex) {
              var text = perNodeText[nodeIndex];
              // Preserve surrounding whitespace from the original text node.
              textNodes[nodeIndex].nodeValue = text.replace(key, translated);
            });
          });
        });
      }),
    );
  }

  // --- Widget UI -------------------------------------------------------

  function buildDropdown(config) {
    var container = document.createElement("div");
    container.id = "estranslate-widget";
    container.setAttribute("data-no-translate", "");
    container.style.cssText =
      "position:fixed;bottom:16px;right:16px;z-index:2147483000;" +
      "font-family:system-ui,sans-serif;font-size:14px;";

    var select = document.createElement("select");
    select.style.cssText =
      "padding:8px 12px;border-radius:8px;border:1px solid #ccc;background:#fff;" +
      "box-shadow:0 2px 8px rgba(0,0,0,0.15);cursor:pointer;";

    var originalOption = document.createElement("option");
    originalOption.value = config.sourceLocale;
    originalOption.textContent = "Original";
    select.appendChild(originalOption);

    config.enabledLocales.forEach(function (lang) {
      var opt = document.createElement("option");
      opt.value = lang.code;
      opt.textContent = lang.name;
      select.appendChild(opt);
    });

    container.appendChild(select);
    document.body.appendChild(container);
    return select;
  }

  function init() {
    fetchJson(API_BASE + "/api/widget/config?shop=" + encodeURIComponent(SHOP))
      .then(function (config) {
        if (!config.enabledLocales || config.enabledLocales.length === 0) return;

        var select = buildDropdown(config);

        function withLoadingState(promise) {
          select.disabled = true;
          select.style.opacity = "0.6";
          select.style.cursor = "wait";
          function reset() {
            select.disabled = false;
            select.style.opacity = "1";
            select.style.cursor = "pointer";
          }
          promise.then(reset, reset);
        }

        var saved = getCookie(COOKIE_NAME);
        var initialLocale =
          saved && (saved === config.sourceLocale || config.enabledLocales.some(function (l) {
            return l.code === saved;
          }))
            ? saved
            : config.autoDetect
              ? config.suggestedLocale
              : config.sourceLocale;

        select.value = initialLocale;
        if (initialLocale !== config.sourceLocale) {
          withLoadingState(applyTranslations(config.sourceLocale, initialLocale));
        } else {
          captureOriginals();
        }
        if (!saved) setCookie(COOKIE_NAME, initialLocale);

        select.addEventListener("change", function () {
          var target = select.value;
          setCookie(COOKIE_NAME, target);
          withLoadingState(applyTranslations(config.sourceLocale, target));
        });
      })
      .catch(function (err) {
        console.error("[translator-widget]", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
