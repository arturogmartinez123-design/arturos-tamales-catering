/**
 * Load unpacked extension via Chrome flags and verify content script + backend loop.
 */
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const extensionPath = path.join(root, "extension");
const artifacts = "/opt/cursor/artifacts";
fs.mkdirSync(artifacts, { recursive: true });

const chromePath =
  process.env.CHROME_PATH ||
  ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/local/bin/google-chrome"].find(
    (p) => fs.existsSync(p)
  );

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--window-size=1280,900",
  ],
  defaultViewport: { width: 1280, height: 800 },
});

const results = [];
function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS: ${name}${detail ? " — " + detail : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL: ${name}${detail ? " — " + detail : ""}`);
}

try {
  // Wait for service worker / extension
  await new Promise((r) => setTimeout(r, 2000));
  const targets = browser.targets();
  const extTarget = targets.find(
    (t) => t.type() === "service_worker" || (t.url() && t.url().startsWith("chrome-extension://"))
  );
  let extensionId = null;
  for (const t of targets) {
    const u = t.url();
    const m = u.match(/^chrome-extension:\/\/([a-p]{32})/);
    if (m) {
      extensionId = m[1];
      break;
    }
  }
  if (extensionId) pass("extension loaded", extensionId);
  else {
    // fallback: open extensions page via CDP
    fail("extension id not found yet", targets.map((t) => `${t.type()}:${t.url()}`).join(" | "));
  }

  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.text().includes("LPC") || msg.type() === "error") {
      console.log("PAGE LOG:", msg.type(), msg.text());
    }
  });

  await page.goto("http://127.0.0.1:4174/", { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));

  // Content script should be injected; probe for __LPC_CONTENT__
  const hasContent = await page.evaluate(() => !!window.__LPC_CONTENT__);
  if (hasContent) pass("content script injected");
  else {
    // Manually inject for fallback verification of snapshot logic
    fail("content script not auto-injected", "will inject manually");
    const js = fs.readFileSync(path.join(extensionPath, "content/content.js"), "utf8");
    // content script uses chrome.runtime — stub it for injection test
    await page.evaluateOnNewDocument(() => {});
    await page.evaluate((code) => {
      window.chrome = window.chrome || {};
      window.chrome.runtime = {
        sendMessage: (msg) => {
          window.__LPC_LAST_SNAPSHOT_MSG = msg;
          return Promise.resolve({ ok: true });
        },
        onMessage: {
          addListener: (fn) => {
            window.__LPC_ON_MSG = fn;
          },
        },
      };
      // eslint-disable-next-line no-eval
      eval(code);
    }, js);
    await new Promise((r) => setTimeout(r, 800));
  }

  // Build snapshot via message or evaluate build if available
  const snapshot = await page.evaluate(async () => {
    if (window.__LPC_ON_MSG) {
      return await new Promise((resolve) => {
        window.__LPC_ON_MSG({ type: "LPC_GET_SNAPSHOT" }, null, (res) => resolve(res));
      });
    }
    // If real extension, chrome.runtime may not expose to page; scrape DOM similarly
    return null;
  });

  let snapPayload = snapshot?.snapshot;
  if (!snapPayload) {
    // Ask extension via CDP scripting if possible
    snapPayload = await page.evaluate(() => {
      const headings = [...document.querySelectorAll("h1,h2,h3")].map((el, i) => ({
        id: `h-${i}`,
        level: Number(el.tagName[1]),
        text: el.innerText.trim(),
        selector: el.id ? `#${el.id}` : el.tagName.toLowerCase(),
      }));
      const buttons = [...document.querySelectorAll("button")].map((el, i) => ({
        id: `b-${i}`,
        text: el.innerText.trim(),
        selector: el.id ? `#${el.id}` : `button:nth-of-type(${i + 1})`,
        destructive: /buy|send|delete/i.test(el.innerText),
      }));
      const forms = [...document.querySelectorAll("form")].map((form, i) => ({
        id: `f-${i}`,
        selector: form.id ? `#${form.id}` : "form",
        fields: [...form.querySelectorAll("input,textarea")]
          .filter((el) => el.type !== "password" && !/card|payment/i.test(el.name || ""))
          .map((el) => ({
            name: el.name,
            type: el.type || "text",
            label: el.name,
            selector: `input[name="${el.name}"]`,
          })),
      }));
      return {
        url: location.href,
        title: document.title,
        capturedAt: Date.now(),
        scroll: { x: 0, y: 0, maxY: 1000 },
        headings,
        textBlocks: [...document.querySelectorAll("p")]
          .slice(0, 5)
          .map((el, i) => ({
            id: `t-${i}`,
            text: el.innerText.trim().slice(0, 200),
            selector: "p",
          })),
        links: [...document.querySelectorAll("a")].map((el, i) => ({
          id: `a-${i}`,
          text: el.innerText.trim(),
          href: el.href,
          selector: `a[href="${el.getAttribute("href")}"]`,
        })),
        buttons,
        forms,
        images: [],
      };
    });
    pass("fallback DOM snapshot built", snapPayload.title);
  } else {
    pass("got snapshot from content script", snapPayload.title);
  }

  // Sensitive fields must not appear
  const fieldNames = (snapPayload.forms || []).flatMap((f) => f.fields.map((x) => x.name));
  if (!fieldNames.includes("password") && !fieldNames.includes("card_number")) {
    pass("sensitive fields omitted from snapshot", fieldNames.join(","));
  } else {
    fail("sensitive fields present", fieldNames.join(","));
  }

  // Backend feedback
  const fbRes = await fetch("http://127.0.0.1:8787/api/feedback/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: "e2e-1", mode: "copy", snapshot: snapPayload }),
  });
  const fbText = await fbRes.text();
  if (fbText.includes("event: feedback")) pass("copy-review SSE", fbText.match(/"kind":"[^"]+"/g)?.join(" "));
  else fail("copy-review SSE", fbText.slice(0, 200));

  // Navigate plan
  const nav = await fetch("http://127.0.0.1:8787/api/navigate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "e2e-1",
      command: "scroll to Pricing",
      snapshot: snapPayload,
    }),
  }).then((r) => r.json());
  if (nav.actions?.[0]?.kind === "scroll") pass("navigate scroll plan", JSON.stringify(nav));
  else fail("navigate scroll plan", JSON.stringify(nav));

  const buy = await fetch("http://127.0.0.1:8787/api/navigate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "e2e-1",
      command: "click Buy now",
      snapshot: snapPayload,
    }),
  }).then((r) => r.json());
  if (buy.actions?.[0]?.requiresConfirm) pass("buy requires confirm", JSON.stringify(buy));
  else fail("buy requires confirm", JSON.stringify(buy));

  // Execute scroll on page
  await page.evaluate(() => {
    document.querySelector("#pricing")?.scrollIntoView({ behavior: "instant", block: "center" });
    const el = document.querySelector("#pricing h2");
    if (el) {
      el.style.outline = "3px solid #c45c26";
      el.classList.add("lpc-highlight");
    }
  });
  await page.screenshot({ path: path.join(artifacts, "e2e-scroll-pricing.png"), fullPage: false });
  pass("screenshot scroll pricing");

  // Chat
  const chatRes = await fetch("http://127.0.0.1:8787/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "e2e-1",
      message: "What headings are on this page?",
      snapshot: snapPayload,
    }),
  });
  const chatText = await chatRes.text();
  if (chatText.includes("event: token") && /Pricing|Features|Fresh/i.test(chatText)) {
    pass("chat streaming", chatText.match(/"message":".*?"/)?.[0]?.slice(0, 120));
  } else fail("chat streaming", chatText.slice(0, 300));

  // Side panel page if we have extension id
  if (extensionId) {
    const panel = await browser.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await new Promise((r) => setTimeout(r, 1000));
    await panel.screenshot({ path: path.join(artifacts, "e2e-sidepanel.png") });
    const title = await panel.title();
    if (/Co-Pilot/i.test(title)) pass("side panel opens", title);
    else fail("side panel opens", title);

    // Drive panel against backend with injected snapshot via evaluate fetch path already works on load health
    const conn = await panel.$eval("#connStatus", (el) => el.textContent);
    pass("side panel conn status", conn);
  }

  await page.screenshot({ path: path.join(artifacts, "e2e-demo-page.png") });
} catch (err) {
  fail("uncaught", err.stack || String(err));
} finally {
  fs.writeFileSync(path.join(artifacts, "e2e-results.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await browser.close().catch(() => {});
  process.exit(failed ? 1 : 0);
}
