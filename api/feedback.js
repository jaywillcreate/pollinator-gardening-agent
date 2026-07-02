/**
 * Feedback endpoint — best-effort ingest of thumbs-up/down votes on chatbot
 * responses. The client (public/app.js → reportFeedback) already persists the
 * vote to localStorage the moment it's cast; this endpoint is the aggregation
 * hook for whatever backend the deployment chooses to plug in.
 *
 * Payload shape (JSON):
 *   { vote: "up" | "down",
 *     responseHash: "r<base36-djb2>",
 *     responseLength: number,
 *     userName: string | null,
 *     userRole: string | null,
 *     ts: ISO string }
 *
 * On Vercel serverless the filesystem is read-only, so we intentionally do
 * not attempt to write a JSON file here — that path only makes sense for a
 * self-hosted deploy. To wire real persistence, replace the `console.log`
 * with a call to Postgres / Supabase / Vercel KV / etc. Nothing about the
 * chatbot UI needs to change.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { vote, responseHash, responseLength, userName, userRole, ts } = req.body || {};
  if (vote !== "up" && vote !== "down") return res.status(400).json({ error: "vote must be 'up' or 'down'" });
  if (typeof responseHash !== "string" || !responseHash) return res.status(400).json({ error: "responseHash required" });

  // TODO — swap the log for a real durable store when a DB is available.
  // Kept as structured JSON so a log-drain (e.g. Vercel → Datadog / Axiom)
  // captures the vote stream verbatim.
  console.log("[feedback]", JSON.stringify({ vote, responseHash, responseLength, userName, userRole, ts }));

  return res.status(200).json({ ok: true });
}
