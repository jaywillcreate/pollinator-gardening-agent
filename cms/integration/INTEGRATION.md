# Connecting the dashboard to the Pollinator Gardening Agent

This folder wires the **Verdant dashboard** to the **pollinator-gardening-agent**
(the streaming Anthropic-backed chat endpoint). It contains:

- `api/chat.js` — a drop-in replacement for the agent's handler that additionally
  accepts the dashboard's published prompt/config and adds CORS.
- `agentClient.js` — the browser/Node streaming client (`streamChat`) and
  `buildRequest`, mirroring the copy inlined in `src/VerdantDashboard.jsx`.
- `test/` — a mock agent + a validation script that proves the wiring.

## The contract

**Request** — `POST <VITE_AGENT_URL>`
```json
{
  "messages":    [{ "role": "user", "content": "What should I plant for monarchs in Ohio?" }],
  "system":      "…the dashboard's published (active) prompt…",
  "model":       "claude-sonnet-4-20250514",   // optional
  "max_tokens":  1024,                          // optional
  "temperature": 0.4,                           // optional (ignored while thinking is on)
  "top_p":       0.9                            // optional (ignored while thinking is on)
}
```

**Response** — `text/event-stream`
```
data: {"text":"Great question! "}
data: {"text":"For monarchs, plant milkweed…"}
data: [DONE]
```
Errors arrive as `data: {"error":"…"}` and are surfaced in the chat bubble.

## How the dashboard drives the agent

- The **active prompt** in Prompt Studio becomes the agent's `system` prompt.
- Its **model / temperature / top-p / max tokens** are sent as request params.
  The dashboard's demo model labels (e.g. `claude-opus-4-8`) are placeholders and
  are intentionally *not* forwarded — only a real dated id (`…-YYYYMMDD`) is — so
  the agent falls back to its own valid default (`claude-sonnet-4-20250514`).
- The live preview streams the reply token-by-token into the chat bubble and
  renders Markdown (including the agent's ```svg garden diagrams as text for now).

## Setup

1. **Agent side** — replace your `api/chat.js` with `integration/api/chat.js`
   (it keeps your original behavior when no overrides are sent) and set:
   ```
   ANTHROPIC_API_KEY=sk-ant-…
   ALLOWED_ORIGIN=https://<your-dashboard-domain>   # or * for local dev
   ```
2. **Dashboard side** — copy `.env.example` to `.env` and set the endpoint:
   ```
   VITE_AGENT_URL=https://pollinator-gardening-agent.vercel.app/api/chat
   ```
   Then `npm run dev`. The preview header shows **● Live agent** when connected,
   **○ Demo replies** when `VITE_AGENT_URL` is unset.

## Validate the wiring

```
node integration/test/validate.mjs
```
This starts a mock that mirrors the SSE contract and asserts: streaming
reconstruction, the system prompt is forwarded, placeholder model ids are
dropped, and agent/transport errors surface to the client.

## Notes & limits

- **CORS**: cross-origin browser calls require the agent to send the headers in
  `api/chat.js`. Lock `ALLOWED_ORIGIN` to your dashboard domain in production.
- **Extended thinking** and `temperature`/`top_p` can't be combined; while
  thinking is enabled the handler ignores those two params by design.
- The dashboard never holds the `ANTHROPIC_API_KEY`; it lives only on the agent.
- SVG diagrams returned by the agent currently render as text in the preview;
  rendering them inline is a small follow-up in `BotPreview`.
