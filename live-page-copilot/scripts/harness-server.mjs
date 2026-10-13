/**
 * Local harness: serves demo + side panel with chrome.* mocks so we can
 * exercise the MVP UI when Chrome refuses --load-extension.
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = 4175;

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

const mockChrome = `
window.chrome = {
  storage: {
    session: {
      _data: {},
      async get(keys) {
        const out = {};
        for (const k of Array.isArray(keys) ? keys : [keys]) out[k] = this._data[k];
        return out;
      },
      async set(obj) { Object.assign(this._data, obj); }
    }
  },
  runtime: {
    sendMessage(msg, cb) {
      return new Promise(async (resolve) => {
        let res = { ok: true };
        if (msg.type === 'LPC_ACTIVE_TAB') {
          res = { ok: true, tab: { id: 1, url: location.origin + '/demo/', title: 'Co-Pilot Demo Shop' } };
        } else if (msg.type === 'LPC_TO_TAB') {
          const payload = msg.payload || {};
          if (window.opener && window.opener.__LPC_ON_MSG) {
            res = await new Promise((r) => window.opener.__LPC_ON_MSG(payload, null, r));
          } else if (window.parent && window.parent !== window && window.parent.__LPC_ON_MSG) {
            res = await new Promise((r) => window.parent.__LPC_ON_MSG(payload, null, r));
          } else {
            // Broadcast to demo frame
            const frame = document.getElementById('demoFrame');
            if (frame?.contentWindow?.__LPC_ON_MSG) {
              res = await new Promise((r) => frame.contentWindow.__LPC_ON_MSG(payload, null, r));
            } else {
              res = { ok: false, error: 'no tab bridge' };
            }
          }
        } else if (msg.type === 'LPC_BACKEND_URL') {
          res = { ok: true, url: 'http://127.0.0.1:8787' };
        }
        if (typeof cb === 'function') cb(res);
        resolve(res);
      });
    },
    onMessage: {
      _listeners: [],
      addListener(fn) { this._listeners.push(fn); },
      dispatch(msg) { this._listeners.forEach((fn) => fn(msg)); }
    }
  }
};
`;

const shellHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Live Page Co-Pilot Harness</title>
  <style>
    html, body { margin:0; height:100%; overflow:hidden; font-family: system-ui, sans-serif; }
    .layout { display:grid; grid-template-columns: 1fr 380px; height:100vh; }
    iframe { border:0; width:100%; height:100%; }
    #panelWrap { border-left:1px solid #ccc; background:#f3eee6; }
  </style>
</head>
<body>
  <div class="layout">
    <iframe id="demoFrame" src="/demo/"></iframe>
    <div id="panelWrap"><iframe id="panelFrame" src="/sidepanel/sidepanel.html"></iframe></div>
  </div>
  <script>
    ${mockChrome}
    // Bridge snapshots from demo → panel
    window.addEventListener('message', (ev) => {
      if (ev.data?.type === 'LPC_SNAPSHOT') {
        const panel = document.getElementById('panelFrame');
        panel.contentWindow?.chrome?.runtime?.onMessage?.dispatch({
          type: 'LPC_SNAPSHOT',
          snapshot: ev.data.snapshot,
          tabId: 1
        });
      }
    });
  </script>
</body>
</html>`;

function injectIntoDemo(html) {
  const bridge = `
<script>
window.chrome = {
  runtime: {
    sendMessage(msg) {
      window.parent.postMessage(msg, '*');
      return Promise.resolve({ ok: true });
    },
    onMessage: {
      addListener(fn) { window.__LPC_ON_MSG = fn; }
    }
  }
};
</script>
<script src="/content/content.js"></script>
<link rel="stylesheet" href="/content/content.css" />
`;
  return html.replace("</body>", `${bridge}</body>`);
}

function injectIntoPanel(html) {
  return html.replace(
    "<script src=\"sidepanel.js\"></script>",
    `<script>${mockChrome}
// Prefer parent demo frame for LPC_TO_TAB
const _orig = chrome.runtime.sendMessage.bind(chrome.runtime);
chrome.runtime.sendMessage = function(msg, cb) {
  if (msg.type === 'LPC_TO_TAB') {
    const demo = parent.document.getElementById('demoFrame');
    const p = new Promise((resolve) => {
      if (demo?.contentWindow?.__LPC_ON_MSG) {
        demo.contentWindow.__LPC_ON_MSG(msg.payload, null, (res) => resolve(res || { ok: true }));
      } else resolve({ ok: false, error: 'no demo' });
    });
    if (cb) p.then(cb);
    return p;
  }
  if (msg.type === 'LPC_ACTIVE_TAB') {
    const res = { ok: true, tab: { id: 1, url: 'http://127.0.0.1:4175/demo/', title: 'demo' } };
    if (cb) cb(res);
    return Promise.resolve(res);
  }
  return _orig(msg, cb);
};
</script>
<script src="sidepanel.js"></script>`
  );
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/" || url === "/harness") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(shellHtml);
    return;
  }
  if (url === "/demo" || url === "/demo/") {
    const html = fs.readFileSync(path.join(root, "demo/index.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(injectIntoDemo(html));
    return;
  }
  if (url.startsWith("/sidepanel/")) {
    const file = path.join(root, "extension", url);
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    let body = fs.readFileSync(file);
    if (url.endsWith(".html")) body = Buffer.from(injectIntoPanel(body.toString("utf8")));
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "text/plain" });
    res.end(body);
    return;
  }
  if (url.startsWith("/content/")) {
    const file = path.join(root, "extension", url);
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "text/plain" });
    res.end(fs.readFileSync(file));
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Harness http://127.0.0.1:${port}/`);
});
