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
 *    Also translates input/textarea placeholder text (e.g. "First name"),
 *    which lives in an attribute rather than a text node and needs its
 *    own capture/apply path.
 *  - Watches for content added to the page after load (e.g. a checkout
 *    step that renders its form client-side a moment after page load)
 *    and translates that too, rather than only translating a one-time
 *    snapshot of the page. This does NOT reach into shadow DOM or
 *    cross-origin iframes — content deliberately isolated there (e.g.
 *    a platform's own payment/PII form, for security reasons) stays
 *    untouched, by design.
 *  - Sends the current page URL with every translate call so that,
 *    if the merchant has opted into auto-warm, the server can use it
 *    as a starting point for a background crawl of the rest of the
 *    storefront the first time a given locale is used.
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

  function isTranslatable(node) {
    var parent = node.parentElement;
    if (!parent) return false;
    if (SKIP_TAGS[parent.tagName]) return false;
    if (parent.closest("[data-no-translate]")) return false;
    if (parent.closest("#estranslate-widget")) return false;
    if (!node.nodeValue || !node.nodeValue.trim()) return false;
    return true;
  }

  function collectTextNodes(root) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return isTranslatable(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
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

  function captureOriginals(nodes) {
    nodes.forEach(function (node) {
      if (!originalText.has(node)) {
        originalText.set(node, node.nodeValue);
        textNodes.push(node);
      }
    });
  }

  function restoreOriginals() {
    textNodes.forEach(function (node) {
      var original = originalText.get(node);
      if (original !== undefined) node.nodeValue = original;
    });
  }

  // Input/textarea placeholder text lives in an attribute, not a text
  // node, so the TreeWalker above never sees it — it needs its own
  // capture/translate/restore path.
  var originalPlaceholder = new WeakMap();
  var placeholderElements = [];

  function isTranslatableElement(el) {
    if (el.closest("[data-no-translate]")) return false;
    if (el.closest("#estranslate-widget")) return false;
    return true;
  }

  function collectPlaceholderElements(root) {
    var elements = [];
    if (root.matches && root.matches("input[placeholder], textarea[placeholder]") && isTranslatableElement(root)) {
      elements.push(root);
    }
    if (root.querySelectorAll) {
      var found = root.querySelectorAll("input[placeholder], textarea[placeholder]");
      for (var i = 0; i < found.length; i++) {
        if (found[i].getAttribute("placeholder").trim() && isTranslatableElement(found[i])) {
          elements.push(found[i]);
        }
      }
    }
    return elements;
  }

  function capturePlaceholders(elements) {
    elements.forEach(function (el) {
      if (!originalPlaceholder.has(el)) {
        originalPlaceholder.set(el, el.getAttribute("placeholder"));
        placeholderElements.push(el);
      }
    });
  }

  function restorePlaceholders() {
    placeholderElements.forEach(function (el) {
      var original = originalPlaceholder.get(el);
      if (original !== undefined) el.setAttribute("placeholder", original);
    });
  }

  // Bumped on every new selection so a slow, still-in-flight chunk from
  // a superseded request can't clobber the DOM after the user has
  // already switched to a different language.
  var currentRequestId = 0;
  // The currently-selected target locale, tracked so the mutation
  // observer below knows whether (and into what) to translate newly
  // added content. Set by applyTranslations.
  var activeTargetLocale = null;
  var sourceLocaleGlobal = null;

  // A "unit" is anything with a translatable string and a way to apply
  // a translated result back — a text node, or an input's placeholder
  // attribute. This lets one pipeline (chunking, caching, applying)
  // serve both.
  function textNodeUnit(node) {
    return {
      text: originalText.get(node),
      apply: function (key, translated) {
        var text = originalText.get(node);
        // Preserve surrounding whitespace from the original text node.
        node.nodeValue = text.replace(key, translated);
      },
    };
  }

  function placeholderUnit(el) {
    return {
      text: originalPlaceholder.get(el),
      apply: function (key, translated) {
        el.setAttribute("placeholder", translated);
      },
    };
  }

  // Translates a specific list of units and applies results as each
  // chunk lands. Shared by the full-page pass and the mutation
  // observer's incremental passes, for both text nodes and placeholders.
  function translateUnits(units, targetLocale, requestId) {
    // Map each unique string to every unit sharing it, so a single
    // translated result can be applied everywhere it appears.
    var uniqueTexts = [];
    var unitsByText = {};
    units.forEach(function (unit) {
      var key = unit.text.trim();
      if (!key) return;
      if (!(key in unitsByText)) {
        unitsByText[key] = [];
        uniqueTexts.push(key);
      }
      unitsByText[key].push(unit);
    });

    if (uniqueTexts.length === 0) return Promise.resolve();

    // Chunk to stay under the API's per-request cap.
    var CHUNK = 150;
    var chunks = [];
    for (var i = 0; i < uniqueTexts.length; i += CHUNK) chunks.push(uniqueTexts.slice(i, i + CHUNK));

    // Fire every chunk in parallel (rather than one-at-a-time) and
    // apply each one to the DOM as soon as it lands.
    return Promise.all(
      chunks.map(function (chunkTexts) {
        return fetchJson(API_BASE + "/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop: SHOP,
            locale: targetLocale,
            texts: chunkTexts,
            pageUrl: location.href,
          }),
        }).then(function (data) {
          if (requestId !== currentRequestId) return; // superseded by a newer selection
          chunkTexts.forEach(function (key, idx) {
            var translated = data.translations[idx];
            if (!translated) return;
            unitsByText[key].forEach(function (unit) {
              unit.apply(key, translated);
            });
          });
        });
      }),
    );
  }

  function translateNodeList(nodes, targetLocale, requestId) {
    return translateUnits(nodes.map(textNodeUnit), targetLocale, requestId);
  }

  function translatePlaceholderList(elements, targetLocale, requestId) {
    return translateUnits(elements.map(placeholderUnit), targetLocale, requestId);
  }

  function applyTranslations(sourceLocale, targetLocale) {
    var requestId = ++currentRequestId;
    sourceLocaleGlobal = sourceLocale;
    activeTargetLocale = targetLocale;
    captureOriginals(collectTextNodes(document.body));
    capturePlaceholders(collectPlaceholderElements(document.body));

    if (targetLocale === sourceLocale) {
      restoreOriginals();
      restorePlaceholders();
      return Promise.resolve();
    }

    return Promise.all([
      translateNodeList(textNodes, targetLocale, requestId),
      translatePlaceholderList(placeholderElements, targetLocale, requestId),
    ]);
  }

  // --- Pick up content added to the page after the initial pass ------
  //
  // Some pages (checkout in particular) render parts of the form a
  // moment after the page loads. Without this, only whatever existed
  // at the moment a language was selected gets translated. This does
  // not, and cannot, reach into shadow DOM or cross-origin iframes —
  // if a platform deliberately isolates a form there (e.g. around
  // payment fields, for security), it's simply not visible to any
  // page script, this one included.
  var pendingMutationNodes = [];
  var pendingPlaceholderElements = [];
  var mutationDebounceTimer = null;

  function flushPendingMutations() {
    mutationDebounceTimer = null;
    if (!activeTargetLocale || activeTargetLocale === sourceLocaleGlobal) {
      pendingMutationNodes = [];
      pendingPlaceholderElements = [];
      return;
    }
    var newNodes = [];
    pendingMutationNodes.forEach(function (node) {
      if (!originalText.has(node)) newNodes.push(node);
    });
    pendingMutationNodes = [];

    var newPlaceholders = [];
    pendingPlaceholderElements.forEach(function (el) {
      if (!originalPlaceholder.has(el)) newPlaceholders.push(el);
    });
    pendingPlaceholderElements = [];

    if (newNodes.length > 0) {
      captureOriginals(newNodes);
      translateNodeList(newNodes, activeTargetLocale, currentRequestId);
    }
    if (newPlaceholders.length > 0) {
      capturePlaceholders(newPlaceholders);
      translatePlaceholderList(newPlaceholders, activeTargetLocale, currentRequestId);
    }
  }

  function observePageChanges() {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === Node.TEXT_NODE) {
            if (isTranslatable(node)) pendingMutationNodes.push(node);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            pendingMutationNodes = pendingMutationNodes.concat(collectTextNodes(node));
            pendingPlaceholderElements = pendingPlaceholderElements.concat(collectPlaceholderElements(node));
          }
        });
      });
      if (pendingMutationNodes.length === 0 && pendingPlaceholderElements.length === 0) return;
      if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = setTimeout(flushPendingMutations, 400);
    });
    observer.observe(document.body, { childList: true, subtree: true });
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
        observePageChanges();

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
          sourceLocaleGlobal = config.sourceLocale;
          activeTargetLocale = config.sourceLocale;
          captureOriginals(collectTextNodes(document.body));
          capturePlaceholders(collectPlaceholderElements(document.body));
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
