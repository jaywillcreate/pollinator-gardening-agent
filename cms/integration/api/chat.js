import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Fallback system prompt (used only when the dashboard doesn't send one).
const DEFAULT_SYSTEM = "You are a knowledgeable and enthusiastic pollinator gardening advisor. Prioritize region-native plants, continuous bloom succession, and pollinator habitat. Keep responses well-organized.";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const VALID_MODEL = /^claude-[a-z0-9.\-]+$/i;

export default async function handler(req, res) {
  // CORS — allow the dashboard's origin (set ALLOWED_ORIGIN in production).
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // The dashboard's Prompt Studio drives these; each is optional and falls back.
  const { messages, system, model, max_tokens, temperature, top_p, thinking } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const useThinking = thinking !== false; // on by default, as in the original agent
  const params = {
    model: (typeof model === "string" && VALID_MODEL.test(model)) ? model : DEFAULT_MODEL,
    max_tokens: Number.isFinite(max_tokens) ? Math.min(Math.max(max_tokens, 256), 64000) : 64000,
    system: (typeof system === "string" && system.trim()) ? system : DEFAULT_SYSTEM,
    messages,
  };
  if (useThinking) {
    // Extended thinking requires default sampling; don't send temperature/top_p.
    params.thinking = { type: "enabled", budget_tokens: 10000 };
  } else {
    if (Number.isFinite(temperature)) params.temperature = temperature;
    if (Number.isFinite(top_p)) params.top_p = top_p;
  }

  try {
    const stream = client.messages.stream(params);
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      res.write(`data: ${JSON.stringify({ error: "Rate limited. Please wait a moment and try again." })}\n\n`);
    } else if (error instanceof Anthropic.AuthenticationError) {
      res.write(`data: ${JSON.stringify({ error: "API key is invalid. Check your ANTHROPIC_API_KEY." })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ error: "Something went wrong. Please try again." })}\n\n`);
    }
    res.end();
  }
}
