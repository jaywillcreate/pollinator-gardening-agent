/* A tiny mock of the Gardening Advisor agent that mirrors the real SSE contract:
   POST { messages, system, ... } -> `data: {"text": "..."}` frames -> `data: [DONE]`.
   It echoes whether it received a system prompt so the config bridge can be verified. */
import http from "node:http";

export function startMock(port = 0) {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch {}
      const sawSystem = typeof parsed.system === "string" && parsed.system.length > 0;
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      const chunks = [
        "Great question! ", "For monarchs in your region, ",
        "plant **milkweed** (Asclepias) and coneflower.",
        sawSystem ? " [system-prompt-received]" : " [NO-system]",
      ];
      let i = 0;
      const iv = setInterval(() => {
        if (i < chunks.length) res.write(`data: ${JSON.stringify({ text: chunks[i++] })}\n\n`);
        else { clearInterval(iv); res.write("data: [DONE]\n\n"); res.end(); }
      }, 8);
    });
  });
  return new Promise((r) => server.listen(port, () => r({ server, port: server.address().port })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMock(3999).then(({ port }) => console.log("mock agent listening on", port));
}
