/* Streaming client for the Gardening Advisor agent.
   Works in the browser and in Node 18+ (global fetch + web streams).
   Consumes SSE frames: `data: {"text": "..."}` ... `data: [DONE]`.
   Mirrors the copy inlined in src/VerdantDashboard.jsx so it can be unit-tested. */
export async function streamChat({ url, messages, system, model, maxTokens, temperature, topP, onText, signal }) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system, model, max_tokens: maxTokens, temperature, top_p: topP }),
    signal,
  });
  if (!res.ok) throw new Error(`Agent HTTP ${res.status}`);
  if (!res.body) throw new Error("No response stream from agent");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      if (!payload) continue;
      let obj;
      try { obj = JSON.parse(payload); } catch { continue; }
      if (obj.error) throw new Error(obj.error);
      if (obj.text) onText(obj.text);
    }
  }
}

/* Build the agent request body from the dashboard's published "active" prompt. */
export function buildRequest(activePrompt, messages) {
  const realModel = (m) => (typeof m === "string" && /\d{8}$/.test(m)) ? m : undefined;
  return {
    messages,
    system: activePrompt?.body || undefined,
    model: realModel(activePrompt?.model),
    max_tokens: activePrompt?.maxTokens,
    temperature: activePrompt?.temp,
    top_p: activePrompt?.topP,
  };
}
