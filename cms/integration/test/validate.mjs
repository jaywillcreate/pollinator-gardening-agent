/* Validates the dashboard <-> agent integration against a mock of the real
   contract. Proves: (1) SSE streaming reconstructs correctly, (2) the published
   prompt is forwarded as `system`, (3) placeholder model ids are dropped so the
   agent uses its own valid default, (4) agent errors surface to the client. */
import assert from "node:assert";
import { startMock } from "./mock-agent.mjs";
import { streamChat, buildRequest } from "../agentClient.js";

const activePrompt = {
  name: "Default Advisor",
  body: "You are the Gardening Advisor. Ground answers in the regional planting guides.",
  model: "claude-opus-4-8",   // dashboard placeholder id
  temp: 0.4, topP: 0.9, maxTokens: 1024,
};

async function main() {
  const { server, port } = await startMock(0);
  const url = `http://127.0.0.1:${port}/`;
  const messages = [{ role: "user", content: "What should I plant for monarchs in Ohio?" }];

  // (2)(3) config bridge
  const wire = buildRequest(activePrompt, messages);
  assert.equal(wire.system, activePrompt.body, "system prompt must be forwarded");
  assert.equal(wire.model, undefined, "placeholder model id must be dropped");
  assert.equal(wire.max_tokens, 1024, "max_tokens must pass through");
  console.log("  [1/4] config bridge: system forwarded, placeholder model dropped, params passed  \u2713");

  // (1) streaming reconstruction
  let out = "";
  await streamChat({
    url, messages: wire.messages, system: wire.system, model: wire.model,
    maxTokens: wire.max_tokens, temperature: wire.temperature, topP: wire.top_p,
    onText: (t) => (out += t),
  });
  console.log("  streamed reply:", JSON.stringify(out));
  assert.ok(out.includes("milkweed"), "streamed text should reconstruct");
  assert.ok(out.includes("[system-prompt-received]"), "agent must have received the system prompt");
  console.log("  [2/4] SSE streaming reconstructed from data: frames + [DONE]                     \u2713");

  // (4) error propagation from an error frame
  const errServer = (await import("node:http")).createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ error: "Rate limited. Please wait a moment and try again." })}\n\n`);
    res.end();
  });
  await new Promise((r) => errServer.listen(0, r));
  const errUrl = `http://127.0.0.1:${errServer.address().port}/`;
  let caught = null;
  try { await streamChat({ url: errUrl, messages, onText: () => {} }); }
  catch (e) { caught = e.message; }
  assert.ok(caught && caught.includes("Rate limited"), "agent error frame should surface to the client");
  console.log("  [3/4] agent error frames surface to the client                                    \u2713");

  // HTTP failure
  let httpErr = null;
  try { await streamChat({ url: "http://127.0.0.1:1/", messages, onText: () => {} }); }
  catch (e) { httpErr = e.message; }
  assert.ok(httpErr, "network/HTTP failure should throw");
  console.log("  [4/4] transport failures throw and can be shown in the UI                          \u2713");

  server.close(); errServer.close();
}

main()
  .then(() => { console.log("\nINTEGRATION VALIDATION PASSED \u2705\n"); process.exit(0); })
  .catch((e) => { console.error("\nINTEGRATION VALIDATION FAILED \u274c\n", e); process.exit(1); });
