import { readFileSync } from "fs";
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
app.use(express.static(join(__dirname, "public")));

// Proxy to the Vercel-style serverless function
app.post("/api/chat", (req, res) => handler(req, res));

app.listen(port, () => {
  console.log(`Pollinator Garden Chat running at http://localhost:${port}`);
});
