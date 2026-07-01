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
const { default: express } = await import("express");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Public chatbot — the front door. Any visitor hitting / gets the advisor.
app.use(express.static(join(__dirname, "public")));

// Admin dashboard — the Verdant CMS, served from its production build at /admin.
// Build it with `npm --prefix cms run build`; the compiled bundle lives at
// cms/dist/ with asset URLs prefixed by /admin/ (set via vite.config.js base).
// Falls through gracefully if the build hasn't been created yet — hitting
// /admin without a build returns a small hint instead of a 500.
const cmsDist = join(__dirname, "cms", "dist");
if (existsSync(cmsDist)) {
  app.use("/admin", express.static(cmsDist));
  // SPA fallback so a page reload on /admin/anything still boots the CMS.
  app.get("/admin/*", (_req, res) => res.sendFile(join(cmsDist, "index.html")));
} else {
  app.get("/admin*", (_req, res) => res.status(503).type("text/plain").send(
    "The Verdant CMS bundle hasn't been built yet.\n\n" +
    "Run: npm --prefix cms run build\n" +
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

app.listen(port, () => {
  console.log(`Pollinator Garden Chat running at http://localhost:${port}`);
  if (existsSync(cmsDist)) console.log(`Verdant CMS admin at http://localhost:${port}/admin`);
});
