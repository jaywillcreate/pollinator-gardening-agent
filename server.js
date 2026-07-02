import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env for local development (before importing api handler)
try {
  const envFile = readFileSync(join(__dirname, ".env"), "utf-8");
  envFile.split("\n").forEach((line) => {
    const [key, ...val] = line.split("=");
    if (key && val.length) process.env[key.trim()] = val.join("=").trim();
  });
} catch {}

// Dynamic import after env is loaded
const { default: handler } = await import("./api/chat.js");
const { default: feedbackHandler } = await import("./api/feedback.js");
const { default: express } = await import("express");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Public chatbot lives at / (public/index.html). The Verdant CMS builds into
// public/admin/ (see cms/vite.config.js), so a single static handler serves
// both — no separate mount needed. This mirrors what Vercel does: everything
// in public/ becomes a static asset at the same URL, and the CMS ends up at
// /admin with asset paths prefixed via Vite's base config.
app.use(express.static(join(__dirname, "public")));

// SPA fallback so `/admin/anything` still boots the CMS. The check keeps the
// old "not yet built" hint for developers who haven't run the CMS build yet.
const adminIndex = join(__dirname, "public", "admin", "index.html");
if (existsSync(adminIndex)) {
  app.get("/admin/*", (_req, res) => res.sendFile(adminIndex));
} else {
  app.get("/admin*", (_req, res) => res.status(503).type("text/plain").send(
    "The Verdant CMS bundle hasn't been built yet.\n\n" +
    "Run: npm run build\n" +
    "Then reload this page."
  ));
}

// Streaming SSE endpoint — shared by both the public chatbot (which sends
// {messages:[...]} and picks up the built-in system prompt) and the CMS's
// Live Bot Preview (which additionally sends system/model/sampling overrides).
// Register OPTIONS too so the handler's CORS preflight runs; without it
// Express answers OPTIONS on its own with no Access-Control-Allow-Origin.
app.post("/api/chat", (req, res) => handler(req, res));
app.options("/api/chat", (req, res) => handler(req, res));

// Thumbs-up/down feedback ingest (see api/feedback.js).
app.post("/api/feedback", (req, res) => feedbackHandler(req, res));
app.options("/api/feedback", (req, res) => feedbackHandler(req, res));

app.listen(port, () => {
  console.log(`Pollinator Garden Chat running at http://localhost:${port}`);
  if (existsSync(adminIndex)) console.log(`Verdant CMS admin at http://localhost:${port}/admin`);
});
