(() => {
  if (window.__LPC_CONTENT__) return;
  window.__LPC_CONTENT__ = true;

  const SENSITIVE_TYPES = new Set([
    "password",
    "hidden",
  ]);
  const SENSITIVE_NAME_RE =
    /pass(word)?|passwd|pwd|card|cc[-_]?num|cvc|cvv|csc|credit|debit|iban|routing|ssn|social.?security|payment|expir/i;
  const DESTRUCTIVE_RE =
    /submit|buy|purchase|checkout|pay|send|delete|remove|confirm order|place order/i;

  let paused = false;
  let hoverText = "";
  let lastSnapshotJson = "";
  let debounceTimer = null;
  let idCounter = 0;

  function toast(msg) {
    let el = document.querySelector(".lpc-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "lpc-toast";
      document.documentElement.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("lpc-toast-show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("lpc-toast-show"), 2200);
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function stableSelector(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return `#${cssEscape(el.id)}`;
    const testId =
      el.getAttribute("data-testid") ||
      el.getAttribute("data-test") ||
      el.getAttribute("data-qa");
    if (testId) return `[data-testid="${cssEscape(testId)}"]`;

    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body && parts.length < 5) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) {
        parts.unshift(`#${cssEscape(cur.id)}`);
        break;
      }
      const parent = cur.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter(
          (c) => c.tagName === cur.tagName
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cur) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(" > ");
  }

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function isSensitiveField(el) {
    const type = (el.getAttribute("type") || "").toLowerCase();
    const name = el.getAttribute("name") || "";
    const id = el.id || "";
    const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (SENSITIVE_TYPES.has(type)) return true;
    if (type === "tel" && /card|cvv|cvc/i.test(name + id)) return true;
    if (SENSITIVE_NAME_RE.test(name) || SENSITIVE_NAME_RE.test(id) || SENSITIVE_NAME_RE.test(autocomplete)) {
      return true;
    }
    if (/cc-|cc_|card|payment/i.test(autocomplete)) return true;
    return false;
  }

  function textOf(el, max = 240) {
    const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max) + "…" : t;
  }

  function nextId(prefix) {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
  }

  function buildSnapshot() {
    idCounter = 0;
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .filter(visible)
      .slice(0, 40)
      .map((el) => ({
        id: nextId("h"),
        level: Number(el.tagName[1]),
        text: textOf(el, 160),
        selector: stableSelector(el),
      }));

    const main =
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.body;
    const textBlocks = [];
    const paras = main.querySelectorAll("p, li, [role='text'], .hero p, section p");
    for (const el of paras) {
      if (!visible(el)) continue;
      const text = textOf(el, 320);
      if (text.length < 12) continue;
      textBlocks.push({
        id: nextId("t"),
        text,
        selector: stableSelector(el),
      });
      if (textBlocks.length >= 30) break;
    }

    const links = [...document.querySelectorAll("a[href]")]
      .filter(visible)
      .slice(0, 40)
      .map((el) => ({
        id: nextId("a"),
        text: textOf(el, 80) || el.getAttribute("aria-label") || "",
        href: el.href,
        selector: stableSelector(el),
      }));

    const buttons = [
      ...document.querySelectorAll(
        "button, [role='button'], input[type='button'], input[type='submit'], a.btn, .button"
      ),
    ]
      .filter(visible)
      .slice(0, 40)
      .map((el) => {
        const label =
          textOf(el, 80) ||
          el.getAttribute("aria-label") ||
          el.getAttribute("value") ||
          "";
        return {
          id: nextId("b"),
          text: label,
          selector: stableSelector(el),
          role: el.getAttribute("role") || el.tagName.toLowerCase(),
          destructive: DESTRUCTIVE_RE.test(label),
        };
      });

    const forms = [...document.querySelectorAll("form")].slice(0, 10).map((form) => {
      const fields = [];
      for (const el of form.querySelectorAll("input, textarea, select")) {
        if (isSensitiveField(el)) continue;
        const type = (el.getAttribute("type") || el.tagName.toLowerCase()).toLowerCase();
        if (type === "submit" || type === "button" || type === "image") continue;
        const labelEl = el.id
          ? document.querySelector(`label[for="${cssEscape(el.id)}"]`)
          : el.closest("label");
        fields.push({
          name: el.getAttribute("name") || el.id || "",
          type,
          label: labelEl ? textOf(labelEl, 80) : el.getAttribute("placeholder") || "",
          selector: stableSelector(el),
          // never include values for any field in MVP snapshots
        });
      }
      return {
        id: nextId("f"),
        selector: stableSelector(form),
        fields,
      };
    });

    const images = [...document.querySelectorAll("img")]
      .filter(visible)
      .slice(0, 20)
      .map((el) => ({
        id: nextId("i"),
        alt: el.getAttribute("alt") || "",
        selector: stableSelector(el),
      }));

    const selection = window.getSelection()?.toString()?.trim() || "";

    return {
      url: location.href,
      title: document.title,
      capturedAt: Date.now(),
      scroll: {
        x: window.scrollX,
        y: window.scrollY,
        maxY: Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight
        ),
      },
      selection: selection || undefined,
      hover: hoverText || undefined,
      headings,
      textBlocks,
      links,
      buttons,
      forms,
      images,
    };
  }

  function emitSnapshot(force = false) {
    if (paused && !force) return;
    const snapshot = buildSnapshot();
    const json = JSON.stringify(snapshot);
    if (!force && json === lastSnapshotJson) return;
    lastSnapshotJson = json;
    chrome.runtime.sendMessage({ type: "LPC_SNAPSHOT", snapshot }).catch(() => {});
  }

  function scheduleSnapshot() {
    if (paused) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => emitSnapshot(false), 1500);
  }

  function highlight(selector) {
    document.querySelectorAll(".lpc-highlight").forEach((el) => {
      el.classList.remove("lpc-highlight");
    });
    if (!selector) return null;
    let el = null;
    try {
      el = document.querySelector(selector);
    } catch {
      return null;
    }
    if (!el) return null;
    el.classList.add("lpc-highlight");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el.classList.remove("lpc-highlight"), 3500);
    return el;
  }

  function findByText(candidates, query) {
    const q = query.toLowerCase().trim();
    if (!q) return null;
    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      if (!visible(el)) continue;
      const text = (
        el.innerText ||
        el.getAttribute("aria-label") ||
        el.getAttribute("value") ||
        el.getAttribute("alt") ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (!text) continue;
      if (text === q) return el;
      if (text.includes(q) && text.length > bestScore) {
        best = el;
        bestScore = text.length;
      }
    }
    return best;
  }

  function resolveTarget(action) {
    if (action.selector) {
      try {
        const el = document.querySelector(action.selector);
        if (el) return el;
      } catch {
        /* ignore */
      }
    }
    if (action.text) {
      if (action.kind === "scroll" || action.kind === "click") {
        const pool = [
          ...document.querySelectorAll("h1,h2,h3,h4,h5,h6,a,button,[role='button'],p,li,label"),
        ];
        return findByText(pool, action.text);
      }
      if (action.kind === "fill") {
        const fields = [...document.querySelectorAll("input, textarea, select")].filter(
          (el) => !isSensitiveField(el)
        );
        return findByText(
          fields.map((el) => {
            const label = el.id
              ? document.querySelector(`label[for="${cssEscape(el.id)}"]`)
              : el.closest("label");
            return label || el;
          }),
          action.text
        );
      }
    }
    return null;
  }

  function needsConfirm(action, el) {
    if (action.requiresConfirm) return true;
    if (action.kind === "submit") return true;
    if (el) {
      const label =
        (el.innerText || el.getAttribute("aria-label") || el.getAttribute("value") || "") +
        " " +
        (el.type || "");
      if (DESTRUCTIVE_RE.test(label)) return true;
      if (el.tagName === "FORM" || el.type === "submit") return true;
    }
    return false;
  }

  async function runActions(actions, { confirmed } = { confirmed: false }) {
    const results = [];
    for (const action of actions) {
      if (action.kind === "scroll") {
        const el = resolveTarget(action);
        if (el) {
          highlight(stableSelector(el));
          results.push({ ok: true, action, selector: stableSelector(el) });
        } else if (typeof action.y === "number") {
          window.scrollTo({ top: action.y, behavior: "smooth" });
          results.push({ ok: true, action });
        } else {
          results.push({ ok: false, action, error: "Target not found" });
        }
        continue;
      }

      if (action.kind === "click" || action.kind === "submit") {
        const el = resolveTarget(action);
        if (!el) {
          results.push({ ok: false, action, error: "Target not found" });
          continue;
        }
        if (needsConfirm(action, el) && !confirmed) {
          results.push({
            ok: false,
            action: { ...action, selector: stableSelector(el), requiresConfirm: true },
            error: "confirmation_required",
            preview: `Will click: "${textOf(el, 60)}"`,
          });
          continue;
        }
        highlight(stableSelector(el));
        el.click();
        results.push({ ok: true, action, selector: stableSelector(el) });
        continue;
      }

      if (action.kind === "fill") {
        let el = null;
        if (action.selector) {
          try {
            el = document.querySelector(action.selector);
          } catch {
            /* ignore */
          }
        }
        if (!el && action.text) {
          const inputs = [...document.querySelectorAll("input, textarea, select")].filter(
            (n) => !isSensitiveField(n) && visible(n)
          );
          el = findByText(
            inputs.map((input) => {
              const label = input.id
                ? document.querySelector(`label[for="${cssEscape(input.id)}"]`)
                : input.closest("label");
              // prefer matching label text but return the input
              if (label && textOf(label).toLowerCase().includes(action.text.toLowerCase())) {
                return input;
              }
              return input;
            }),
            action.text
          );
          // findByText may return label; resolve to control
          if (el && el.tagName === "LABEL") {
            const forId = el.getAttribute("for");
            el = forId ? document.getElementById(forId) : el.querySelector("input,textarea,select");
          }
        }
        if (!el || isSensitiveField(el)) {
          results.push({
            ok: false,
            action,
            error: el && isSensitiveField(el) ? "Refusing sensitive field" : "Field not found",
          });
          continue;
        }
        if (needsConfirm(action, el) && !confirmed) {
          results.push({
            ok: false,
            action: { ...action, selector: stableSelector(el), requiresConfirm: true },
            error: "confirmation_required",
            preview: `Will fill field`,
          });
          continue;
        }
        el.focus();
        el.value = action.value ?? "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        highlight(stableSelector(el));
        results.push({ ok: true, action, selector: stableSelector(el) });
        continue;
      }

      results.push({ ok: false, action, error: "Unknown action" });
    }
    return results;
  }

  const observer = new MutationObserver(() => scheduleSnapshot());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });

  window.addEventListener("scroll", () => scheduleSnapshot(), { passive: true });
  document.addEventListener("selectionchange", () => scheduleSnapshot());
  document.addEventListener(
    "mouseover",
    (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      hoverText = textOf(t, 120);
      scheduleSnapshot();
    },
    { passive: true }
  );

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;

    if (msg.type === "LPC_SET_PAUSED") {
      paused = !!msg.paused;
      toast(paused ? "Capture paused" : "Capture resumed");
      if (!paused) emitSnapshot(true);
      sendResponse({ ok: true, paused });
      return true;
    }

    if (msg.type === "LPC_GET_SNAPSHOT") {
      sendResponse({ ok: true, snapshot: buildSnapshot(), paused });
      return true;
    }

    if (msg.type === "LPC_HIGHLIGHT") {
      const el = highlight(msg.selector);
      sendResponse({ ok: !!el });
      return true;
    }

    if (msg.type === "LPC_RUN_ACTIONS") {
      runActions(msg.actions || [], { confirmed: !!msg.confirmed }).then((results) => {
        sendResponse({ ok: true, results });
      });
      return true;
    }
  });

  // Initial capture
  setTimeout(() => emitSnapshot(true), 400);
})();
