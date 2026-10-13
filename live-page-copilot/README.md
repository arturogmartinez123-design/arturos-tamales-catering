# Live Page Co-Pilot (MVP)

Chrome Manifest V3 extension + local Fastify backend that reads the page you are viewing, streams **copy-review** feedback into a side panel, answers chat about the page, and runs navigation commands (`scroll to…`, `click…`) with preview and confirmation for destructive actions.

Architecture notes (Project store): see your Project `docs/architecture.md`.

## Requirements

- Node.js 20+
- Google Chrome (or Chromium) with MV3 side panel support

## 1. Backend

```bash
cd live-page-copilot/backend
cp .env.example .env
npm install
npm run dev
```

Server listens on `http://127.0.0.1:8787` (binds `0.0.0.0:$PORT`).

| Env | Purpose |
|-----|---------|
| `OPENAI_API_KEY` | Optional. If empty, a deterministic **mock LLM** streams copy feedback + chat. |
| `OPENAI_BASE_URL` | OpenAI-compatible base URL (default `https://api.openai.com/v1`) |
| `OPENAI_MODEL` | Model id (default `gpt-4o-mini`) |
| `PORT` | Default `8787` |

Health check: `curl http://127.0.0.1:8787/health`

## 2. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `live-page-copilot/extension`
4. Open any http(s) page (try the included demo: serve `demo/index.html`)
5. Click the extension icon to open the **side panel**

## 3. Demo page (optional)

```bash
cd live-page-copilot
python3 -m http.server 4174 --directory demo
# open http://127.0.0.1:4174
```

## 4. UI harness (optional, no Chrome developer mode)

If you cannot load an unpacked extension (some locked-down Chrome builds), run the harness which injects the content script into the demo page and hosts the side panel UI against the same backend:

```bash
# backend already on :8787
cd live-page-copilot
node scripts/harness-server.mjs
# open http://127.0.0.1:4175/
```

## How to use

- **Copy review** — streams clarity / tone / grammar / CTA notes (~1–2s after page changes). Click an item to scroll + highlight the element.
- **UX / Learning** — UI stubs in MVP.
- **Pause** — stops content-script capture and outbound snapshots.
- **Navigate** — e.g. `scroll to Pricing`, `click Order now`. Review the plan, then **Run**. Submit/buy/send/delete require **Confirm & run**.
- **Chat** — ask about the page; replies stream over SSE.

## Safety

- Password / payment-like fields are never read or sent.
- No auto-submit or purchase without confirmation.
- API keys stay in backend `.env` only — never in the extension.

## Project layout

```
live-page-copilot/
├── README.md
├── demo/index.html
├── extension/          # Load unpacked
└── backend/            # Fastify + SSE
```

## Next steps

Voice input, Klaviyo/email preview, saved history, richer UX/Learning modes — see Project `docs/next-steps.md`.
