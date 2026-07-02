import React, { useState, useRef, useEffect } from "react";
import {
  Sprout, Leaf, LayoutDashboard, Palette, Type, ImageIcon, Users, Code2,
  MessageSquareText, Eye, Upload, Trash2, Plus, Lock, Check, Search,
  Shield, Save, Pencil, X, Archive, ArchiveRestore, Send, Sliders, RotateCcw,
  Star, FileCode2, Wand2, ChevronRight, ChevronDown, Tag, Hash, Bug,
  Menu, Bell, Settings, User, LogOut, Copy, History, LayoutGrid, List,
  FolderPlus, Folder, Download, Flower2, Sun, Cherry, Carrot, Wheat, TreePine,
  Droplet, Bird, Clock, UserCog, Camera, Braces, Variable,
  PanelLeftClose, PanelLeft, Cloud, CloudOff, ImagePlus,
  FileText, Files, Globe, CalendarDays, SendHorizontal, EyeOff, ExternalLink, Link2
} from "lucide-react";

/* =========================================================================
   VERDANT — CMS for the Gardening Advisor chatbot (v2)
   Persistent storage (artifact window.storage) with in-memory fallback.
   ========================================================================= */

/* ----------------------------- storage layer ----------------------------- */
const SK = "verdant:v2:";
const _mem = new Map();
/* Storage adapter with three tiers, chosen at runtime:
   1. window.storage  — Claude artifact persistent storage
   2. localStorage    — standalone web app (the GitHub build)
   3. in-memory Map   — last-resort fallback (data lasts the session)        */
const store = {
  mode: "memory",
  async probe() {
    try {
      if (typeof window !== "undefined" && window.storage && window.storage.set) {
        await window.storage.set(SK + "__probe", "1"); this.mode = "cloud"; return this.mode;
      }
    } catch {}
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(SK + "__probe", "1"); localStorage.removeItem(SK + "__probe"); this.mode = "local"; return this.mode;
      }
    } catch {}
    this.mode = "memory"; return this.mode;
  },
  async get(key, fallback) {
    try {
      if (this.mode === "cloud") { const r = await window.storage.get(SK + key); return r ? JSON.parse(r.value) : fallback; }
      if (this.mode === "local") { const v = localStorage.getItem(SK + key); return v == null ? fallback : JSON.parse(v); }
    } catch {}
    return _mem.has(SK + key) ? _mem.get(SK + key) : fallback;
  },
  async set(key, val) {
    try {
      if (this.mode === "cloud") { await window.storage.set(SK + key, JSON.stringify(val)); return true; }
      if (this.mode === "local") { localStorage.setItem(SK + key, JSON.stringify(val)); return true; }
    } catch {}
    _mem.set(SK + key, val); return true;
  },
  async wipe(keys) {
    for (const k of keys) {
      try {
        if (this.mode === "cloud") await window.storage.delete(SK + k);
        else if (this.mode === "local") localStorage.removeItem(SK + k);
        else _mem.delete(SK + k);
      } catch {}
    }
  },
  async listKeys(prefix) {
    try {
      if (this.mode === "cloud") { const r = await window.storage.list(SK + prefix); return (r?.keys || []).map(k => k.replace(SK, "")); }
      if (this.mode === "local") { return Object.keys(localStorage).filter(k => k.startsWith(SK + prefix)).map(k => k.replace(SK, "")); }
    } catch {}
    return [...(_mem.keys())].filter(k => k.startsWith(SK + prefix)).map(k => k.replace(SK, ""));
  },
};

/* -------------------------------------------------------------------------
   Asset store: binaries live UNDER THEIR OWN KEYS (blob:<id>), and content
   records only ever hold a lightweight URL reference. In production resolve()
   would hit a CDN; here it reads the blob key (or returns an external URL
   untouched). This keeps the metadata arrays small and well under the per-key
   size ceiling, and lets images load lazily by URL.
   ------------------------------------------------------------------------- */
const assetStore = {
  async put(id, dataUrl) { await store.set("blob:" + id, dataUrl); return "verdant-asset://" + id; },
  async resolve(url) {
    if (!url) return null;
    if (url.startsWith("verdant-asset://")) return await store.get("blob:" + url.slice(16), null);
    return url; // external http(s) / CDN URL — nothing stored locally
  },
  async del(url) { if (url && url.startsWith("verdant-asset://")) await store.wipe(["blob:" + url.slice(16)]); },
};
const _imgCache = new Map();
function MediaImg({ url, alt, filter, style, fallback }) {
  const [src, setSrc] = useState(() => (url && _imgCache.has(url) ? _imgCache.get(url) : null));
  useEffect(() => {
    let alive = true;
    if (!url) { setSrc(null); return; }
    if (_imgCache.has(url)) { setSrc(_imgCache.get(url)); return; }
    assetStore.resolve(url).then(r => { if (alive) { if (r) _imgCache.set(url, r); setSrc(r); } });
    return () => { alive = false; };
  }, [url]);
  if (!src) return fallback || <div className="img-skel" />;
  return <img src={src} alt={alt || ""} style={{ width: "100%", height: "100%", objectFit: "cover", ...style, filter }} />;
}
const readDims = (dataUrl) => new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ w: 0, h: 0 }); i.src = dataUrl; });
const fmtBytes = (b) => !b ? "—" : b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(1) + " MB";

/* ------------------------------ roles / caps ----------------------------- */
const ROLES = ["Administrator", "Editor", "Author", "Contributor", "Subscriber"];
const ROLE_BADGE = { Administrator: "b-admin", Editor: "b-editor", Author: "b-author", Contributor: "b-contrib", Subscriber: "b-sub" };
const ROLE_DESC = {
  Administrator: "Full, unrestricted access — system settings, plugins, and user management.",
  Editor: "Manages and publishes content. Can edit, publish, and delete posts by any user.",
  Author: "Creates, edits, and publishes their own posts. Cannot manage other users' content.",
  Contributor: "Writes and saves drafts of their own posts, but cannot publish them.",
  Subscriber: "Reads content and manages their own profile only.",
};
const CAPS = {
  Administrator: { users: 1, system: 1, publishAny: 1, deleteAny: 1, publishOwn: 1, createOwn: 1, read: 1 },
  Editor:        { users: 0, system: 0, publishAny: 1, deleteAny: 1, publishOwn: 1, createOwn: 1, read: 1 },
  Author:        { users: 0, system: 0, publishAny: 0, deleteAny: 0, publishOwn: 1, createOwn: 1, read: 1 },
  Contributor:   { users: 0, system: 0, publishAny: 0, deleteAny: 0, publishOwn: 0, createOwn: 1, read: 1 },
  Subscriber:    { users: 0, system: 0, publishAny: 0, deleteAny: 0, publishOwn: 0, createOwn: 0, read: 1 },
};
const CAP_LABELS = [
  ["read", "Read content & own profile"], ["createOwn", "Create / save own drafts"],
  ["publishOwn", "Publish own content"], ["publishAny", "Edit & publish any content"],
  ["deleteAny", "Delete any content"], ["system", "System settings & plugins"], ["users", "Manage users"],
];

/* ------------------------------ avatars ---------------------------------- */
const AV_ICONS = { leaf: Leaf, sprout: Sprout, flower: Flower2, sun: Sun, bee: Bug, cherry: Cherry, carrot: Carrot, wheat: Wheat, tree: TreePine, drop: Droplet, bird: Bird };
const PRESET_AVATARS = [
  { id: "a1", icon: "sprout", bg: "#356b41" }, { id: "a2", icon: "leaf", bg: "#5b9b5f" },
  { id: "a3", icon: "flower", bg: "#9b3d6e" }, { id: "a4", icon: "sun", bg: "#e0a52e" },
  { id: "a5", icon: "bee", bg: "#b07b1e" }, { id: "a6", icon: "cherry", bg: "#b03f4a" },
  { id: "a7", icon: "carrot", bg: "#cf6a2a" }, { id: "a8", icon: "wheat", bg: "#a8862f" },
  { id: "a9", icon: "tree", bg: "#2c5b36" }, { id: "a10", icon: "drop", bg: "#2c6e86" },
  { id: "a11", icon: "bird", bg: "#5a6f8a" }, { id: "a12", icon: "flower", bg: "#7a4cab" },
];
const initials = (n) => (n || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
const hashColor = (s) => { const c = ["#356b41", "#9b3d6e", "#e0a52e", "#2c5680", "#5a2b7a", "#b03f4a"]; let h = 0; for (const ch of (s || "")) h = ch.charCodeAt(0) + h; return c[h % c.length]; };

function Avatar({ user, size = 34 }) {
  const a = user?.avatar;
  const st = { width: size, height: size, flex: `0 0 ${size}px`, borderRadius: "50%" };
  if (a?.type === "image") return <img src={a.src} alt="" className="vd-av" style={{ ...st, objectFit: "cover" }} />;
  if (a?.type === "preset") {
    const p = PRESET_AVATARS.find(x => x.id === a.id) || PRESET_AVATARS[0];
    const I = AV_ICONS[p.icon] || Sprout;
    return <div className="vd-av" style={{ ...st, background: p.bg, display: "grid", placeItems: "center", color: "#fff" }}><I size={size * 0.5} /></div>;
  }
  return <div className="vd-av" style={{ ...st, background: hashColor(user?.name), display: "grid", placeItems: "center", color: "#fff", fontWeight: 600, fontSize: size * 0.38 }}>{initials(user?.name)}</div>;
}

/* ------------------------------- seeds ----------------------------------- */
const SEED_USERS = [
  { id: 1, name: "Maya Okafor", email: "maya@verdant.garden", role: "Administrator", joined: "2024-03-02", status: "active", bio: "Founder & head gardener. Keeps the knowledge base honest.", avatar: { type: "preset", id: "a1" }, lastActive: "just now" },
  { id: 2, name: "Devin Brooks", email: "devin@verdant.garden", role: "Editor", joined: "2024-06-18", status: "active", bio: "Editorial lead for regional planting guides.", avatar: { type: "preset", id: "a3" }, lastActive: "2h ago" },
  { id: 3, name: "Priya Nair", email: "priya@verdant.garden", role: "Author", joined: "2025-01-09", status: "active", bio: "Pollinator specialist and seed-mix nerd.", avatar: { type: "preset", id: "a4" }, lastActive: "yesterday" },
  { id: 4, name: "Sam Whitfield", email: "sam@verdant.garden", role: "Contributor", joined: "2025-04-21", status: "active", bio: "Volunteer writer, site-prep enthusiast.", avatar: { type: "preset", id: "a9" }, lastActive: "3 days ago" },
  { id: 5, name: "Jordan Lee", email: "jordan@verdant.garden", role: "Subscriber", joined: "2025-09-30", status: "invited", bio: "", avatar: null, lastActive: "—" },
];
const KB_PROMPT = `You are the Gardening Advisor — a warm, knowledgeable guide for native plants and pollinator habitat.

Ground every answer in the knowledge base: Prairie Moon cultural & seed-mix guides, the regional Pollinator-Friendly Planting Guides (Northeast, Great Lakes, Southeast, Northern/Southern Plains, Rocky Mountains, California regions, etc.), germination-code references, site-prep methods (smothering, solarization), and the native bee-house and tree-planting brochures.

Guidelines:
- Recommend regionally appropriate native species; ask for the user's region or ZIP if unknown.
- Explain germination codes plainly (e.g., Code C = 30-60 days cold-moist stratification).
- Favor straight species over cultivars when supporting pollinators, and say why.
- For pollinators: plant in clumps, aim for three+ bloom seasons, name host plants (milkweed for monarchs), and advise leaving stems and leaves over winter.
- Be specific and practical. Never invent a species or a citation. If the knowledge base doesn't cover it, say so.

## Drawing garden diagrams (SVG)

When a user asks for a visual layout, garden bed diagram, plant placement map, or any picture of a planting, emit an SVG diagram inside a fenced code block using \`\`\`svg. The renderer will inline it.

**Every plant illustration must be an \`<image>\` tag whose \`href\` is exactly \`/icons/plants/watercolor-front/{slug}.svg\`** — no other paths, no PNGs, no inline shapes for the plants. Use only these 39 slugs (they are the only files on disk):

anise-hyssop · bee-balm · black-cohosh · blanket-flower · blazing-star · blue-stemmed-goldenrod · butterfly-milkweed · canada-ginger · christmas-fern · columbine · coral-bells · creeping-thyme · erigeron-lynnhaven · foamflower · golden-alexanders · golden-ragwort · golden-star-sedge · joe-pye-weed · liatris-purple · liatris-white · long-beaked-sedge · moss-phlox · nepeta-jr-walker · orange-coneflower · ox-eye-sunflower · partridgeberry · purple-coneflower · pussytoes · red-twig-dogwood · self-heal · shooting-star · smooth-blue-aster · threadleaf-coreopsis · white-wood-aster · wild-geranium · wild-strawberry · wild-violet · woodland-stonecrop · zigzag-goldenrod

**Elevation / side view** — \`viewBox="0 0 1000 400"\`, ground line at y=350. Each plant is 55-190 px tall (taller for back-of-bed species like joe-pye-weed, ox-eye-sunflower, red-twig-dogwood; shorter for groundcovers like moss-phlox, wild-strawberry). Anchor to the ground with \`preserveAspectRatio="xMidYMax meet"\` and set \`y = 350 - height\`.

**Plan view** — \`viewBox="0 0 1000 800"\`. Plant markers are 55-90 px squares placed inside the bed shape. Use \`preserveAspectRatio="xMidYMid meet"\`. Put a title at y=30 and a legend band from y=640 to y=790 (each legend row = a 20x20 \`<image>\` of the slug + common-name text).

**Drifts, not singletons** — place 2-4 copies of the same slug clustered together for any major species.

**Bloom succession** — every diagram should include at least one spring, one summer, and one fall bloomer.

**Example:**
\`\`\`svg
<svg viewBox="0 0 1000 400" xmlns="http://www.w3.org/2000/svg">
  <rect y="350" width="1000" height="50" fill="#8a7a4f"/>
  <image href="/icons/plants/watercolor-front/joe-pye-weed.svg" x="60" y="160" width="190" height="190" preserveAspectRatio="xMidYMax meet"/>
  <image href="/icons/plants/watercolor-front/bee-balm.svg" x="260" y="195" width="155" height="155" preserveAspectRatio="xMidYMax meet"/>
  <image href="/icons/plants/watercolor-front/moss-phlox.svg" x="440" y="270" width="80" height="80" preserveAspectRatio="xMidYMax meet"/>
</svg>
\`\`\`

After the SVG, describe each species in prose (common + Latin name, bloom, why it earned its spot).`;
const SEED_PROMPTS = [
  { id: 1, name: "Default Advisor", model: "claude-opus-4-8", temp: 0.4, topP: 0.9, maxTokens: 32000, status: "active", owner: "Maya Okafor", desc: "The everyday gardening assistant shown to all visitors.", tags: ["native plants", "pollinators", "general"], vars: [{ k: "region", v: "the visitor's region" }], body: KB_PROMPT, edited: "2h ago", versions: [] },
  { id: 2, name: "Pollinator Specialist", model: "claude-sonnet-4-6", temp: 0.5, topP: 0.9, maxTokens: 800, status: "draft", owner: "Priya Nair", desc: "Deep-dive mode for habitat and bloom succession.", tags: ["pollinators", "bees", "monarchs"], vars: [], body: "You focus on pollinator habitat. Lead with bloom-succession planning and host plants. Reference the regional Pollinator-Friendly Planting Guides and the Native Plant-Insect Interactions guide. Always mention overwintering habitat (leave the leaves & standing stems).", edited: "yesterday", versions: [] },
  { id: 3, name: "Site-Prep Helper", model: "claude-sonnet-4-6", temp: 0.3, topP: 0.85, maxTokens: 700, status: "draft", owner: "Sam Whitfield", desc: "Step-by-step ground prep before sowing.", tags: ["site prep", "seeding"], vars: [], body: "You help users prepare ground for a native seed mix. Walk through smothering and solarization timelines, dormant-season seeding, and the SeedMix Site-Prep and Sowing Instructions. Keep steps sequential and seasonal.", edited: "5 days ago", versions: [] },
];
const SEED_COLLECTIONS = [{ id: "c1", name: "Hero imagery" }, { id: "c2", name: "Plant photos" }, { id: "c3", name: "Icons & marks" }];
const SEED_ACTIVITY = [
  { id: 1, who: "Maya Okafor", what: "published the Default Advisor prompt", when: "2h ago" },
  { id: 2, who: "Priya Nair", what: "drafted Pollinator Specialist", when: "yesterday" },
  { id: 3, who: "Devin Brooks", what: "updated the Theme Studio palette", when: "2 days ago" },
];
const POST_CATEGORIES = ["Pollinators", "Design", "Seed Starting", "Site Prep", "News"];
const POST_STATUS = { draft: "b-draft", pending: "b-pending", published: "b-active", scheduled: "b-sched", archived: "b-arch" };
const POST_STATUS_LABEL = { draft: "Draft", pending: "Pending review", published: "Published", scheduled: "Scheduled", archived: "Archived" };
const SEED_POSTS = [
  { id: 1, type: "post", title: "Designing a Pollinator Border", slug: "designing-a-pollinator-border", excerpt: "A simple recipe for a border that feeds something from the first spring bloom to the last fall aster.", category: "Design", tags: ["pollinators", "design"], status: "published", author: "Priya Nair", featured: null, date: "2026-05-12", updated: "3 days ago",
    body: "# Designing a Pollinator Border\n\nThe goal is **continuous bloom** and generous **clumps**. Foragers waste less energy when a single species is planted in a drift rather than scattered.\n\n## Pick three bloom seasons\n\n- **Spring:** wild columbine, golden alexanders\n- **Summer:** wild bergamot, purple coneflower\n- **Fall:** New England aster, goldenrod\n\nLeave standing stems and leaf litter over winter — many native bees nest in them. For more, see the regional *Pollinator-Friendly Planting Guide* for your area." },
  { id: 2, type: "post", title: "Understanding Germination Codes", slug: "understanding-germination-codes", excerpt: "What that little letter on the seed packet means, and how to act on it.", category: "Seed Starting", tags: ["seeds", "stratification"], status: "published", author: "Maya Okafor", featured: null, date: "2026-04-02", updated: "1 week ago",
    body: "# Understanding Germination Codes\n\nMany natives need a cold, moist period before they will sprout.\n\nA **Code C** seed wants roughly `30-60 days` of cold-moist stratification. The easiest method is a **dormant fall sowing** that lets winter do the work, or damp sand in the fridge.\n\nAlways check each species' code before you start — see the *Germination Codes & Seed Starting* brochure." },
  { id: 3, type: "post", title: "Fall Is for Site Prep", slug: "fall-is-for-site-prep", excerpt: "Why autumn is the right time to clear ground for next year's seed mix.", category: "Site Prep", tags: ["site prep", "seeding"], status: "draft", author: "Sam Whitfield", featured: null, date: "", updated: "2 days ago",
    body: "# Fall Is for Site Prep\n\nClear existing vegetation before you sow.\n\n- **Smothering** with cardboard and mulch takes a full season.\n- **Solarization** with clear plastic runs about 6-8 weeks in summer heat.\n\nThen a dormant late-fall seeding lets winter handle stratification for you." },
  { id: 4, type: "post", title: "Native Lawn Alternatives", slug: "native-lawn-alternatives", excerpt: "Low-mow and no-mow options that still support insects.", category: "Design", tags: ["lawn", "design"], status: "pending", author: "Sam Whitfield", featured: null, date: "", updated: "5 hours ago",
    body: "# Native Lawn Alternatives\n\nDraft for review: sedges, self-heal, and short native grasses as a walkable, low-input alternative to turf. Needs an editor's eyes before publishing." },
  { id: 5, type: "page", title: "About the Gardening Advisor", slug: "about", excerpt: "Who we are and how the advisor works.", category: "", tags: ["about"], status: "published", author: "Maya Okafor", featured: null, date: "2026-03-01", updated: "1 month ago",
    body: "# About the Gardening Advisor\n\nWe help home gardeners build habitat with regionally native plants. Every answer the advisor gives is grounded in published cultural guides and the regional pollinator planting guides." },
  { id: 6, type: "page", title: "How We Source Plants", slug: "sourcing", excerpt: "Our stance on straight species and cultivars.", category: "", tags: ["sourcing"], status: "draft", author: "Devin Brooks", featured: null, date: "", updated: "3 weeks ago",
    body: "# How We Source Plants\n\nWe favor **straight species** over cultivars for habitat value. Draft page — expand with nursery partners and a note on neonicotinoids." },
];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Plant asset paths in agent SVGs are absolute (/icons/plants/watercolor-front/…)
// and would 404 against the CMS's own origin (:5173). Rewrite them to the agent
// origin so the illustrations show. Lazy — AGENT_URL is defined later in the file.
let _agentOriginCache;
const agentOrigin = () => {
  if (_agentOriginCache !== undefined) return _agentOriginCache;
  try { _agentOriginCache = new URL(AGENT_URL).origin; } catch { _agentOriginCache = ""; }
  return _agentOriginCache;
};
const rewriteAssetPaths = (svg) => {
  const o = agentOrigin();
  return o ? svg.replace(/(href|xlink:href)=(["'])(\/icons\/[^"']+)\2/g, `$1=$2${o}$3$2`) : svg;
};
function mdToHtml(md = "") {
  // Extract triple-backtick fenced blocks first so we can render ```svg inline
  // (as the actual diagram) and other fences as <pre><code>. Everything outside
  // the fences flows through the regular line-based renderer below.
  const parts = [];
  let cursor = 0;
  const fence = /```([a-zA-Z]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = fence.exec(md)) !== null) {
    if (match.index > cursor) parts.push({ type: "md", text: md.slice(cursor, match.index) });
    parts.push({ type: "fence", lang: match[1].toLowerCase(), body: match[2] });
    cursor = match.index + match[0].length;
  }
  if (cursor < md.length) {
    // During streaming an SVG fence often opens before it closes. Detect an
    // unclosed opener and swap it for a placeholder so we don't flash raw
    // <svg> source at the user before the block is complete.
    const tail = md.slice(cursor);
    const opener = tail.match(/```(svg)\b/i);
    if (opener) {
      const before = tail.slice(0, opener.index);
      if (before.trim()) parts.push({ type: "md", text: before });
      parts.push({ type: "pending" });
    } else {
      parts.push({ type: "md", text: tail });
    }
  }

  const inline = (t) => t
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

  const renderMd = (text) => {
    const lines = esc(text).split("\n"); let out = "", list = null;
    const closeList = () => { if (list) { out += `</${list}>`; list = null; } };
    for (const ln of lines) {
      if (/^### /.test(ln)) { closeList(); out += `<h3>${inline(ln.slice(4))}</h3>`; }
      else if (/^## /.test(ln)) { closeList(); out += `<h2>${inline(ln.slice(3))}</h2>`; }
      else if (/^# /.test(ln)) { closeList(); out += `<h1>${inline(ln.slice(2))}</h1>`; }
      else if (/^- /.test(ln)) { if (list !== "ul") { closeList(); out += "<ul>"; list = "ul"; } out += `<li>${inline(ln.slice(2))}</li>`; }
      else if (/^\d+\. /.test(ln)) { if (list !== "ol") { closeList(); out += "<ol>"; list = "ol"; } out += `<li>${inline(ln.replace(/^\d+\.\s/, ""))}</li>`; }
      else if (ln.trim() === "") { closeList(); }
      else { closeList(); out += `<p>${inline(ln)}</p>`; }
    }
    closeList(); return out;
  };

  return parts.map(p => {
    if (p.type === "md") return renderMd(p.text);
    if (p.type === "pending") return `<div class="terr-diagram" style="text-align:center;color:#7a6f57;font-style:italic;padding:24px">Rendering diagram…</div>`;
    if (p.lang === "svg") return `<div class="terr-diagram">${rewriteAssetPaths(sanitizeSVG(p.body))}</div>`;
    return `<pre><code>${esc(p.body)}</code></pre>`;
  }).join("");
}
const DEFAULT_THEME = {
  primary: "#2f6b3e", bg: "#f3f8ee", surface: "#ffffff", user: "#2f6b3e", bot: "#eef3e6",
  text: "#1c2a1f", accent: "#e0a52e", radius: 18, btnRadius: 24, gradient: true,
  fdisp: "'Fraunces',serif", fbody: "'DM Sans',sans-serif", size: 14, lh: 1.5, ls: 0, hw: 600, logoSVG: null,
  /* Editable brand identity — surfaces in the sidebar header and the terrarium.
     Admins can rename the CMS entirely (e.g. brand it for their org) from
     Theme Studio without touching source. */
  brandName: "Verdant",
  brandTagline: "Advisor CMS",
};
const DEFAULT_PALETTE = [
  { name: "Moss", hex: "#356b41" }, { name: "Leaf", hex: "#5b9b5f" }, { name: "Goldenrod", hex: "#e0a52e" },
  { name: "Liatris", hex: "#9b3d6e" }, { name: "Sage paper", hex: "#e9eedf" }, { name: "Soil", hex: "#16241b" },
];

/* canned KB-grounded preview answers */
const BOT_REPLIES = [
  { k: ["pollinator", "bee", "monarch", "butterfly"], a: "For pollinators, plant in <b>clumps of one species</b> so foragers can work efficiently, and aim for blooms across <b>spring, summer, and fall</b>. Add host plants - <b>milkweed</b> for monarchs - and leave standing stems and leaf litter over winter for native bees." },
  { k: ["germinat", "stratif", "code", "seed start"], a: "Many natives need a cold-moist period to wake up. A <b>Code C</b> seed wants roughly <b>30-60 days of cold-moist stratification</b> - easiest done by a fall/dormant sowing or in a fridge with damp sand." },
  { k: ["site", "prep", "weeds", "smother", "solar"], a: "Clear existing vegetation first. <b>Smothering</b> (cardboard + mulch) takes a full season; <b>solarization</b> (clear plastic in summer heat) runs ~6-8 weeks. Then sow into clean soil - a <b>dormant late-fall seeding</b> lets winter handle stratification." },
  { k: ["region", "zone", "where", "local"], a: "Tell me your <b>region or ZIP</b> and I'll point you to the right Pollinator-Friendly Planting Guide. Native ranges matter." },
  { k: ["cultivar", "nativar", "straight species"], a: "For habitat value I lean toward <b>straight species</b> over cultivars - some nativars offer less nectar or shifted bloom timing." },
];
const replyFor = (q) => { const s = q.toLowerCase(); const h = BOT_REPLIES.find(r => r.k.some(k => s.includes(k))); return h ? h.a : "Great question. Share your <b>region</b> and what you'd like to grow or attract, and I'll draw on the planting guides to give a grounded plan."; };
const sanitizeSVG = (t) => t.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/on\w+="[^"]*"/gi, "").replace(/on\w+='[^']*'/gi, "");

/* -------------------------------------------------------------------------
   Live agent integration.
   The Gardening Advisor agent is an HTTP endpoint that accepts
   POST { messages, system, model, max_tokens, temperature, top_p }
   and streams Server-Sent Events: `data: {"text": "..."}` … `data: [DONE]`.
   Set VITE_AGENT_URL to enable it; otherwise the preview uses demo replies.
   ------------------------------------------------------------------------- */
const AGENT_URL = (() => { try { return (import.meta && import.meta.env && import.meta.env.VITE_AGENT_URL) || ""; } catch { return ""; } })();
const stripTags = (h) => (h || "").replace(/<[^>]+>/g, "");
// The dashboard's demo model labels are placeholders; only forward a real,
// dated API model id. Otherwise let the agent use its own default.
const realModel = (m) => (typeof m === "string" && /\d{8}$/.test(m)) ? m : undefined;

async function streamChat({ url, messages, system, model, maxTokens, temperature, topP, onText, signal }) {
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

/* ================================ CSS ==================================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
.vd,.vd *{box-sizing:border-box;}
.vd{
  --soil:#16241b;--soil-2:#1f3326;--moss:#356b41;--leaf:#5b9b5f;--canvas:#e9eedf;--paper:#fafbf6;--ink:#1a271c;--muted:#5e6b57;--bloom:#e0a52e;--berry:#9b3d6e;--mist:#d6e0c8;--mist-2:#c4d2b3;--sage:#cfe0c2;
  /* Modular type scale — fluid via clamp() so every viewport interpolates
     between a mobile floor and a desktop ceiling. One source of truth for
     every heading and label. */
  --fs-caption: clamp(11px, 0.69rem + 0.1vw, 12px);
  --fs-label:   clamp(12px, 0.75rem + 0.1vw, 13px);
  --fs-body:    clamp(13.5px, 0.82rem + 0.15vw, 14.5px);
  --fs-h4:      clamp(15px, 0.9rem + 0.35vw, 18px);
  --fs-h3:      clamp(17px, 1rem + 0.4vw, 20px);
  --fs-h2:      clamp(20px, 1.15rem + 0.7vw, 26px);
  --fs-h1:      clamp(23px, 1.35rem + 0.9vw, 32px);
  --fs-stat:    clamp(24px, 1.35rem + 1.3vw, 32px);
  /* Fluid spacing scale — narrow viewports get tighter padding automatically. */
  --pad-content-x: clamp(14px, 0.55rem + 1.6vw, 26px);
  --pad-content-y: clamp(14px, 0.55rem + 1vw, 20px);
  --pad-card:      clamp(14px, 0.6rem + 0.8vw, 20px);
  --gap-grid:      clamp(12px, 0.55rem + 0.6vw, 18px);
  /* Minimum comfortable touch target (WCAG 2.5.5 recommends >=44). */
  --target-min: 44px;
  font-family:'DM Sans',system-ui,sans-serif;color:var(--ink);background:var(--canvas);min-height:100vh;display:flex;font-size:var(--fs-body);line-height:1.5;letter-spacing:-.005em;
}
.vd-display{font-family:'Fraunces',Georgia,serif;}
.vd-mono{font-family:'JetBrains Mono',ui-monospace,monospace;}
.boot{position:fixed;inset:0;background:var(--canvas);display:grid;place-items:center;z-index:500;}
.boot .m{width:54px;height:54px;border-radius:16px;background:linear-gradient(150deg,var(--leaf),var(--moss));display:grid;place-items:center;color:#fff;animation:pulse 1.3s ease-in-out infinite;}
@keyframes pulse{0%,100%{transform:scale(1);opacity:.85;}50%{transform:scale(1.08);opacity:1;}}
.vd-side{width:248px;flex:0 0 248px;background:var(--soil);color:var(--sage);display:flex;flex-direction:column;min-height:100vh;position:sticky;top:0;border-right:1px solid #0d1711;overflow:hidden;transition:width .22s ease,flex-basis .22s ease,border-width .22s ease;}
/* Collapsed at desktop = fully hidden. The hamburger in the top nav toggles it. */
.vd-side.col{width:0;flex-basis:0;border-right-width:0;}
.vd-brand{padding:20px 18px 14px;display:flex;align-items:center;gap:11px;}
.vd-brand-mark{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(150deg,var(--leaf),var(--moss));color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.25);flex:0 0 36px;}
.vd-brand h1{font-family:'Fraunces',serif;font-size:var(--fs-h3);font-weight:600;color:#fff;margin:0;}
.vd-brand small{color:#8fae84;font-size:10px;letter-spacing:.07em;text-transform:uppercase;}
.vd-side.col .vd-brand h1,.vd-side.col .vd-brand small,.vd-side.col .vd-nav span,.vd-side.col .vd-navlabel{display:none;}
.vd-side.col .vd-nav{justify-content:center;}
.vd-navgroup{padding:4px 12px;}
.vd-navlabel{font-size:10px;text-transform:uppercase;letter-spacing:.13em;color:#73926a;padding:13px 10px 6px;}
.vd-nav{display:flex;align-items:center;gap:11px;width:100%;text-align:left;padding:10px 11px;min-height:40px;border-radius:10px;background:transparent;border:none;color:#bcd3ae;font-size:var(--fs-body);cursor:pointer;font-weight:500;position:relative;transition:background .15s,color .15s;}
.vd-nav:hover{background:var(--soil-2);color:#eaf5e2;}
.vd-nav.active{background:var(--soil-2);color:#fff;}
.vd-nav.active::before{content:"";position:absolute;left:-12px;top:50%;transform:translateY(-50%);width:4px;height:20px;border-radius:0 4px 4px 0;background:var(--bloom);}
.vd-nav.locked{opacity:.4;cursor:not-allowed;}
.vd-nav .lk{margin-left:auto;}
.vd-main{flex:1;min-width:0;display:flex;flex-direction:column;}
.vd-topnav{display:flex;align-items:center;gap:12px;padding:10px clamp(12px,1rem + 0.6vw,20px);border-bottom:1px solid var(--mist);background:rgba(250,251,246,.85);backdrop-filter:blur(8px);position:sticky;top:0;z-index:40;}
.vd-iconbtn{width:40px;height:40px;border-radius:10px;border:1px solid transparent;background:transparent;color:var(--ink);display:grid;place-items:center;cursor:pointer;position:relative;flex:0 0 auto;}
.vd-iconbtn:hover{background:#eef3e6;}
.vd-search{flex:1;max-width:440px;position:relative;}
.vd-search input{width:100%;padding:9px 12px 9px 36px;border:1px solid var(--mist-2);border-radius:11px;background:var(--paper);font-family:inherit;font-size:13.5px;}
.vd-search input:focus{outline:2px solid var(--leaf);outline-offset:1px;}
.vd-search .si{position:absolute;left:11px;top:10px;color:var(--muted);}
.vd-spacer{flex:1;}
.vd-storage{display:flex;align-items:center;gap:6px;font-size:11px;padding:5px 10px;border-radius:999px;border:1px solid var(--mist);background:var(--paper);color:var(--muted);}
.vd-storage.on{color:var(--moss);border-color:#bfd6b0;background:#f0f6e9;}
.vd-profile{display:flex;align-items:center;gap:9px;padding:5px 10px 5px 6px;border-radius:999px;border:1px solid var(--mist);background:var(--paper);cursor:pointer;}
.vd-profile:hover{border-color:var(--moss);}
.vd-profile .nm{font-size:13px;font-weight:600;line-height:1.1;}
.vd-profile .rl{font-size:10.5px;color:var(--muted);}
.vd-dd{position:absolute;top:54px;right:14px;background:var(--paper);border:1px solid var(--mist);border-radius:14px;box-shadow:0 18px 44px -16px rgba(22,36,27,.45);width:280px;z-index:60;overflow:hidden;}
.vd-dd .hd{display:flex;gap:11px;align-items:center;padding:15px;background:#f3f7ed;border-bottom:1px solid var(--mist);}
.vd-dd .it{display:flex;align-items:center;gap:10px;width:100%;padding:11px 15px;border:none;background:transparent;font-family:inherit;font-size:13.5px;cursor:pointer;color:var(--ink);text-align:left;}
.vd-dd .it:hover{background:#eef3e6;}
.vd-dd .sec{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);padding:11px 15px 5px;}
.vd-head{padding:var(--pad-content-y) var(--pad-content-x) 4px;}
.vd-crumb{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:var(--fs-caption);flex-wrap:wrap;}
.vd-head h2{font-family:'Fraunces',serif;font-size:var(--fs-h1);font-weight:600;margin:5px 0 0;line-height:1.15;}
.vd-head .sub{color:var(--muted);font-size:var(--fs-label);margin-top:2px;}
.vd-content{padding:var(--pad-content-y) var(--pad-content-x) 64px;max-width:1200px;width:100%;display:flex;flex-direction:column;gap:var(--gap-grid);}
.btn{display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border-radius:10px;font-family:inherit;font-size:var(--fs-label);font-weight:600;cursor:pointer;border:1px solid transparent;transition:transform .08s,background .15s;white-space:nowrap;min-height:40px;}
.btn:active{transform:translateY(1px);}
.btn-primary{background:var(--moss);color:#fff;box-shadow:0 2px 8px rgba(53,107,65,.3);}
.btn-primary:hover{background:#2c5b36;}
.btn-bloom{background:var(--bloom);color:#3a2a06;}.btn-bloom:hover{background:#d0971f;}
.btn-ghost{background:var(--paper);color:var(--ink);border-color:var(--mist-2);}.btn-ghost:hover{background:#fff;border-color:var(--moss);}
.btn-danger{background:#fbe9e4;color:#9b3a26;border-color:#f0cdc2;}.btn-danger:hover{background:#f7ddd4;}
.btn:disabled{opacity:.45;cursor:not-allowed;}
.btn-sm{padding:6px 10px;font-size:12px;border-radius:8px;}
.inp,.sel,.txa{width:100%;padding:10px 12px;border:1px solid var(--mist-2);border-radius:10px;background:var(--paper);font-family:inherit;font-size:13.5px;color:var(--ink);}
.inp:focus,.sel:focus,.txa:focus{outline:2px solid var(--leaf);outline-offset:1px;border-color:var(--leaf);}
.txa{resize:vertical;line-height:1.5;}
.field{margin-bottom:14px;}
.field label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;}
.hint{font-size:11.5px;color:var(--muted);margin-top:5px;}
.card{background:var(--paper);border:1px solid var(--mist);border-radius:16px;padding:var(--pad-card);}
.card-h{display:flex;align-items:center;gap:10px;margin-bottom:4px;}
.card-h h3{font-family:'Fraunces',serif;font-size:var(--fs-h3);font-weight:600;margin:0;line-height:1.2;}
.card-h .ico{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;background:#eef3e6;color:var(--moss);flex:0 0 32px;}
.card-desc{color:var(--muted);font-size:var(--fs-label);margin:0 0 16px;}
.grid{display:grid;gap:var(--gap-grid);}
.stat{background:var(--paper);border:1px solid var(--mist);border-radius:16px;padding:var(--pad-card);position:relative;overflow:hidden;}
.stat .v{font-family:'Fraunces',serif;font-size:var(--fs-stat);font-weight:600;line-height:1;}
.stat .k{color:var(--muted);font-size:var(--fs-label);margin-top:7px;display:flex;align-items:center;gap:6px;}
.stat .spark{position:absolute;right:-6px;bottom:-6px;opacity:.1;}
.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;}
.b-admin{background:#e7ddf0;color:#5a2b7a;}.b-editor{background:#dcebe0;color:#2c6b3a;}.b-author{background:#fdeecb;color:#8a5d09;}.b-contrib{background:#e2ecf6;color:#2c5680;}.b-sub{background:#eceae3;color:#5f5a4d;}
.b-active{background:#dcebe0;color:#2c6b3a;}.b-draft{background:#eceae3;color:#5f5a4d;}.b-arch{background:#f0e6e2;color:#86503c;}.b-invited{background:#fdeecb;color:#8a5d09;}
.tbl{width:100%;border-collapse:collapse;}
.tbl th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);padding:10px 12px;border-bottom:1px solid var(--mist);}
.tbl td{padding:11px 12px;border-bottom:1px solid var(--mist);font-size:13.5px;vertical-align:middle;}
.tbl tr:last-child td{border-bottom:none;}
.mtx td,.mtx th{text-align:center;}.mtx td:first-child,.mtx th:first-child{text-align:left;}.mtx .yes{color:var(--moss);}.mtx .no{color:#c9b9b2;}
.swatches{display:flex;flex-wrap:wrap;gap:12px;}
.swatch{width:118px;border:1px solid var(--mist);border-radius:13px;overflow:hidden;background:var(--paper);}
.swatch .chip{height:60px;position:relative;cursor:pointer;}
.swatch .chip input{position:absolute;inset:0;opacity:0;cursor:pointer;}
.swatch .meta{padding:8px 9px;}
.swatch .meta .hx{font-size:10.5px;color:var(--muted);font-family:'JetBrains Mono',monospace;text-transform:uppercase;}
.rng{display:flex;align-items:center;gap:12px;}
.rng input[type=range]{flex:1;accent-color:var(--moss);}
.rng .val{font-family:'JetBrains Mono',monospace;font-size:12px;min-width:54px;text-align:right;}
.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;}
.media-item{border:1px solid var(--mist);border-radius:13px;overflow:hidden;background:var(--paper);position:relative;cursor:pointer;transition:border-color .15s;}
.media-item:hover{border-color:var(--moss);}
.media-item.sel{border-color:var(--moss);box-shadow:0 0 0 2px rgba(53,107,65,.25);}
.media-item .thumb{aspect-ratio:1;background:#eef3e6;display:grid;place-items:center;overflow:hidden;}
.media-item .thumb img{width:100%;height:100%;object-fit:cover;}
.img-skel{width:100%;height:100%;min-height:60px;background:linear-gradient(100deg,#eef3e6 30%,#e2ebd8 50%,#eef3e6 70%);background-size:200% 100%;animation:shim 1.2s infinite;}
@keyframes shim{0%{background-position:200% 0;}100%{background-position:-200% 0;}}
.pickgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;max-height:340px;overflow:auto;}
.pickitem{aspect-ratio:1;border-radius:10px;overflow:hidden;border:2px solid transparent;cursor:pointer;background:#eef3e6;}
.pickitem.on{border-color:var(--moss);}
.editor-grid{display:grid;grid-template-columns:1fr 320px;gap:18px;align-items:start;}
.prose{font-size:14px;line-height:1.65;color:var(--ink);}
.prose h1{font-family:'Fraunces',serif;font-size:24px;margin:.4em 0 .3em;}
.prose h2{font-family:'Fraunces',serif;font-size:19px;margin:1em 0 .3em;}
.prose h3{font-size:15px;font-weight:700;margin:1em 0 .3em;}
.prose p{margin:.6em 0;}
.prose ul,.prose ol{margin:.5em 0 .5em 1.2em;}
.prose li{margin:.25em 0;}
.prose a{color:var(--moss);text-decoration:underline;}
.prose code{font-family:'JetBrains Mono',monospace;background:#eef3e6;padding:1px 5px;border-radius:5px;font-size:.9em;}
.b-pending{background:#fde9d8;color:#9a5418;}.b-sched{background:#e2ecf6;color:#2c5680;}
.login-wrap{min-height:100vh;width:100%;display:grid;place-items:center;padding:24px;background:radial-gradient(120% 80% at 50% -20%,rgba(91,155,95,.22),transparent 60%),var(--canvas);}
.login-card{width:100%;max-width:430px;background:var(--paper);border:1px solid var(--mist);border-radius:22px;padding:30px;box-shadow:0 30px 70px -30px rgba(22,36,27,.4);}
.login-brand{display:flex;gap:12px;align-items:center;margin-bottom:22px;}
.login-brand .eyebrow{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);}
.login-brand h1{font-family:'Fraunces',serif;font-size:24px;margin:0;font-weight:600;}
.login-h{font-family:'Fraunces',serif;font-size:21px;margin:0 0 4px;}
.login-sub{color:var(--muted);font-size:13px;margin:0 0 20px;}
.sso-row{display:flex;flex-direction:column;gap:9px;margin-bottom:14px;}
.sso-btn{display:flex;align-items:center;justify-content:center;gap:9px;padding:10px;border:1px solid var(--mist-2);border-radius:11px;background:var(--paper);font-family:inherit;font-size:13.5px;font-weight:600;cursor:pointer;color:var(--ink);}
.sso-btn:hover{background:#f3f7ed;border-color:var(--moss);}
.or{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:11.5px;margin:4px 0 14px;}
.or::before,.or::after{content:"";flex:1;height:1px;background:var(--mist);}
.link{color:var(--moss);font-size:12.5px;cursor:pointer;text-decoration:underline;background:none;border:none;font-family:inherit;}
.login-err{display:flex;align-items:center;gap:8px;background:#fbe9e4;color:#9b3a26;border:1px solid #f0cdc2;border-radius:10px;padding:9px 12px;font-size:12.5px;margin-bottom:12px;}
.demo-box{margin-top:20px;padding-top:16px;border-top:1px dashed var(--mist-2);}
.demo-chips{display:flex;flex-wrap:wrap;gap:7px;}
.demo-chip{display:flex;align-items:center;gap:6px;padding:5px 9px 5px 5px;border:1px solid var(--mist);border-radius:999px;background:var(--paper);cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;color:var(--ink);}
.demo-chip:hover{border-color:var(--moss);background:#f3f7ed;}
.login-foot{margin-top:18px;color:var(--muted);font-size:11.5px;text-align:center;max-width:430px;}
.media-item .mbar{padding:9px 10px;}
.media-item .mbar .nm{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.media-item .pick{position:absolute;top:7px;left:7px;width:22px;height:22px;border-radius:6px;background:rgba(255,255,255,.9);border:1px solid var(--mist-2);display:grid;place-items:center;}
.media-item.sel .pick{background:var(--moss);color:#fff;border-color:var(--moss);}
.dropzone{border:2px dashed var(--mist-2);border-radius:14px;padding:24px;text-align:center;color:var(--muted);cursor:pointer;transition:border-color .15s,background .15s;}
.dropzone:hover{border-color:var(--moss);background:#f3f7ed;}
.drawer{position:fixed;top:0;right:0;bottom:0;width:360px;background:var(--paper);border-left:1px solid var(--mist);box-shadow:-18px 0 44px -20px rgba(22,36,27,.4);z-index:120;padding:20px;overflow:auto;animation:slidein .2s ease;}
@keyframes slidein{from{transform:translateX(20px);opacity:0;}to{transform:none;opacity:1;}}
.code-wrap{border:1px solid var(--mist);border-radius:13px;overflow:hidden;background:#16241b;}
.code-tabs{display:flex;gap:2px;background:#0f1a13;padding:8px 8px 0;flex-wrap:wrap;}
.code-tab{padding:8px 14px;font-size:12.5px;font-family:'JetBrains Mono',monospace;color:#8fae84;border:none;background:transparent;cursor:pointer;border-radius:8px 8px 0 0;}
.code-tab.active{background:#16241b;color:#eaf5e2;}
.code-body{display:flex;font-family:'JetBrains Mono',monospace;}
.code-gutter{padding:14px 8px;color:#41624b;text-align:right;user-select:none;background:#13201880;min-width:42px;line-height:1.7;font-size:12.5px;}
.code-ta{flex:1;background:transparent;color:#d6efcb;border:none;padding:14px;font-family:inherit;font-size:12.5px;line-height:1.7;resize:vertical;min-height:300px;}
.code-ta:focus{outline:none;}
.snip{font-size:11px;padding:5px 9px;border-radius:8px;background:#1f3326;color:#bcd3ae;border:1px solid #2c4634;cursor:pointer;font-family:'JetBrains Mono',monospace;}
.snip:hover{background:#26402e;}
.terr{--b-primary:#2f6b3e;--b-bg:#f3f8ee;--b-surface:#fff;--b-user:#2f6b3e;--b-bot:#eef3e6;--b-text:#1c2a1f;--b-accent:#e0a52e;--b-radius:18px;--b-btnr:24px;--b-fdisp:'Fraunces',serif;--b-fbody:'DM Sans',sans-serif;--b-size:14px;--b-lh:1.5;--b-ls:0px;--b-hw:600;border:1px solid var(--mist);border-radius:20px;overflow:hidden;background:var(--b-bg);box-shadow:0 18px 40px -24px rgba(22,36,27,.5);}
.terr.grad{background:radial-gradient(120% 90% at 50% -10%,rgba(91,155,95,.18),transparent 60%),var(--b-bg);}
.terr-head{display:flex;align-items:center;gap:11px;padding:15px 18px;background:var(--b-surface);border-bottom:1px solid rgba(0,0,0,.06);}
.terr-logo{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:var(--b-primary);color:#fff;overflow:hidden;}
.terr-logo svg{width:24px;height:24px;}
.terr-title{font-family:var(--b-fdisp);font-weight:var(--b-hw);font-size:17px;color:var(--b-text);}
.terr-sub{font-size:11.5px;color:var(--b-text);opacity:.6;}
.terr-body{padding:18px;display:flex;flex-direction:column;gap:12px;max-height:430px;overflow-y:auto;}
.bub{max-width:80%;padding:11px 14px;font-family:var(--b-fbody);font-size:var(--b-size);line-height:var(--b-lh);letter-spacing:var(--b-ls);}
.bub.bot{align-self:flex-start;background:var(--b-bot);color:var(--b-text);border-radius:var(--b-radius) var(--b-radius) var(--b-radius) 5px;}
.bub.user{align-self:flex-end;background:var(--b-user);color:#fff;border-radius:var(--b-radius) var(--b-radius) 5px var(--b-radius);}
.bub.bot b{color:var(--b-primary);}
.terr-input{display:flex;gap:9px;padding:13px 16px;background:var(--b-surface);border-top:1px solid rgba(0,0,0,.06);}
.terr-input input{flex:1;border:1px solid rgba(0,0,0,.12);border-radius:var(--b-btnr);padding:10px 15px;font-family:var(--b-fbody);font-size:13.5px;background:#fff;}
.terr-input input:focus{outline:2px solid var(--b-primary);outline-offset:1px;}
.terr-diagram{margin:8px 0;padding:8px;background:#fbfaf5;border:1px solid rgba(0,0,0,.06);border-radius:10px;}
.terr-diagram svg{display:block;width:100%;height:auto;max-width:100%;}
.bub.bot pre{background:rgba(0,0,0,.04);padding:10px 12px;border-radius:8px;overflow-x:auto;font-size:12px;line-height:1.5;}
.terr-send{width:40px;height:40px;border-radius:50%;border:none;background:var(--b-primary);color:#fff;display:grid;place-items:center;cursor:pointer;flex:0 0 40px;}
.terr-chip{font-size:11px;padding:4px 10px;border-radius:999px;background:var(--b-bot);color:var(--b-text);border:1px solid rgba(0,0,0,.06);cursor:pointer;}
.seg{display:inline-flex;background:#eef3e6;border-radius:10px;padding:3px;gap:2px;}
.seg button{border:none;background:transparent;padding:7px 12px;border-radius:8px;font-family:inherit;font-size:12.5px;font-weight:600;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;gap:5px;}
.seg button.on{background:var(--paper);color:var(--ink);box-shadow:0 1px 4px rgba(0,0,0,.08);}
/* Modular grid utilities — auto-fit lets the container decide column count.
   Cells collapse to fewer columns as soon as they'd fall below the min-width,
   so the layout adapts continuously (not just at hard breakpoints). */
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:var(--gap-grid);}
.three{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:var(--gap-grid);}
.notice{display:flex;gap:10px;align-items:flex-start;background:#fdf6e3;border:1px solid #f0e2b8;border-radius:11px;padding:12px 14px;font-size:12.5px;color:#7a5d10;}
.locked-pane{text-align:center;padding:56px 20px;color:var(--muted);}
.locked-pane .ring{width:62px;height:62px;border-radius:50%;background:#eceae3;display:grid;place-items:center;margin:0 auto 16px;color:#9a8f7a;}
.toast-wrap{position:fixed;bottom:22px;right:22px;z-index:200;display:flex;flex-direction:column;gap:9px;}
.toast{background:var(--soil);color:#eaf5e2;padding:12px 16px;border-radius:11px;font-size:13px;display:flex;align-items:center;gap:9px;box-shadow:0 10px 30px -8px rgba(0,0,0,.5);animation:tin .25s ease;}
@keyframes tin{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
.modal-bg{position:fixed;inset:0;background:rgba(22,36,27,.45);z-index:150;display:grid;place-items:center;padding:20px;animation:tin .18s ease;}
.modal{background:var(--paper);border-radius:18px;width:100%;max-width:520px;padding:22px;max-height:90vh;overflow:auto;}
.modal h3{font-family:'Fraunces',serif;font-size:19px;margin:0 0 4px;}
.avgrid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;}
.avopt{aspect-ratio:1;border-radius:50%;display:grid;place-items:center;color:#fff;cursor:pointer;border:3px solid transparent;}
.avopt.on{border-color:var(--ink);box-shadow:0 0 0 2px var(--paper) inset;}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--mist);margin-bottom:18px;flex-wrap:wrap;}
.tab{padding:9px 14px;border:none;background:transparent;font-family:inherit;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;}
.tab.on{color:var(--ink);border-bottom-color:var(--moss);}
.dot{position:absolute;top:7px;right:8px;width:8px;height:8px;border-radius:50%;background:var(--bloom);border:1.5px solid var(--paper);}
/* -----------------------------------------------------------------------
   Tablet (720-1023px): the "in-between" breakpoint the app previously
   skipped. Reduce chrome padding, drop the topnav's optional flourishes,
   force the greenhouse's hardcoded 1.4fr 1fr grid down to a stack, allow
   card-headers to wrap.
   ----------------------------------------------------------------------- */
@media(max-width:1023px){
  /* Any hardcoded fr-based grid stacks — inline styles beat class rules, so
     we target their attribute selector with !important to keep the modular
     collapse behavior consistent across every screen. */
  .grid[style*="1.4fr"],.grid[style*="1.5fr"],.grid[style*="2fr"]{grid-template-columns:1fr !important;}
  .vd-storage{display:none;}
  .vd-profile .rl{display:none;}
  .editor-grid{grid-template-columns:1fr;}
}
/* -----------------------------------------------------------------------
   Handheld (< 920px): the sidebar becomes a drawer, the topnav wraps,
   touch targets grow to the 44px minimum, cards trim their padding.
   ----------------------------------------------------------------------- */
@media(max-width:920px){
  .vd-side{position:fixed;z-index:80;height:100vh;width:248px;flex-basis:248px;transform:none;box-shadow:2px 0 24px rgba(0,0,0,.18);}
  .vd-side.col{transform:translateX(-100%);width:248px;flex-basis:248px;box-shadow:none;}
  .vd-side.col .vd-brand h1,.vd-side.col .vd-brand small,.vd-side.col .vd-nav span,.vd-side.col .vd-navlabel{display:inline;}
  .vd-side.col .vd-nav{justify-content:flex-start;}
  .vd-side .vd-nav{min-height:var(--target-min);}
  .vd-topnav{flex-wrap:wrap;}
  .vd-search{order:10;flex-basis:100%;max-width:none;}
  .vd-iconbtn{width:var(--target-min);height:var(--target-min);}
  .btn{min-height:var(--target-min);}
  .demo-chip{min-height:36px;padding:6px 10px 6px 6px;}
  .stat{padding:calc(var(--pad-card) - 2px);}
  .terr-body{max-height:60vh;}
  .avgrid{grid-template-columns:repeat(4,1fr);}
  .drawer{width:min(360px,100vw);}
}
/* -----------------------------------------------------------------------
   Small handheld (< 560px): tighten further. Force any grid with an
   inline fr layout to stack, shorten the profile pill, hide dividers.
   ----------------------------------------------------------------------- */
@media(max-width:559px){
  /* Force only hardcoded fr-layouts to a single column. Don't touch grids that
     already use auto-fit — those adapt on their own and we'd waste vertical
     space forcing them to one card per row. */
  .grid[style*="1.4fr"],.grid[style*="1.5fr"],.grid[style*="2fr"]{grid-template-columns:1fr !important;}
  .vd-profile .nm{max-width:9ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .vd-crumb{font-size:11px;}
  .login-card{padding:22px;border-radius:18px;}
  .avgrid{grid-template-columns:repeat(3,1fr);}
  .swatch{width:calc(50% - 6px);}
  .tabs{overflow-x:auto;flex-wrap:nowrap;padding-bottom:2px;}
  .tab{white-space:nowrap;}
}
`;

/* ============================== APP ====================================== */
export default function VerdantDashboard() {
  const [loaded, setLoaded] = useState(false);
  const [storageOk, setStorageOk] = useState(false);
  const [view, setView] = useState("overview");
  // `collapsed` drives the sidebar's collapsed appearance. On desktop it means
  // "shrink to a 68px icon rail". On narrow viewports (<=920px) it means "fully
  // hidden off-screen" — the sidebar is a drawer that the hamburger reveals.
  // A single state powers both modes so the topnav hamburger works at every width.
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(max-width:920px)").matches);

  const [users, setUsers] = useState(SEED_USERS);
  const [prompts, setPrompts] = useState(SEED_PROMPTS);
  const [media, setMedia] = useState([]);
  const [collections, setCollections] = useState(SEED_COLLECTIONS);
  const [posts, setPosts] = useState(SEED_POSTS);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  const [presets, setPresets] = useState([]);
  const [customCSS, setCustomCSS] = useState("/* Scoped to the bot widget */\n.bub.bot{ box-shadow:0 1px 0 rgba(0,0,0,.04); }\n");
  const [customJS, setCustomJS] = useState("// Runs in the published bot widget.\nconsole.log('Gardening Advisor ready');\n");
  const [customHTML, setCustomHTML] = useState("<!-- Injected into the widget head -->\n");
  const [activity, setActivity] = useState(SEED_ACTIVITY);
  const [currentUserId, setCurrentUserId] = useState(1);
  const [session, setSession] = useState(null); // logged-in user id, or null when signed out
  const [toasts, setToasts] = useState([]);
  const [ddOpen, setDdOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const currentUser = users.find(u => u.id === currentUserId) || users[0];
  const role = currentUser?.role || "Subscriber";
  const cap = CAPS[role];

  useEffect(() => {
    (async () => {
      const mode = await store.probe(); setStorageOk(mode !== "memory");
      const [u, p, m, c, t, pal, pr, css, js, html, act, cu, col] = await Promise.all([
        store.get("users", SEED_USERS), store.get("prompts", SEED_PROMPTS), store.get("media", []),
        store.get("collections", SEED_COLLECTIONS), store.get("theme", DEFAULT_THEME), store.get("palette", DEFAULT_PALETTE),
        store.get("presets", []), store.get("customCSS", customCSS), store.get("customJS", customJS),
        store.get("customHTML", customHTML), store.get("activity", SEED_ACTIVITY), store.get("currentUserId", 1),
        store.get("collapsed", window.matchMedia("(max-width:920px)").matches),
      ]);
      setUsers(u); setPrompts(p); setMedia(m); setCollections(c); setTheme({ ...DEFAULT_THEME, ...t });
      // Persist the seed users list on first mount so the chatbot at / can
      // read the signed-in user's name/role from localStorage. Without this
      // the users list stays in-memory only until an admin edits it.
      if (!localStorage.getItem("verdant:v2:users")) { try { localStorage.setItem("verdant:v2:users", JSON.stringify(u)); } catch {} }
      setPalette(pal); setPresets(pr); setCustomCSS(css); setCustomJS(js); setCustomHTML(html);
      setActivity(act); setCurrentUserId(cu); setCollapsed(col);
      setPosts(await store.get("posts", SEED_POSTS));
      const sess = await store.get("session", null);
      setSession(sess);
      if (sess) setCurrentUserId(sess);
      setLoaded(true);
    })();
  }, []); // eslint-disable-line

  const P = (k, v) => { if (loaded) store.set(k, v); };
  useEffect(() => P("users", users), [users]); // eslint-disable-line
  useEffect(() => P("prompts", prompts), [prompts]); // eslint-disable-line
  useEffect(() => P("media", media), [media]); // eslint-disable-line
  useEffect(() => P("collections", collections), [collections]); // eslint-disable-line
  useEffect(() => P("posts", posts), [posts]); // eslint-disable-line
  useEffect(() => P("session", session), [session]); // eslint-disable-line
  useEffect(() => P("theme", theme), [theme]); // eslint-disable-line
  useEffect(() => P("palette", palette), [palette]); // eslint-disable-line
  useEffect(() => P("presets", presets), [presets]); // eslint-disable-line
  useEffect(() => P("customCSS", customCSS), [customCSS]); // eslint-disable-line
  useEffect(() => P("customJS", customJS), [customJS]); // eslint-disable-line
  useEffect(() => P("customHTML", customHTML), [customHTML]); // eslint-disable-line
  useEffect(() => P("activity", activity), [activity]); // eslint-disable-line
  useEffect(() => P("currentUserId", currentUserId), [currentUserId]); // eslint-disable-line
  useEffect(() => P("collapsed", collapsed), [collapsed]); // eslint-disable-line

  const toast = (msg, icon = "check") => {
    const id = Math.random(); setToasts(t => [...t, { id, msg, icon }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
  };
  const logActivity = (what) => setActivity(a => [{ id: Date.now(), who: currentUser.name, what, when: "just now" }, ...a].slice(0, 20));

  const NAV = [
    { group: "Workspace", items: [
      { id: "overview", label: "Greenhouse", icon: LayoutDashboard, need: "read" },
      { id: "preview", label: "Live Bot Preview", icon: Eye, need: "read" },
    ] },
    { group: "Content", items: [
      { id: "posts", label: "Posts & Pages", icon: FileText, need: "read" },
      { id: "prompts", label: "Prompt Studio", icon: MessageSquareText, need: "read" },
      { id: "media", label: "Media Library", icon: ImageIcon, need: "read" },
    ] },
    { group: "System", items: [
      { id: "appearance", label: "Theme Studio", icon: Palette, need: "system" },
      { id: "code", label: "Code Editor", icon: Code2, need: "system" },
      { id: "users", label: "Users & Roles", icon: Users, need: "users" },
    ] },
  ];
  const titles = {
    overview: ["Greenhouse", "Everything growing across your advisor at a glance."],
    preview: ["Live Bot Preview", "See the advisor exactly as visitors will."],
    posts: ["Posts & Pages", "Write articles and pages with a draft-to-publish review workflow."],
    prompts: ["Prompt Studio", "Craft, version, and publish the instructions behind every answer."],
    media: ["Media Library", "Store, organize, edit, and archive imagery."],
    appearance: ["Theme Studio", "Restyle the chatbot - type, spacing, color, logo, imagery, presets."],
    code: ["Code Editor", "Inject custom CSS, JS, and head markup into the bot."],
    users: ["Users & Roles", "Add people, pick avatars, and assign exactly what they can do."],
    account: ["My Account", "Manage your profile, avatar, and preferences."],
  };
  const canOpen = (need) => cap[need];

  if (!loaded) return (
    <div className="vd"><style>{CSS}</style>
      <div className="boot"><div style={{ textAlign: "center" }}>
        <div className="m" style={{ margin: "0 auto 14px" }}><Sprout size={26} /></div>
        <div className="vd-display" style={{ fontSize: 19, fontWeight: 600 }}>Verdant</div>
        <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 4 }}>Loading your workspace...</div>
      </div></div>
    </div>
  );

  if (!session) return (
    <Login users={users} onLogin={(id) => { setSession(id); setCurrentUserId(id); toast(`Welcome back, ${users.find(u => u.id === id)?.name.split(" ")[0]}`, "shield"); }} />
  );

  return (
    <div className="vd" onClick={() => { setDdOpen(false); setNotifOpen(false); }}>
      <style>{CSS}</style>

      <aside className={`vd-side ${collapsed ? "col" : ""}`}>
        <div className="vd-brand">
          <div className="vd-brand-mark">{theme.logoSVG ? <span style={{ display: "grid", placeItems: "center" }} dangerouslySetInnerHTML={{ __html: theme.logoSVG }} /> : <Sprout size={20} />}</div>
          <div><h1>{theme.brandName || "Verdant"}</h1><small>{theme.brandTagline || "Advisor CMS"}</small></div>
        </div>
        {NAV.map(g => (
          <div className="vd-navgroup" key={g.group}>
            <div className="vd-navlabel">{g.group}</div>
            {g.items.map(it => {
              const locked = !canOpen(it.need); const Icon = it.icon;
              return (
                <button key={it.id} title={collapsed ? it.label : undefined}
                  className={`vd-nav ${view === it.id ? "active" : ""} ${locked ? "locked" : ""}`}
                  onClick={() => { if (locked) return toast(`${role}s can't open ${it.label}`, "lock"); setView(it.id); if (window.matchMedia("(max-width:920px)").matches) setCollapsed(true); }}>
                  <Icon size={17} /><span>{it.label}</span>{locked && !collapsed && <Lock size={13} className="lk" />}
                </button>
              );
            })}
          </div>
        ))}
        <div style={{ marginTop: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          <a className="vd-nav" href="/" title="Return to the Pollinator Garden Advisor chatbot" style={{ textDecoration: "none" }}>
            <Sprout size={17} /><span>Pollinator Garden Advisor</span>
          </a>
          <button className="vd-nav" onClick={() => setCollapsed(true)} title="Hide sidebar (reopen from the hamburger menu)">
            <PanelLeftClose size={17} /><span>Hide sidebar</span>
          </button>
        </div>
      </aside>

      <main className="vd-main">
        <div className="vd-topnav" onClick={e => e.stopPropagation()}>
          <button className="vd-iconbtn" onClick={() => setCollapsed(c => !c)} title={collapsed ? "Show sidebar" : "Hide sidebar"} aria-label={collapsed ? "Show sidebar" : "Hide sidebar"} aria-expanded={!collapsed}><Menu size={18} /></button>
          <div className="vd-search">
            <Search size={15} className="si" />
            <input placeholder="Search prompts, media, people..." value={search}
              onChange={e => { setSearch(e.target.value); setSearchOpen(!!e.target.value); }}
              onFocus={() => setSearchOpen(!!search)} />
            {searchOpen && <GlobalSearch q={search} users={users} prompts={prompts} media={media} posts={posts} go={(v) => { setView(v); setSearchOpen(false); setSearch(""); }} />}
          </div>
          <div className="vd-spacer" />
          <div className={`vd-storage ${storageOk ? "on" : ""}`} title={storageOk ? "Changes are saved to persistent storage" : "Storage unavailable - changes last this session"}>
            {storageOk ? <Cloud size={14} /> : <CloudOff size={14} />}{storageOk ? "Saved" : "Session"}
          </div>
          <button className="vd-iconbtn" onClick={() => { setNotifOpen(o => !o); setDdOpen(false); }} title="Activity">
            <Bell size={18} />{activity.length > 0 && <span className="dot" />}
            {notifOpen && (
              <div className="vd-dd" style={{ width: 320 }} onClick={e => e.stopPropagation()}>
                <div className="sec">Recent activity</div>
                {activity.slice(0, 8).map(a => (
                  <div key={a.id} style={{ padding: "9px 15px", display: "flex", gap: 9, fontSize: 12.5 }}>
                    <Avatar user={users.find(u => u.name === a.who)} size={26} />
                    <div><b>{a.who}</b> {a.what}<div className="hint">{a.when}</div></div>
                  </div>
                ))}
              </div>
            )}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setView("preview")}><Eye size={14} /> Preview</button>
          <div className="vd-profile" onClick={() => { setDdOpen(o => !o); setNotifOpen(false); }}>
            <Avatar user={currentUser} size={30} />
            <div><div className="nm">{currentUser.name}</div><div className="rl">{currentUser.role}</div></div>
            <ChevronDown size={15} color="var(--muted)" />
          </div>
          {ddOpen && (
            <div className="vd-dd" onClick={e => e.stopPropagation()}>
              <div className="hd"><Avatar user={currentUser} size={42} />
                <div><div style={{ fontWeight: 600 }}>{currentUser.name}</div><div className="hint">{currentUser.email}</div>
                  <span className={`badge ${ROLE_BADGE[currentUser.role]}`} style={{ marginTop: 4, fontSize: 10 }}>{currentUser.role}</span></div>
              </div>
              <button className="it" onClick={() => { setView("account"); setDdOpen(false); }}><UserCog size={16} /> My account & settings</button>
              <button className="it" onClick={() => { setView("account"); setDdOpen(false); }}><Camera size={16} /> Change avatar</button>
              <div className="sec">Switch user (demo)</div>
              {users.map(u => (
                <button key={u.id} className="it" onClick={() => { setCurrentUserId(u.id); setSession(u.id); setDdOpen(false); toast(`Signed in as ${u.name}`, "shield"); }}>
                  <Avatar user={u} size={22} /> {u.name}
                  {u.id === currentUserId && <Check size={15} style={{ marginLeft: "auto", color: "var(--moss)" }} />}
                </button>
              ))}
              <button className="it" style={{ color: "#9b3a26", borderTop: "1px solid var(--mist)" }} onClick={() => { setSession(null); setDdOpen(false); toast("Signed out"); }}><LogOut size={16} /> Sign out</button>
            </div>
          )}
        </div>

        <div className="vd-head">
          <div className="vd-crumb"><Leaf size={13} /> Verdant <ChevronRight size={12} /> {titles[view][0]}</div>
          <h2>{titles[view][0]}</h2>
          <div className="sub">{titles[view][1]}</div>
        </div>

        <div className="vd-content">
          {view === "overview" && <Overview users={users} prompts={prompts} media={media} posts={posts} activity={activity} go={setView} storageOk={storageOk} />}
          {view === "preview" && <BotPreview theme={theme} customCSS={customCSS} prompts={prompts} big />}
          {view === "posts" && <PostsPages posts={posts} setPosts={setPosts} media={media} users={users} cap={cap} role={role} currentUser={currentUser} toast={toast} log={logActivity} />}
          {view === "prompts" && <PromptStudio prompts={prompts} setPrompts={setPrompts} cap={cap} role={role} currentUser={currentUser} toast={toast} log={logActivity} />}
          {view === "media" && <MediaLibrary media={media} setMedia={setMedia} collections={collections} setCollections={setCollections} cap={cap} currentUser={currentUser} toast={toast} log={logActivity} />}
          {view === "appearance" && (canOpen("system")
            ? <ThemeStudio theme={theme} setTheme={setTheme} palette={palette} setPalette={setPalette} presets={presets} setPresets={setPresets} setMedia={setMedia} customCSS={customCSS} prompts={prompts} toast={toast} log={logActivity} />
            : <LockedPane label="Theme Studio" role={role} />)}
          {view === "code" && (canOpen("system")
            ? <CodeEditor customCSS={customCSS} setCustomCSS={setCustomCSS} customJS={customJS} setCustomJS={setCustomJS} customHTML={customHTML} setCustomHTML={setCustomHTML} theme={theme} prompts={prompts} toast={toast} />
            : <LockedPane label="Code Editor" role={role} />)}
          {view === "users" && (canOpen("users")
            ? <UsersRoles users={users} setUsers={setUsers} toast={toast} log={logActivity} />
            : <LockedPane label="Users & Roles" role={role} />)}
          {view === "account" && <Account currentUser={currentUser} setUsers={setUsers} storageOk={storageOk} toast={toast} setView={setView} resetAll={async () => { await store.wipe(["users", "prompts", "media", "collections", "posts", "theme", "palette", "presets", "customCSS", "customJS", "customHTML", "activity", "currentUserId", "collapsed"]); toast("All data reset - reload to reseed", "shield"); }} />}
        </div>
      </main>

      <div className="toast-wrap">
        {toasts.map(t => (
          <div className="toast" key={t.id}>
            {t.icon === "lock" ? <Lock size={15} /> : t.icon === "shield" ? <Shield size={15} /> : <Check size={15} />}{t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- global search ----------------------------- */
function GlobalSearch({ q, users, prompts, media, posts, go }) {
  const s = q.toLowerCase();
  const po = (posts || []).filter(p => p.title.toLowerCase().includes(s)).slice(0, 4);
  const pr = prompts.filter(p => p.name.toLowerCase().includes(s)).slice(0, 4);
  const us = users.filter(u => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)).slice(0, 4);
  const me = media.filter(m => m.name.toLowerCase().includes(s)).slice(0, 4);
  const none = !po.length && !pr.length && !us.length && !me.length;
  return (
    <div className="vd-dd" style={{ top: 46, right: "auto", left: 0, width: "100%" }} onClick={e => e.stopPropagation()}>
      {none && <div style={{ padding: 16, color: "var(--muted)", fontSize: 13 }}>No matches for "{q}".</div>}
      {po.length > 0 && <div className="sec">Posts & pages</div>}
      {po.map(p => <button key={"po" + p.id} className="it" onClick={() => go("posts")}><FileText size={15} /> {p.title}</button>)}
      {pr.length > 0 && <div className="sec">Prompts</div>}
      {pr.map(p => <button key={"p" + p.id} className="it" onClick={() => go("prompts")}><MessageSquareText size={15} /> {p.name}</button>)}
      {us.length > 0 && <div className="sec">People</div>}
      {us.map(u => <button key={"u" + u.id} className="it" onClick={() => go("users")}><Avatar user={u} size={20} /> {u.name}</button>)}
      {me.length > 0 && <div className="sec">Media</div>}
      {me.map(m => <button key={"m" + m.id} className="it" onClick={() => go("media")}><ImageIcon size={15} /> {m.name}</button>)}
    </div>
  );
}

/* ============================== OVERVIEW ================================== */
function Overview({ users, prompts, media, posts, activity, go, storageOk }) {
  const [note, setNote] = useState("Spring native-plant push: prioritize regional pollinator guides this week.");
  const [editingNote, setEditingNote] = useState(false);
  const stats = [
    { v: "1,284", k: "Conversations this month", icon: MessageSquareText },
    { v: String((posts || []).filter(p => p.status === "published").length), k: "Published posts & pages", icon: FileText },
    { v: String(prompts.filter(p => p.status === "active").length), k: "Active prompts", icon: Wand2 },
    { v: String(media.length), k: "Media items", icon: ImageIcon },
    { v: String(users.length), k: "Team members", icon: Users },
  ];
  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
      <div className="card" style={{ display: "flex", gap: 14, alignItems: "center", background: "linear-gradient(120deg,#f3f7ed,#fafbf6)" }}>
        <div className="card-h" style={{ margin: 0 }}><div className="ico"><Sun size={17} /></div></div>
        <div style={{ flex: 1 }}>
          <div className="hint" style={{ marginBottom: 2 }}>Team announcement</div>
          {editingNote
            ? <input className="inp" value={note} autoFocus onChange={e => setNote(e.target.value)} onBlur={() => setEditingNote(false)} onKeyDown={e => e.key === "Enter" && setEditingNote(false)} />
            : <div style={{ fontWeight: 600, fontSize: 14.5 }}>{note}</div>}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditingNote(e => !e)}><Pencil size={13} /> {editingNote ? "Done" : "Edit"}</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        {stats.map(s => { const I = s.icon; return (
          <div className="stat" key={s.k}><div className="v">{s.v}</div><div className="k"><I size={14} /> {s.k}</div><I size={64} className="spark" /></div>
        ); })}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <div className="card">
          <div className="card-h"><div className="ico"><Sprout size={17} /></div><h3>Quick actions</h3></div>
          <p className="card-desc">Jump straight into the work.</p>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
            <QuickTile icon={FileText} t="Write a post" d="Draft, review, publish" onClick={() => go("posts")} />
            <QuickTile icon={Palette} t="Restyle the bot" d="Type, color, presets" onClick={() => go("appearance")} />
            <QuickTile icon={MessageSquareText} t="Edit a prompt" d="Versions & variables" onClick={() => go("prompts")} />
            <QuickTile icon={ImagePlus} t="Add imagery" d="Upload & organize" onClick={() => go("media")} />
            <QuickTile icon={Users} t="Manage people" d="Roles & avatars" onClick={() => go("users")} />
          </div>
        </div>
        <div className="card">
          <div className="card-h"><div className="ico"><Leaf size={17} /></div><h3>Recent activity</h3></div>
          <p className="card-desc">Latest changes by your team.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {activity.slice(0, 5).map(a => (
              <div key={a.id} style={{ display: "flex", gap: 11, alignItems: "flex-start", fontSize: 13 }}>
                <Avatar user={users.find(u => u.name === a.who)} size={28} />
                <div><b>{a.who}</b> {a.what}<div className="hint">{a.when}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div className="ico" style={{ width: 44, height: 44, borderRadius: 12 }}><Bug size={22} /></div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h3 className="vd-display" style={{ margin: 0, fontSize: 18 }}>Knowledge base connected</h3>
          <p className="card-desc" style={{ margin: "4px 0 0" }}>Prairie Moon cultural guides, regional Pollinator-Friendly Planting Guides, germination codes, and site-prep brochures.</p>
        </div>
        <span className="badge b-active"><Check size={12} /> Synced</span>
        <span className={`badge ${storageOk ? "b-active" : "b-arch"}`}>{storageOk ? <Cloud size={12} /> : <CloudOff size={12} />} {storageOk ? "Persistent storage on" : "Session storage"}</span>
      </div>
    </div>
  );
}
function QuickTile({ icon: I, t, d, onClick }) {
  return (
    <button onClick={onClick} style={{ textAlign: "left", border: "1px solid var(--mist)", background: "#f3f7ed", borderRadius: 13, padding: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 12, alignItems: "center" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--paper)", display: "grid", placeItems: "center", color: "var(--moss)", flex: "0 0 36px" }}><I size={18} /></div>
      <div><div style={{ fontWeight: 600, fontSize: 13.5 }}>{t}</div><div style={{ color: "var(--muted)", fontSize: 12 }}>{d}</div></div>
    </button>
  );
}

/* ============================ AVATAR PICKER ============================== */
function AvatarPicker({ value, name, onChange }) {
  const fileRef = useRef();
  const onUpload = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => onChange({ type: "image", src: String(r.result) }); r.readAsDataURL(f);
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
        <Avatar user={{ name, avatar: value }} size={64} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()}><Upload size={13} /> Upload photo</button>
          {value && <button className="btn btn-ghost btn-sm" onClick={() => onChange(null)}><RotateCcw size={13} /> Use initials</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
      </div>
      <div className="hint" style={{ marginBottom: 8 }}>Or choose a botanical avatar</div>
      <div className="avgrid">
        {PRESET_AVATARS.map(p => {
          const I = AV_ICONS[p.icon]; const on = value?.type === "preset" && value.id === p.id;
          return <button key={p.id} className={`avopt ${on ? "on" : ""}`} style={{ background: p.bg }} onClick={() => onChange({ type: "preset", id: p.id })}><I size={22} /></button>;
        })}
      </div>
    </div>
  );
}

/* ============================ THEME STUDIO =============================== */
function ThemeStudio({ theme, setTheme, palette, setPalette, presets, setPresets, setMedia, customCSS, prompts, toast, log }) {
  const set = (k, v) => setTheme(t => ({ ...t, [k]: v }));
  const fileRef = useRef(); const svgRef = useRef();
  const [imgFilters, setImgFilters] = useState({ brightness: 100, contrast: 100, saturate: 100, sepia: 0, blur: 0, grayscale: 0, hue: 0 });
  const [editImg, setEditImg] = useState(null);
  const FONTS = [
    { label: "Fraunces (serif)", v: "'Fraunces',serif" }, { label: "DM Sans", v: "'DM Sans',sans-serif" },
    { label: "JetBrains Mono", v: "'JetBrains Mono',monospace" }, { label: "Georgia", v: "Georgia,serif" }, { label: "System UI", v: "system-ui,sans-serif" },
  ];
  const onSVG = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { set("logoSVG", sanitizeSVG(String(r.result))); toast("Logo SVG applied"); }; r.readAsText(f); };
  const onImg = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { setEditImg(String(r.result)); setImgFilters({ brightness: 100, contrast: 100, saturate: 100, sepia: 0, blur: 0, grayscale: 0, hue: 0 }); }; r.readAsDataURL(f); };
  const filterStr = `brightness(${imgFilters.brightness}%) contrast(${imgFilters.contrast}%) saturate(${imgFilters.saturate}%) sepia(${imgFilters.sepia}%) blur(${imgFilters.blur}px) grayscale(${imgFilters.grayscale}%) hue-rotate(${imgFilters.hue}deg)`;
  const saveEdited = async () => { const id = Date.now(); const dims = await readDims(editImg); const url = await assetStore.put(id, editImg); setMedia(m => [{ id, name: `edited-${m.length + 1}.png`, url, filter: filterStr, tags: ["edited"], collection: "c1", archived: false, added: "just now", type: "image/png", size: Math.round((editImg.length * 3) / 4), w: dims.w, h: dims.h }, ...m]); toast("Saved to Media Library"); setEditImg(null); };
  const savePreset = () => { setPresets(p => [...p, { id: Date.now(), name: `Preset ${p.length + 1}`, theme: { ...theme }, palette: [...palette] }]); toast("Theme preset saved"); log("saved a theme preset"); };
  const applyPreset = (pr) => { setTheme({ ...DEFAULT_THEME, ...pr.theme }); if (pr.palette) setPalette(pr.palette); toast(`Applied ${pr.name}`); };
  const exportTheme = () => { const blob = JSON.stringify({ theme, palette }, null, 2); navigator.clipboard?.writeText(blob); toast("Theme JSON copied to clipboard"); };

  return (
    <div className="grid" style={{ gridTemplateColumns: "1.15fr .85fr", alignItems: "start" }}>
      <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="card">
          <div className="card-h"><div className="ico"><Star size={17} /></div><h3>Theme presets</h3></div>
          <p className="card-desc">Save the current look or apply a saved one.</p>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
            {presets.length === 0 && <span className="hint">No presets yet.</span>}
            {presets.map(pr => (
              <div key={pr.id} style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid var(--mist)", borderRadius: 10, padding: "5px 5px 5px 11px" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{pr.name}</span>
                <span style={{ display: "flex", gap: 2, margin: "0 4px" }}>{(pr.palette || []).slice(0, 4).map((c, i) => <span key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c.hex }} />)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => applyPreset(pr)}>Apply</button>
                <button className="vd-iconbtn" style={{ width: 28, height: 28 }} onClick={() => setPresets(p => p.filter(x => x.id !== pr.id))}><X size={13} /></button>
              </div>
            ))}
            <button className="btn btn-primary btn-sm" onClick={savePreset}><Plus size={14} /> Save current</button>
            <button className="btn btn-ghost btn-sm" onClick={exportTheme}><Download size={14} /> Export JSON</button>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><div className="ico"><Type size={17} /></div><h3>Typography</h3></div>
          <p className="card-desc">Fonts, scale, and spacing for the advisor's voice.</p>
          <div className="two">
            <div className="field"><label>Display font</label><select className="sel" value={theme.fdisp} onChange={e => set("fdisp", e.target.value)}>{FONTS.map(f => <option key={f.v} value={f.v}>{f.label}</option>)}</select></div>
            <div className="field"><label>Body font</label><select className="sel" value={theme.fbody} onChange={e => set("fbody", e.target.value)}>{FONTS.map(f => <option key={f.v} value={f.v}>{f.label}</option>)}</select></div>
          </div>
          <Range label="Base size" min={12} max={20} val={theme.size} unit="px" onChange={v => set("size", v)} />
          <Range label="Line height" min={1.2} max={2} step={0.05} val={theme.lh} unit="" onChange={v => set("lh", v)} />
          <Range label="Letter spacing" min={-2} max={4} step={0.5} val={theme.ls} unit="px" onChange={v => set("ls", v)} display={`${theme.ls}px`} />
          <Range label="Heading weight" min={400} max={700} step={100} val={theme.hw} unit="" onChange={v => set("hw", v)} />
        </div>

        <div className="card">
          <div className="card-h"><div className="ico"><Palette size={17} /></div><h3>Color palette</h3></div>
          <p className="card-desc">Brand swatches - click a chip to recolor.</p>
          <div className="swatches">
            {palette.map((sw, i) => (
              <div className="swatch" key={i}>
                <div className="chip" style={{ background: sw.hex }}><input type="color" value={sw.hex} onChange={e => setPalette(p => p.map((x, j) => j === i ? { ...x, hex: e.target.value } : x))} /></div>
                <div className="meta">
                  <input style={{ border: "none", background: "transparent", width: "100%", fontWeight: 600, fontSize: 11.5 }} value={sw.name} onChange={e => setPalette(p => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <div className="hx">{sw.hex}</div>
                </div>
              </div>
            ))}
            <button className="swatch" style={{ display: "grid", placeItems: "center", minHeight: 100, color: "var(--muted)", cursor: "pointer", background: "#f3f7ed" }} onClick={() => setPalette(p => [...p, { name: "New", hex: "#7ba05b" }])}><Plus size={20} /></button>
          </div>
          <div style={{ height: 1, background: "var(--mist)", margin: "18px 0" }} />
          <p className="card-desc" style={{ marginBottom: 12 }}>Interface colors - applied to the live preview.</p>
          <div className="two">
            <ColorField label="Primary" v={theme.primary} on={v => set("primary", v)} />
            <ColorField label="Accent" v={theme.accent} on={v => set("accent", v)} />
            <ColorField label="Background" v={theme.bg} on={v => set("bg", v)} />
            <ColorField label="Surface" v={theme.surface} on={v => set("surface", v)} />
            <ColorField label="User bubble" v={theme.user} on={v => set("user", v)} />
            <ColorField label="Bot bubble" v={theme.bot} on={v => set("bot", v)} />
          </div>
          <div className="two">
            <Range label="Bubble radius" min={0} max={28} val={theme.radius} unit="px" onChange={v => set("radius", v)} />
            <Range label="Input/button radius" min={0} max={28} val={theme.btnRadius} unit="px" onChange={v => set("btnRadius", v)} />
          </div>
          <label style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13, marginTop: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={theme.gradient} onChange={e => set("gradient", e.target.checked)} /> Soft gradient backdrop
          </label>
        </div>

        <div className="card">
          <div className="card-h"><div className="ico"><FileCode2 size={17} /></div><h3>Brand identity</h3></div>
          <p className="card-desc">Rename the dashboard, edit the tagline, and swap the logo mark. Changes show in the sidebar header and the chat terrarium's brand pill.</p>
          <div className="two" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Dashboard name</label>
              <input className="inp" value={theme.brandName ?? "Verdant"} onChange={e => set("brandName", e.target.value)} placeholder="Verdant" maxLength={40} />
              <div className="hint">Shown as the H1 in the sidebar header.</div>
            </div>
            <div className="field">
              <label>Tagline</label>
              <input className="inp" value={theme.brandTagline ?? "Advisor CMS"} onChange={e => set("brandTagline", e.target.value)} placeholder="Advisor CMS" maxLength={60} />
              <div className="hint">Small eyebrow text below the name.</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ width: 64, height: 64, borderRadius: 14, background: theme.primary, display: "grid", placeItems: "center", color: "#fff", overflow: "hidden" }}>
              {theme.logoSVG ? <span style={{ width: 40, height: 40, display: "grid", placeItems: "center" }} dangerouslySetInnerHTML={{ __html: theme.logoSVG }} /> : <Sprout size={30} />}
            </div>
            <button className="btn btn-ghost" onClick={() => svgRef.current.click()}><Upload size={15} /> Upload SVG</button>
            {theme.logoSVG && <button className="btn btn-danger" onClick={() => set("logoSVG", null)}><RotateCcw size={15} /> Reset logo</button>}
            <input ref={svgRef} type="file" accept=".svg,image/svg+xml" hidden onChange={onSVG} />
          </div>
        </div>

        <div className="card">
          <div className="card-h"><div className="ico"><Sliders size={17} /></div><h3>Imagery & editing</h3></div>
          <p className="card-desc">Upload an image, adjust it, then save to the library.</p>
          {!editImg ? (
            <div className="dropzone" onClick={() => fileRef.current.click()}><Upload size={26} style={{ marginBottom: 8 }} /><div style={{ fontWeight: 600, color: "var(--ink)" }}>Click to upload an image</div><div className="hint">PNG, JPG, or WebP</div></div>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "160px 1fr", gap: 16, alignItems: "start" }}>
              <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--mist)" }}><img src={editImg} alt="" style={{ width: "100%", display: "block", filter: filterStr }} /></div>
              <div>
                <Range label="Brightness" min={0} max={200} val={imgFilters.brightness} unit="%" onChange={v => setImgFilters(f => ({ ...f, brightness: v }))} />
                <Range label="Contrast" min={0} max={200} val={imgFilters.contrast} unit="%" onChange={v => setImgFilters(f => ({ ...f, contrast: v }))} />
                <Range label="Saturation" min={0} max={200} val={imgFilters.saturate} unit="%" onChange={v => setImgFilters(f => ({ ...f, saturate: v }))} />
                <Range label="Sepia" min={0} max={100} val={imgFilters.sepia} unit="%" onChange={v => setImgFilters(f => ({ ...f, sepia: v }))} />
                <Range label="Blur" min={0} max={8} step={0.5} val={imgFilters.blur} unit="px" onChange={v => setImgFilters(f => ({ ...f, blur: v }))} />
                <Range label="Hue rotate" min={0} max={360} val={imgFilters.hue} unit="deg" onChange={v => setImgFilters(f => ({ ...f, hue: v }))} />
                <div style={{ display: "flex", gap: 9, marginTop: 10, flexWrap: "wrap" }}>
                  <button className="btn btn-primary" onClick={saveEdited}><Save size={15} /> Save to library</button>
                  <button className="btn btn-ghost" onClick={() => setImgFilters({ brightness: 100, contrast: 100, saturate: 100, sepia: 0, blur: 0, grayscale: 0, hue: 0 })}><RotateCcw size={15} /> Reset</button>
                  <button className="btn btn-danger" onClick={() => setEditImg(null)}><X size={15} /> Discard</button>
                </div>
              </div>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onImg} />
        </div>
      </div>

      <div style={{ position: "sticky", top: 92 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)", marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}><Eye size={13} /> Live preview</div>
        <BotPreview theme={theme} customCSS={customCSS} prompts={prompts} />
      </div>
    </div>
  );
}
function Range({ label, min, max, step = 1, val, unit, onChange, display }) {
  return (
    <div className="field"><label>{label}</label>
      <div className="rng"><input type="range" min={min} max={max} step={step} value={val} onChange={e => onChange(parseFloat(e.target.value))} /><span className="val">{display ?? `${val}${unit}`}</span></div>
    </div>
  );
}
function ColorField({ label, v, on }) {
  return (
    <div className="field"><label>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ position: "relative", width: 38, height: 38, borderRadius: 9, overflow: "hidden", border: "1px solid var(--mist-2)", background: v }}><input type="color" value={v} onChange={e => on(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} /></div>
        <input className="inp vd-mono" style={{ textTransform: "uppercase" }} value={v} onChange={e => on(e.target.value)} />
      </div>
    </div>
  );
}

/* ============================ BOT PREVIEW =============================== */
function BotPreview({ theme, customCSS, prompts, big }) {
  const active = prompts.find(p => p.status === "active") || prompts[0];
  const [msgs, setMsgs] = useState([{ who: "bot", t: "Hi! I'm your <b>Gardening Advisor</b>. Ask me about native plants, pollinators, seed starting, or prepping a new bed.", raw: "Hi! I'm your Gardening Advisor. Ask me about native plants, pollinators, seed starting, or prepping a new bed." }]);
  const [input, setInput] = useState(""); const [busy, setBusy] = useState(false); const bodyRef = useRef();

  const send = async (text) => {
    const q = (text ?? input).trim(); if (!q || busy) return;
    const userMsg = { who: "user", t: q, raw: q };
    const history = [...msgs, userMsg].map(m => ({ role: m.who === "user" ? "user" : "assistant", content: m.raw ?? stripTags(m.t) }));
    setMsgs(m => [...m, userMsg]); setInput("");

    if (!AGENT_URL) { // demo mode — no endpoint configured
      setTimeout(() => { const html = replyFor(q); setMsgs(m => [...m, { who: "bot", t: html, raw: stripTags(html) }]); }, 280);
      return;
    }

    setBusy(true);
    setMsgs(m => [...m, { who: "bot", t: "…", raw: "", streaming: true }]);
    let acc = "";
    try {
      await streamChat({
        url: AGENT_URL,
        messages: history,
        system: active?.body || undefined,
        model: realModel(active?.model),
        maxTokens: active?.maxTokens,
        temperature: active?.temp,
        topP: active?.topP,
        onText: (delta) => { acc += delta; setMsgs(m => m.map((x, i) => (i === m.length - 1 && x.streaming) ? { ...x, t: mdToHtml(acc), raw: acc } : x)); },
      });
      setMsgs(m => m.map((x, i) => (i === m.length - 1) ? { ...x, streaming: false, t: mdToHtml(acc || "*(no response)*"), raw: acc } : x));
    } catch (e) {
      setMsgs(m => m.map((x, i) => (i === m.length - 1 && x.streaming) ? { ...x, streaming: false, t: `<i>⚠ ${stripTags(String(e.message || e))}</i>`, raw: "" } : x));
    } finally { setBusy(false); }
  };
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [msgs]);
  const styleVars = { "--b-primary": theme.primary, "--b-bg": theme.bg, "--b-surface": theme.surface, "--b-user": theme.user, "--b-bot": theme.bot, "--b-text": theme.text, "--b-accent": theme.accent, "--b-radius": theme.radius + "px", "--b-btnr": (theme.btnRadius ?? 24) + "px", "--b-fdisp": theme.fdisp, "--b-fbody": theme.fbody, "--b-size": theme.size + "px", "--b-lh": theme.lh, "--b-ls": theme.ls + "px", "--b-hw": theme.hw };
  const chips = ["Plants for pollinators?", "What's a Code C seed?", "How do I prep a new bed?"];
  const scoped = (customCSS || "").replace(/(^|})\s*([^{}]+)\s*{/g, (m, p, sel) => `${p} .terr ${sel.trim()}{`);
  return (
    <div style={{ maxWidth: big ? 620 : "none", margin: big ? "0 auto" : 0 }}>
      <div className={`terr ${theme.gradient ? "grad" : ""}`} style={styleVars}>
        <style>{scoped}</style>
        <div className="terr-head">
          <div className="terr-logo">{theme.logoSVG ? <span dangerouslySetInnerHTML={{ __html: theme.logoSVG }} /> : <Sprout size={22} />}</div>
          <div><div className="terr-title">Gardening Advisor</div><div className="terr-sub">{AGENT_URL ? "● Live agent" : "○ Demo replies"} · {active ? `prompt: ${active.name}` : "no active prompt"}</div></div>
        </div>
        <div className="terr-body" ref={bodyRef}>
          {msgs.map((m, i) => <div key={i} className={`bub ${m.who}`} dangerouslySetInnerHTML={{ __html: m.t }} />)}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 2 }}>{chips.map(c => <button key={c} className="terr-chip" onClick={() => send(c)}>{c}</button>)}</div>
        </div>
        <div className="terr-input"><input value={input} disabled={busy} onChange={e => setInput(e.target.value)} placeholder={busy ? "Advisor is typing…" : "Ask the advisor..."} onKeyDown={e => e.key === "Enter" && send()} /><button className="terr-send" onClick={() => send()} disabled={busy}><Send size={17} /></button></div>
      </div>
      {big && <div className="notice" style={{ marginTop: 16 }}><Wand2 size={16} style={{ flex: "0 0 16px", marginTop: 1 }} /><div>{AGENT_URL
        ? <>Connected to the live Gardening Advisor agent at <span className="vd-mono" style={{ fontSize: 11 }}>{AGENT_URL}</span>. Messages stream from the agent using the <b>{active?.name}</b> prompt as its system prompt.</>
        : <>Demo mode — replies are canned. Set <span className="vd-mono" style={{ fontSize: 11 }}>VITE_AGENT_URL</span> to stream from the live agent, which will use the <b>{active?.name}</b> prompt.</>}</div></div>}
    </div>
  );
}

/* ============================ MEDIA LIBRARY ============================= */
function MediaLibrary({ media, setMedia, collections, setCollections, cap, currentUser, toast, log }) {
  const [q, setQ] = useState(""); const [tab, setTab] = useState("active"); const [layout, setLayout] = useState("grid");
  const [sort, setSort] = useState("new"); const [coll, setColl] = useState("all"); const [picked, setPicked] = useState([]);
  const [detail, setDetail] = useState(null); const fileRef = useRef();
  const [urlModal, setUrlModal] = useState(false); const [urlForm, setUrlForm] = useState({ url: "", name: "" });
  const onFiles = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => {
      const r = new FileReader();
      r.onload = async () => {
        const id = Date.now() + Math.random();
        const dataUrl = String(r.result);
        const dims = await readDims(dataUrl);
        const url = await assetStore.put(id, dataUrl); // binary -> its own key, returns a URL reference
        setMedia(m => [{ id, name: f.name, url, tags: [], alt: "", collection: "c2", archived: false, added: "just now", type: f.type || "image", size: f.size, w: dims.w, h: dims.h, uploadedBy: currentUser?.name }, ...m]);
      };
      r.readAsDataURL(f);
    });
    if (files.length) { toast(`${files.length} image${files.length > 1 ? "s" : ""} uploaded`); log(`uploaded ${files.length} image(s)`); }
  };
  const addByUrl = () => {
    if (!urlForm.url.trim()) return toast("Enter an image URL", "lock");
    const name = urlForm.name.trim() || urlForm.url.split("/").pop()?.split("?")[0] || "linked-image";
    setMedia(m => [{ id: Date.now(), name, url: urlForm.url.trim(), tags: ["external"], alt: "", collection: "c3", archived: false, added: "just now", type: "external", size: 0, w: 0, h: 0, uploadedBy: currentUser?.name }, ...m]);
    setUrlModal(false); setUrlForm({ url: "", name: "" }); toast("Linked image added");
  };
  const upd = (id, patch) => setMedia(m => m.map(x => x.id === id ? { ...x, ...patch } : x));
  const remove = (id) => { const it = media.find(x => x.id === id); if (it) assetStore.del(it.url); setMedia(m => m.filter(x => x.id !== id)); setDetail(null); toast("Removed"); };
  const toggleArch = (id) => upd(id, { archived: !media.find(m => m.id === id).archived });
  const togglePick = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  let list = media.filter(m => tab === "archived" ? m.archived : !m.archived)
    .filter(m => coll === "all" || m.collection === coll)
    .filter(m => m.name.toLowerCase().includes(q.toLowerCase()) || (m.tags || []).some(t => t.includes(q.toLowerCase())));
  list = [...list].sort((a, b) => sort === "new" ? b.id - a.id : sort === "old" ? a.id - b.id : a.name.localeCompare(b.name));

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}><Search size={15} style={{ position: "absolute", left: 11, top: 11, color: "var(--muted)" }} /><input className="inp" style={{ paddingLeft: 34 }} placeholder="Search by name or tag..." value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="sel" style={{ width: "auto" }} value={coll} onChange={e => setColl(e.target.value)}>
          <option value="all">All collections</option>{collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="sel" style={{ width: "auto" }} value={sort} onChange={e => setSort(e.target.value)}><option value="new">Newest</option><option value="old">Oldest</option><option value="name">Name A-Z</option></select>
        <div className="seg"><button className={layout === "grid" ? "on" : ""} onClick={() => setLayout("grid")}><LayoutGrid size={14} /></button><button className={layout === "list" ? "on" : ""} onClick={() => setLayout("list")}><List size={14} /></button></div>
        <div className="seg"><button className={tab === "active" ? "on" : ""} onClick={() => setTab("active")}>Active</button><button className={tab === "archived" ? "on" : ""} onClick={() => setTab("archived")}>Archived</button></div>
        <button className="btn btn-ghost" onClick={() => setUrlModal(true)} disabled={!cap.createOwn}><Link2 size={15} /> Add URL</button>
        <button className="btn btn-primary" onClick={() => fileRef.current.click()} disabled={!cap.createOwn}><Upload size={15} /> Upload</button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <span className="hint" style={{ marginRight: 2 }}><Folder size={13} style={{ verticalAlign: -2 }} /> Collections:</span>
        {collections.map(c => <span key={c.id} className="badge" style={{ background: "#eef3e6", color: "var(--moss)" }}>{c.name}</span>)}
        <button className="btn btn-ghost btn-sm" onClick={() => setCollections(cs => [...cs, { id: "c" + Date.now(), name: `Collection ${cs.length + 1}` }])}><FolderPlus size={13} /> New collection</button>
      </div>

      {picked.length > 0 && (
        <div className="card" style={{ padding: "11px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <b>{picked.length} selected</b>
          <button className="btn btn-ghost btn-sm" onClick={() => { picked.forEach(id => toggleArch(id)); setPicked([]); toast("Archived selection"); }} disabled={!cap.createOwn}><Archive size={13} /> Archive</button>
          <button className="btn btn-danger btn-sm" onClick={() => { picked.forEach(id => { const it = media.find(x => x.id === id); if (it) assetStore.del(it.url); }); setMedia(m => m.filter(x => !picked.includes(x.id))); setPicked([]); toast("Deleted selection"); }} disabled={!cap.deleteAny}><Trash2 size={13} /> Delete</button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => setPicked([])}>Clear</button>
        </div>
      )}

      {!cap.createOwn && <div className="notice" style={{ marginBottom: 16 }}><Lock size={15} /><div>Your role can view the library but can't upload or edit items.</div></div>}

      {list.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "46px 20px", color: "var(--muted)" }}><ImageIcon size={34} style={{ marginBottom: 10, opacity: .5 }} /><div style={{ fontWeight: 600, color: "var(--ink)" }}>{tab === "archived" ? "Nothing archived yet" : "No images here"}</div><div className="hint">{tab === "archived" ? "Archived images collect here." : "Upload imagery to use across the advisor."}</div></div>
      ) : layout === "grid" ? (
        <div className="media-grid">
          {list.map(m => (
            <div className={`media-item ${picked.includes(m.id) ? "sel" : ""}`} key={m.id} onClick={() => setDetail(m)}>
              <div className="pick" onClick={e => { e.stopPropagation(); togglePick(m.id); }}>{picked.includes(m.id) && <Check size={13} />}</div>
              <div className="thumb"><MediaImg url={m.url} alt={m.alt || m.name} filter={m.filter} fallback={<ImageIcon size={26} style={{ opacity: .4 }} />} /></div>
              <div className="mbar"><div className="nm">{m.name}</div>{(m.tags || []).length > 0 && <div className="hint" style={{ marginTop: 3 }}>#{m.tags.join(" #")}</div>}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl"><thead><tr><th>Image</th><th>Collection</th><th>Tags</th><th style={{ textAlign: "right" }}>Manage</th></tr></thead>
            <tbody>{list.map(m => (
              <tr key={m.id}>
                <td><div style={{ display: "flex", gap: 11, alignItems: "center" }}><div style={{ width: 40, height: 40, borderRadius: 9, overflow: "hidden", background: "#eef3e6", flex: "0 0 40px" }}><MediaImg url={m.url} filter={m.filter} fallback={<ImageIcon size={16} style={{ opacity: .4 }} />} /></div><div style={{ fontWeight: 600 }}>{m.name}</div></div></td>
                <td className="hint">{collections.find(c => c.id === m.collection)?.name || "-"}</td>
                <td className="hint">{(m.tags || []).map(t => "#" + t).join(" ") || "-"}</td>
                <td style={{ textAlign: "right" }}><button className="btn btn-ghost btn-sm" onClick={() => setDetail(m)}><Pencil size={13} /> Edit</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="drawer" onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}><h3 className="vd-display" style={{ margin: 0, fontSize: 18 }}>Image details</h3><button className="vd-iconbtn" style={{ marginLeft: "auto" }} onClick={() => setDetail(null)}><X size={18} /></button></div>
          <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--mist)", marginBottom: 12, background: "#eef3e6" }}><MediaImg url={detail.url} alt={detail.alt} filter={detail.filter} style={{ height: "auto", maxHeight: 240 }} /></div>
          <div className="card" style={{ padding: "10px 12px", marginBottom: 14, background: "#f3f7ed", fontSize: 11.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span className="hint">Type</span><span>{detail.type || "image"}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span className="hint">Size</span><span>{detail.type === "external" ? "linked" : fmtBytes(detail.size)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span className="hint">Dimensions</span><span>{detail.w ? `${detail.w} × ${detail.h}` : "—"}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", alignItems: "center", gap: 8 }}><span className="hint">Source</span><span className="vd-mono" style={{ fontSize: 10.5, wordBreak: "break-all", textAlign: "right" }}>{(detail.url || "").startsWith("verdant-asset://") ? "asset store (blob key)" : <a href={detail.url} target="_blank" rel="noopener" style={{ color: "var(--moss)" }}>external URL <ExternalLink size={10} style={{ verticalAlign: -1 }} /></a>}</span></div>
          </div>
          <div className="field"><label>File name</label><input className="inp" value={detail.name} onChange={e => { upd(detail.id, { name: e.target.value }); setDetail(d => ({ ...d, name: e.target.value })); }} /></div>
          <div className="field"><label>Alt text (accessibility)</label><input className="inp" value={detail.alt || ""} placeholder="Describe the image..." onChange={e => { upd(detail.id, { alt: e.target.value }); setDetail(d => ({ ...d, alt: e.target.value })); }} /></div>
          <div className="field"><label>Collection</label><select className="sel" value={detail.collection || ""} onChange={e => { upd(detail.id, { collection: e.target.value }); setDetail(d => ({ ...d, collection: e.target.value })); }}>{collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <TagEditor tags={detail.tags || []} onChange={(tags) => { upd(detail.id, { tags }); setDetail(d => ({ ...d, tags })); }} />
          <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => toggleArch(detail.id)} disabled={!cap.createOwn}>{detail.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} {detail.archived ? "Restore" : "Archive"}</button>
            <button className="btn btn-danger" style={{ marginLeft: "auto" }} onClick={() => remove(detail.id)} disabled={!cap.deleteAny}><Trash2 size={15} /> Delete</button>
          </div>
        </div>
      )}

      {urlModal && (
        <div className="modal-bg" onClick={() => setUrlModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h3>Add image by URL</h3>
            <p className="card-desc">Reference an image hosted on a CDN or external site. Nothing is stored locally — only the link.</p>
            <div className="field"><label>Image URL</label><input className="inp" value={urlForm.url} onChange={e => setUrlForm(f => ({ ...f, url: e.target.value }))} placeholder="https://cdn.example.com/coneflower.jpg" /></div>
            <div className="field"><label>Display name (optional)</label><input className="inp" value={urlForm.name} onChange={e => setUrlForm(f => ({ ...f, name: e.target.value }))} placeholder="Purple coneflower" /></div>
            <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setUrlModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addByUrl}><Link2 size={15} /> Add image</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function TagEditor({ tags, onChange }) {
  const [v, setV] = useState("");
  const add = () => { const t = v.trim().toLowerCase(); if (t && !tags.includes(t)) onChange([...tags, t]); setV(""); };
  return (
    <div className="field"><label>Tags</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 8 }}>
        {tags.map(t => <span key={t} className="badge" style={{ background: "#eef3e6", color: "var(--moss)" }}><Hash size={11} />{t}<button onClick={() => onChange(tags.filter(x => x !== t))} style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", display: "grid", placeItems: "center" }}><X size={11} /></button></span>)}
      </div>
      <div style={{ display: "flex", gap: 8 }}><input className="inp" placeholder="Add a tag..." value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} /><button className="btn btn-ghost" onClick={add}><Tag size={14} /> Add</button></div>
    </div>
  );
}

/* ============================ USERS & ROLES ============================= */
function UsersRoles({ users, setUsers, toast, log }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [q, setQ] = useState(""); const [roleFilter, setRoleFilter] = useState("all");
  const openNew = () => { setForm({ name: "", email: "", role: "Subscriber", bio: "", status: "invited", avatar: null }); setEditing("new"); };
  const openEdit = (u) => { setForm({ ...u }); setEditing(u.id); };
  const save = () => {
    if (!form.name.trim() || !form.email.trim()) return toast("Name and email are required", "lock");
    if (editing === "new") { setUsers(u => [...u, { ...form, id: Date.now(), joined: new Date().toISOString().slice(0, 10), lastActive: "-" }]); toast("User added"); log(`added user ${form.name}`); }
    else { setUsers(u => u.map(x => x.id === editing ? { ...x, ...form } : x)); toast("User updated"); }
    setEditing(null);
  };
  const del = (id) => { setUsers(u => u.filter(x => x.id !== id)); toast("User removed"); };
  const list = users.filter(u => (roleFilter === "all" || u.role === roleFilter) && (u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", flexWrap: "wrap" }}>
          <div className="card-h" style={{ margin: 0 }}><div className="ico"><Users size={17} /></div><h3>Team members</h3></div>
          <div style={{ position: "relative", marginLeft: "auto" }}><Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--muted)" }} /><input className="inp" style={{ paddingLeft: 32, width: 200 }} placeholder="Search people..." value={q} onChange={e => setQ(e.target.value)} /></div>
          <select className="sel" style={{ width: "auto" }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}><option value="all">All roles</option>{ROLES.map(r => <option key={r}>{r}</option>)}</select>
          <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Add user</button>
        </div>
        <table className="tbl">
          <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Last active</th><th style={{ textAlign: "right" }}>Manage</th></tr></thead>
          <tbody>
            {list.map(u => (
              <tr key={u.id}>
                <td><div style={{ display: "flex", gap: 11, alignItems: "center" }}><Avatar user={u} size={36} /><div><div style={{ fontWeight: 600 }}>{u.name}</div><div className="hint">{u.email}</div></div></div></td>
                <td><span className={`badge ${ROLE_BADGE[u.role]}`}><Shield size={11} /> {u.role}</span></td>
                <td><span className={`badge ${u.status === "active" ? "b-active" : u.status === "invited" ? "b-invited" : "b-arch"}`}>{u.status}</span></td>
                <td className="hint">{u.lastActive || "-"}</td>
                <td style={{ textAlign: "right" }}><button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}><Pencil size={13} /> Edit</button>{" "}<button className="btn btn-danger btn-sm" onClick={() => del(u.id)}><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-h"><div className="ico"><Shield size={17} /></div><h3>Permission matrix</h3></div>
        <p className="card-desc">Exactly what each role can do across the dashboard.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl mtx">
            <thead><tr><th>Capability</th>{ROLES.map(r => <th key={r}><span className={`badge ${ROLE_BADGE[r]}`} style={{ fontSize: 10 }}>{r}</span></th>)}</tr></thead>
            <tbody>{CAP_LABELS.map(([key, label]) => (
              <tr key={key}><td style={{ fontWeight: 500 }}>{label}</td>{ROLES.map(r => <td key={r} className={CAPS[r][key] ? "yes" : "no"}>{CAPS[r][key] ? <Check size={16} /> : <X size={14} />}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editing === "new" ? "Add user" : "Edit user"}</h3>
            <p className="card-desc">Pick an avatar and assign a role to control access.</p>
            <AvatarPicker value={form.avatar} name={form.name || "New user"} onChange={(av) => setForm(f => ({ ...f, avatar: av }))} />
            <div style={{ height: 14 }} />
            <div className="two">
              <div className="field"><label>Full name</label><input className="inp" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Rowan Diaz" /></div>
              <div className="field"><label>Email</label><input className="inp" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@verdant.garden" /></div>
            </div>
            <div className="two">
              <div className="field"><label>Role</label><select className="sel" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></div>
              <div className="field"><label>Status</label><select className="sel" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}><option value="active">Active</option><option value="invited">Invited</option><option value="suspended">Suspended</option></select></div>
            </div>
            <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>{ROLE_DESC[form.role]}</div>
            <div className="field"><label>Bio</label><textarea className="txa" rows={2} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="A line about this person..." /></div>
            <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}><Save size={15} /> {editing === "new" ? "Add user" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ CODE EDITOR =============================== */
function CodeEditor({ customCSS, setCustomCSS, customJS, setCustomJS, customHTML, setCustomHTML, theme, prompts, toast }) {
  const [tab, setTab] = useState("css");
  const [css, setCss] = useState(customCSS); const [js, setJs] = useState(customJS); const [html, setHtml] = useState(customHTML);
  useEffect(() => { setCss(customCSS); }, [customCSS]);
  const cur = tab === "css" ? css : tab === "js" ? js : html;
  const setCur = (v) => tab === "css" ? setCss(v) : tab === "js" ? setJs(v) : setHtml(v);
  const lines = cur.split("\n");
  const apply = () => { setCustomCSS(css); setCustomJS(js); setCustomHTML(html); toast("Applied to the bot preview"); };
  const SNIPPETS = {
    css: [["Bot bubble shadow", ".bub.bot{ box-shadow:0 2px 8px rgba(0,0,0,.08); }"], ["Rounded header", ".terr-head{ border-radius:0 0 18px 18px; }"], ["Accent border", ".bub.bot{ border-left:3px solid var(--b-accent); }"]],
    js: [["Greeting log", "console.log('Welcome to the Gardening Advisor');"], ["Track open", "window.addEventListener('load',()=>{/* analytics */});"]],
    html: [["Meta description", '<meta name="description" content="Native plant advisor">'], ["Preconnect fonts", '<link rel="preconnect" href="https://fonts.googleapis.com">']],
  };
  const insert = (code) => setCur(cur + "\n" + code + "\n");

  return (
    <div className="grid" style={{ gridTemplateColumns: "1.1fr .9fr", alignItems: "start" }}>
      <div>
        <div className="card-h" style={{ marginBottom: 12 }}><div className="ico"><Code2 size={17} /></div><h3>Custom code</h3></div>
        <div className="code-wrap">
          <div className="code-tabs">
            <button className={`code-tab ${tab === "css" ? "active" : ""}`} onClick={() => setTab("css")}>style.css</button>
            <button className={`code-tab ${tab === "js" ? "active" : ""}`} onClick={() => setTab("js")}>script.js</button>
            <button className={`code-tab ${tab === "html" ? "active" : ""}`} onClick={() => setTab("html")}>head.html</button>
          </div>
          <div className="code-body"><div className="code-gutter">{lines.map((_, i) => <div key={i}>{i + 1}</div>)}</div><textarea className="code-ta" spellCheck={false} value={cur} onChange={e => setCur(e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", margin: "12px 0" }}>
          <span className="hint" style={{ alignSelf: "center" }}>Snippets:</span>
          {SNIPPETS[tab].map(([name, code]) => <button key={name} className="snip" onClick={() => insert(code)}><Braces size={11} style={{ verticalAlign: -1 }} /> {name}</button>)}
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={apply}><Check size={15} /> Apply all</button>
          <button className="btn btn-ghost" onClick={() => { setCss(customCSS); setJs(customJS); setHtml(customHTML); toast("Reverted"); }}><RotateCcw size={15} /> Revert</button>
          <span className="hint" style={{ alignSelf: "center", marginLeft: "auto" }}>{cur.length} chars · {lines.length} lines</span>
        </div>
        <div className="notice" style={{ marginTop: 14 }}><Wand2 size={16} style={{ flex: "0 0 16px", marginTop: 1 }} /><div>CSS is scoped to the bot widget and previews live on the right. JS and head markup are stored for the published widget.</div></div>
      </div>
      <div style={{ position: "sticky", top: 92 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)", marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}><Eye size={13} /> Live preview</div>
        <BotPreview theme={theme} customCSS={css} prompts={prompts} />
      </div>
    </div>
  );
}

/* ============================ PROMPT STUDIO ============================= */
function PromptStudio({ prompts, setPrompts, cap, role, currentUser, toast, log }) {
  const [selId, setSelId] = useState(prompts[0]?.id);
  const [draft, setDraft] = useState(prompts[0] || null);
  const [q, setQ] = useState(""); const [showVars, setShowVars] = useState(false); const [showVersions, setShowVersions] = useState(false);
  const taRef = useRef();
  useEffect(() => { const p = prompts.find(x => x.id === selId); if (p) setDraft({ ...p }); }, [selId]); // eslint-disable-line
  const select = (p) => { setSelId(p.id); setDraft({ ...p }); };
  const upd = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const snapshot = (p) => ({ at: new Date().toLocaleString(), body: p.body, name: p.name });
  const saveDraft = () => { setPrompts(ps => ps.map(p => p.id === draft.id ? { ...draft, edited: "just now", versions: [snapshot(p), ...(p.versions || [])].slice(0, 8) } : p)); toast("Draft saved"); };
  const publish = () => { if (!cap.publishOwn) return toast("Your role can't publish - save as draft", "lock"); setPrompts(ps => ps.map(p => ({ ...p, status: p.id === draft.id ? "active" : (p.status === "active" ? "draft" : p.status) }))); setDraft(d => ({ ...d, status: "active" })); toast(`${draft.name} is now active`); log(`published ${draft.name}`); };
  const create = () => { if (!cap.createOwn) return toast("Your role can't create prompts", "lock"); const np = { id: Date.now(), name: "Untitled prompt", model: "claude-sonnet-4-6", temp: 0.4, topP: 0.9, maxTokens: 800, status: "draft", owner: currentUser.name, desc: "", tags: [], vars: [], body: "", edited: "just now", versions: [] }; setPrompts(ps => [...ps, np]); select(np); toast("New prompt created"); };
  const duplicate = () => { const np = { ...draft, id: Date.now(), name: draft.name + " (copy)", status: "draft", owner: currentUser.name, versions: [] }; setPrompts(ps => [...ps, np]); select(np); toast("Prompt duplicated"); };
  const remove = (id) => { if (!cap.deleteAny) return toast("Your role can't delete prompts", "lock"); const rest = prompts.filter(p => p.id !== id); setPrompts(rest); if (rest[0]) select(rest[0]); toast("Prompt deleted"); };
  const insertVar = (k) => { const t = taRef.current; const tok = `{{${k}}}`; if (t) { const s = t.selectionStart; const nv = draft.body.slice(0, s) + tok + draft.body.slice(t.selectionEnd); upd("body", nv); } else upd("body", draft.body + tok); };
  const restore = (snap) => { upd("body", snap.body); setShowVersions(false); toast("Version restored to editor"); };
  if (!draft) return <div className="card">No prompts yet. <button className="btn btn-primary btn-sm" onClick={create}>Create one</button></div>;
  const list = prompts.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="grid" style={{ gridTemplateColumns: "270px 1fr", alignItems: "start" }}>
      <div className="card" style={{ padding: 12 }}>
        <button className="btn btn-primary" style={{ width: "100%", marginBottom: 10 }} onClick={create} disabled={!cap.createOwn}><Plus size={15} /> New prompt</button>
        <div style={{ position: "relative", marginBottom: 10 }}><Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--muted)" }} /><input className="inp" style={{ paddingLeft: 32 }} placeholder="Search..." value={q} onChange={e => setQ(e.target.value)} /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {list.map(p => (
            <button key={p.id} onClick={() => select(p)} style={{ textAlign: "left", border: "1px solid", borderColor: p.id === selId ? "var(--moss)" : "var(--mist)", background: p.id === selId ? "#f3f7ed" : "transparent", borderRadius: 11, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{p.name}</span><span className={`badge ${p.status === "active" ? "b-active" : p.status === "archived" ? "b-arch" : "b-draft"}`} style={{ fontSize: 9.5, padding: "2px 7px" }}>{p.status}</span></div>
              <div className="hint" style={{ marginTop: 4 }}>{p.owner} · {p.model.replace("claude-", "")} · {p.edited}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <input className="inp" style={{ fontWeight: 600, fontSize: 16, fontFamily: "'Fraunces',serif", flex: 1 }} value={draft.name} onChange={e => upd("name", e.target.value)} />
          <span className={`badge ${draft.status === "active" ? "b-active" : draft.status === "archived" ? "b-arch" : "b-draft"}`}>{draft.status}</span>
          <button className="vd-iconbtn" title="Duplicate" onClick={duplicate} disabled={!cap.createOwn}><Copy size={16} /></button>
          <button className="vd-iconbtn" title="Version history" onClick={() => setShowVersions(s => !s)}><History size={16} /></button>
        </div>

        <div className="field"><label>Description</label><input className="inp" value={draft.desc || ""} onChange={e => upd("desc", e.target.value)} placeholder="What is this prompt for?" /></div>

        <div className="three">
          <div className="field"><label>Model</label><select className="sel" value={draft.model} onChange={e => upd("model", e.target.value)}><option value="claude-opus-4-8">Claude Opus 4.8</option><option value="claude-sonnet-4-6">Claude Sonnet 4.6</option><option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option></select></div>
          <div className="field"><label>Status</label><select className="sel" value={draft.status} onChange={e => upd("status", e.target.value)}><option value="draft">Draft</option><option value="active" disabled={!cap.publishOwn}>Active</option><option value="archived">Archived</option></select></div>
          <div className="field"><label>Owner</label><input className="inp" value={draft.owner} disabled /></div>
        </div>

        <div className="three">
          <div className="field"><label>Temperature</label><div className="rng"><input type="range" min={0} max={1} step={0.1} value={draft.temp} onChange={e => upd("temp", parseFloat(e.target.value))} /><span className="val">{draft.temp.toFixed(1)}</span></div></div>
          <div className="field"><label>Top-p</label><div className="rng"><input type="range" min={0.1} max={1} step={0.05} value={draft.topP ?? 0.9} onChange={e => upd("topP", parseFloat(e.target.value))} /><span className="val">{(draft.topP ?? 0.9).toFixed(2)}</span></div></div>
          <div className="field"><label>Max tokens</label><input className="inp" type="number" value={draft.maxTokens ?? 800} onChange={e => upd("maxTokens", parseInt(e.target.value) || 0)} /></div>
        </div>

        <div className="field">
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
            <label style={{ margin: 0 }}>System prompt</label>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => setShowVars(s => !s)}><Variable size={13} /> Variables ({(draft.vars || []).length})</button>
          </div>
          {showVars && (
            <div className="card" style={{ padding: 12, marginBottom: 10, background: "#f3f7ed" }}>
              <div className="hint" style={{ marginBottom: 8 }}>Insert <span className="vd-mono">{"{{token}}"}</span> placeholders filled at runtime.</div>
              {(draft.vars || []).map((vr, i) => (
                <div key={i} style={{ display: "flex", gap: 7, marginBottom: 7, alignItems: "center" }}>
                  <input className="inp vd-mono" style={{ width: 130 }} value={vr.k} onChange={e => upd("vars", draft.vars.map((x, j) => j === i ? { ...x, k: e.target.value } : x))} placeholder="key" />
                  <input className="inp" value={vr.v} onChange={e => upd("vars", draft.vars.map((x, j) => j === i ? { ...x, v: e.target.value } : x))} placeholder="description" />
                  <button className="btn btn-ghost btn-sm" onClick={() => insertVar(vr.k)}>Insert</button>
                  <button className="vd-iconbtn" style={{ width: 30, height: 30 }} onClick={() => upd("vars", draft.vars.filter((_, j) => j !== i))}><X size={13} /></button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => upd("vars", [...(draft.vars || []), { k: "new_var", v: "" }])}><Plus size={13} /> Add variable</button>
            </div>
          )}
          <textarea ref={taRef} className="txa vd-mono" style={{ minHeight: 230, fontSize: 12.5 }} value={draft.body} onChange={e => upd("body", e.target.value)} placeholder="Describe how the advisor should behave..." />
          <div className="hint">{draft.body.length} characters · grounded in the connected gardening knowledge base.</div>
        </div>

        {showVersions && (
          <div className="card" style={{ padding: 12, marginBottom: 14, background: "#f3f7ed" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Version history</div>
            {(draft.versions || []).length === 0 ? <div className="hint">No saved versions yet. Saving a draft snapshots the prompt.</div> :
              (draft.versions || []).map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--mist)" }}>
                  <Clock size={14} color="var(--muted)" /><span style={{ fontSize: 12.5 }}>{s.at}</span>
                  <span className="hint" style={{ marginLeft: 4 }}>{s.body.slice(0, 40)}...</span>
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => restore(s)}>Restore</button>
                </div>
              ))}
          </div>
        )}

        <TagEditor tags={draft.tags || []} onChange={(tags) => upd("tags", tags)} />

        {!cap.publishOwn && <div className="notice" style={{ marginBottom: 14 }}><Lock size={15} /><div>As a {role}, you can save drafts but not publish. An Editor or Administrator can publish for you.</div></div>}

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={saveDraft} disabled={!cap.createOwn}><Save size={15} /> Save draft</button>
          <button className="btn btn-primary" onClick={publish} disabled={!cap.publishOwn}><Check size={15} /> Publish as active</button>
          <button className="btn btn-danger" style={{ marginLeft: "auto" }} onClick={() => remove(draft.id)} disabled={!cap.deleteAny}><Trash2 size={15} /> Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ============================== ACCOUNT ================================= */
function Account({ currentUser, setUsers, storageOk, toast, setView, resetAll }) {
  const [tab, setTab] = useState("profile");
  const [form, setForm] = useState({ ...currentUser });
  useEffect(() => { setForm({ ...currentUser }); }, [currentUser.id]); // eslint-disable-line
  const save = () => { setUsers(us => us.map(u => u.id === currentUser.id ? { ...u, ...form } : u)); toast("Profile saved"); };
  const [prefs, setPrefs] = useState({ density: "comfortable", reduceMotion: false, landing: "overview", emailUpdates: true });

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr", maxWidth: 760 }}>
      <div className="card">
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
          <Avatar user={currentUser} size={56} />
          <div><h3 className="vd-display" style={{ margin: 0, fontSize: 20 }}>{currentUser.name}</h3><div className="hint">{currentUser.email} · <span className={`badge ${ROLE_BADGE[currentUser.role]}`} style={{ fontSize: 10 }}>{currentUser.role}</span></div></div>
        </div>
        <div className="tabs">
          {[["profile", "Profile", User], ["avatar", "Avatar", Camera], ["prefs", "Preferences", Settings], ["data", "Storage & data", Cloud]].map(([id, label, I]) => (
            <button key={id} className={`tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}><I size={14} style={{ verticalAlign: -2, marginRight: 5 }} />{label}</button>
          ))}
        </div>

        {tab === "profile" && (
          <div>
            <div className="two">
              <div className="field"><label>Full name</label><input className="inp" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="field"><label>Email</label><input className="inp" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            </div>
            <div className="field"><label>Bio</label><textarea className="txa" rows={3} value={form.bio || ""} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Tell the team a little about yourself..." /></div>
            <div className="field"><label>Role</label><input className="inp" value={form.role} disabled /><div className="hint">{ROLE_DESC[form.role]} Only an Administrator can change roles, from Users & Roles.</div></div>
            <button className="btn btn-primary" onClick={save}><Save size={15} /> Save profile</button>
          </div>
        )}

        {tab === "avatar" && (
          <div>
            <AvatarPicker value={form.avatar} name={form.name} onChange={(av) => setForm(f => ({ ...f, avatar: av }))} />
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={save}><Save size={15} /> Save avatar</button>
          </div>
        )}

        {tab === "prefs" && (
          <div>
            <div className="field"><label>Dashboard density</label><div className="seg">{["comfortable", "compact"].map(d => <button key={d} className={prefs.density === d ? "on" : ""} onClick={() => setPrefs(p => ({ ...p, density: d }))}>{d}</button>)}</div></div>
            <div className="field"><label>Default landing page</label><select className="sel" value={prefs.landing} onChange={e => setPrefs(p => ({ ...p, landing: e.target.value }))}><option value="overview">Greenhouse</option><option value="prompts">Prompt Studio</option><option value="media">Media Library</option></select></div>
            <label style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13.5, marginBottom: 12, cursor: "pointer" }}><input type="checkbox" checked={prefs.reduceMotion} onChange={e => setPrefs(p => ({ ...p, reduceMotion: e.target.checked }))} /> Reduce motion & animations</label>
            <label style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13.5, marginBottom: 16, cursor: "pointer" }}><input type="checkbox" checked={prefs.emailUpdates} onChange={e => setPrefs(p => ({ ...p, emailUpdates: e.target.checked }))} /> Email me about content changes</label>
            <button className="btn btn-primary" onClick={() => toast("Preferences saved")}><Save size={15} /> Save preferences</button>
          </div>
        )}

        {tab === "data" && (
          <div>
            <div className="card" style={{ background: "#f3f7ed", display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
              {storageOk ? <Cloud size={22} color="var(--moss)" /> : <CloudOff size={22} color="var(--muted)" />}
              <div><div style={{ fontWeight: 600 }}>{storageOk ? "Persistent storage connected" : "Session storage only"}</div><div className="hint">{storageOk ? "Users, prompts, media, theme, and settings are saved across sessions." : "Storage API unavailable here - your changes persist for this session and reseed on reload."}</div></div>
            </div>
            <p className="card-desc">The CMS persists each module under its own key (users, prompts, media, collections, theme, palette, presets, code, activity, settings). You can reset everything to seed data.</p>
            <button className="btn btn-danger" onClick={() => { if (window.confirm("Reset all Verdant data to defaults? This clears stored users, prompts, media, and theme.")) resetAll(); }}><Trash2 size={15} /> Reset all data</button>
          </div>
        )}
      </div>

      <button className="btn btn-ghost" style={{ width: "fit-content" }} onClick={() => setView("overview")}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> Back to Greenhouse</button>
    </div>
  );
}

/* ============================ MEDIA PICKER ============================== */
function MediaPicker({ media, onPick, onClose }) {
  const items = media.filter(m => !m.archived);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Choose a featured image</h3>
          <button className="vd-iconbtn" style={{ marginLeft: "auto" }} onClick={onClose}><X size={18} /></button>
        </div>
        {items.length === 0
          ? <div className="hint">No media yet. Upload images in the Media Library first.</div>
          : <div className="pickgrid">{items.map(m => (
              <button key={m.id} className="pickitem" onClick={() => onPick(m.url)} title={m.name}><MediaImg url={m.url} alt={m.name} /></button>
            ))}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={() => onPick(null)}>Remove image</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ POSTS & PAGES ============================= */
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
function PostsPages({ posts, setPosts, media, users, cap, role, currentUser, toast, log }) {
  const [type, setType] = useState("post");
  const [mode, setMode] = useState("list");
  const [draft, setDraft] = useState(null);
  const [q, setQ] = useState(""); const [statusF, setStatusF] = useState("all"); const [catF, setCatF] = useState("all"); const [scope, setScope] = useState("all");
  const [pane, setPane] = useState("write"); const [pickerOpen, setPickerOpen] = useState(false);

  const owns = (p) => p.author === currentUser.name;
  const canEdit = (p) => cap.publishAny || (owns(p) && cap.createOwn);
  const canPublish = (p) => cap.publishAny || (owns(p) && cap.publishOwn);
  const canDelete = (p) => cap.deleteAny || (owns(p) && cap.publishOwn);
  const canSubmit = (p) => owns(p) && cap.createOwn && !cap.publishOwn;

  const upd = (k, v) => setDraft(d => ({ ...d, [k]: v, ...(k === "title" && (!d.slug || d.slug === slugify(d.title)) ? { slug: slugify(v) } : {}) }));
  const openNew = () => { if (!cap.createOwn) return toast("Your role can't create content", "lock"); setDraft({ id: Date.now(), type, title: "", slug: "", excerpt: "", body: "", category: type === "post" ? POST_CATEGORIES[0] : "", tags: [], status: "draft", author: currentUser.name, featured: null, date: "", updated: "just now", _new: true }); setPane("write"); setMode("edit"); };
  const openEdit = (p) => { setDraft({ ...p }); setPane(canEdit(p) ? "write" : "preview"); setMode("edit"); };
  const commit = (status) => {
    const next = { ...draft, status: status || draft.status, updated: "just now" };
    delete next._new;
    setPosts(ps => ps.some(p => p.id === next.id) ? ps.map(p => p.id === next.id ? next : p) : [next, ...ps]);
    setDraft(next);
    if (status === "published") { toast(`Published "${next.title || "Untitled"}"`); log(`published ${next.type} "${next.title}"`); }
    else if (status === "pending") { toast("Submitted for review"); log(`submitted "${next.title}" for review`); }
    else if (status === "archived") toast("Moved to archive");
    else toast("Saved");
  };
  const del = (p) => { if (!canDelete(p)) return toast("You can't delete this item", "lock"); setPosts(ps => ps.filter(x => x.id !== p.id)); if (draft && draft.id === p.id) setMode("list"); toast("Deleted"); };

  const list = posts.filter(p => p.type === type)
    .filter(p => statusF === "all" || p.status === statusF)
    .filter(p => type === "page" || catF === "all" || p.category === catF)
    .filter(p => scope === "all" || owns(p))
    .filter(p => p.title.toLowerCase().includes(q.toLowerCase()) || (p.excerpt || "").toLowerCase().includes(q.toLowerCase()));
  const pendingCount = posts.filter(p => p.type === type && p.status === "pending").length;
  const authorOf = (name) => users.find(u => u.name === name);

  /* ---------------- editor ---------------- */
  if (mode === "edit" && draft) {
    const ro = !canEdit(draft);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setMode("list")}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> All {draft.type === "page" ? "pages" : "posts"}</button>
          <span className={`badge ${POST_STATUS[draft.status]}`}>{POST_STATUS_LABEL[draft.status]}</span>
          {ro && <span className="badge b-arch"><EyeOff size={11} /> View only</span>}
          <span className="hint" style={{ marginLeft: "auto" }}>Edited {draft.updated}</span>
        </div>

        <div className="editor-grid">
          <div className="card">
            <input className="inp" style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 600, border: "none", padding: "4px 0", marginBottom: 8 }} placeholder="Add a title" value={draft.title} disabled={ro} onChange={e => upd("title", e.target.value)} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
              <Globe size={13} color="var(--muted)" />
              <span className="hint">/{draft.type === "page" ? "" : "blog/"}</span>
              <input className="inp vd-mono" style={{ padding: "4px 8px", fontSize: 12, width: 240 }} value={draft.slug} disabled={ro} onChange={e => upd("slug", slugify(e.target.value))} placeholder="slug" />
            </div>

            <div className="seg" style={{ marginBottom: 12 }}>
              <button className={pane === "write" ? "on" : ""} onClick={() => setPane("write")}><Pencil size={13} /> Write</button>
              <button className={pane === "preview" ? "on" : ""} onClick={() => setPane("preview")}><Eye size={13} /> Preview</button>
            </div>
            {pane === "write"
              ? <textarea className="txa vd-mono" style={{ minHeight: 360, fontSize: 13 }} placeholder={"Write in Markdown...\n\n# Heading\n**bold**  *italic*  `code`\n- bullet\n[link](https://...)"} value={draft.body} disabled={ro} onChange={e => upd("body", e.target.value)} />
              : <div className="card prose" style={{ minHeight: 360 }} dangerouslySetInnerHTML={{ __html: mdToHtml(draft.body || "*Nothing to preview yet.*") }} />}
            <div className="hint" style={{ marginTop: 6 }}>{(draft.body || "").trim().split(/\s+/).filter(Boolean).length} words · Markdown supported</div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1fr", gap: 14 }}>
            <div className="card">
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Publish</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => commit("draft")} disabled={ro}><Save size={15} /> Save draft</button>
                {canSubmit(draft) && draft.status !== "pending" && <button className="btn btn-bloom" onClick={() => commit("pending")}><SendHorizontal size={15} /> Submit for review</button>}
                {canPublish(draft) && draft.status !== "published" && <button className="btn btn-primary" onClick={() => commit(draft.date && new Date(draft.date) > new Date() ? "scheduled" : "published")}><Check size={15} /> {draft.status === "pending" ? "Approve & publish" : "Publish"}</button>}
                {canPublish(draft) && draft.status === "published" && <button className="btn btn-ghost" onClick={() => commit("draft")}><EyeOff size={15} /> Unpublish</button>}
                {canEdit(draft) && draft.status !== "archived" && <button className="btn btn-ghost" onClick={() => commit("archived")}><Archive size={15} /> Archive</button>}
                {canDelete(draft) && <button className="btn btn-danger" onClick={() => del(draft)}><Trash2 size={15} /> Delete</button>}
              </div>
              <div className="field" style={{ marginTop: 14, marginBottom: 0 }}><label>Publish date</label><input type="date" className="inp" value={draft.date || ""} disabled={ro} onChange={e => upd("date", e.target.value)} /><div className="hint">A future date schedules the post.</div></div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Featured image</div>
              {draft.featured
                ? <div style={{ borderRadius: 11, overflow: "hidden", border: "1px solid var(--mist)", marginBottom: 10, background: "#eef3e6", aspectRatio: "16/9" }}><MediaImg url={draft.featured} alt="featured" /></div>
                : <div style={{ borderRadius: 11, border: "1px dashed var(--mist-2)", padding: 20, textAlign: "center", color: "var(--muted)", marginBottom: 10 }}><ImageIcon size={22} style={{ opacity: .5 }} /></div>}
              {!ro && <button className="btn btn-ghost btn-sm" onClick={() => setPickerOpen(true)}><ImagePlus size={14} /> {draft.featured ? "Change" : "Set image"}</button>}
            </div>

            <div className="card">
              {draft.type === "post" && <div className="field"><label>Category</label><select className="sel" value={draft.category} disabled={ro} onChange={e => upd("category", e.target.value)}>{POST_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>}
              <div className="field" style={{ marginBottom: draft.type === "post" ? 14 : 0 }}><label>Excerpt</label><textarea className="txa" rows={3} value={draft.excerpt} disabled={ro} onChange={e => upd("excerpt", e.target.value)} placeholder="A one-line summary for listings." /></div>
              {!ro && <TagEditor tags={draft.tags || []} onChange={(tags) => upd("tags", tags)} />}
              <div className="field" style={{ marginBottom: 0 }}><label>Author</label><div style={{ display: "flex", gap: 8, alignItems: "center" }}><Avatar user={authorOf(draft.author)} size={26} /><span style={{ fontSize: 13 }}>{draft.author}</span></div></div>
            </div>
          </div>
        </div>

        {pickerOpen && <MediaPicker media={media} onClose={() => setPickerOpen(false)} onPick={(url) => { upd("featured", url); setPickerOpen(false); }} />}
      </div>
    );
  }

  /* ---------------- list ---------------- */
  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div className="seg">
          <button className={type === "post" ? "on" : ""} onClick={() => { setType("post"); setCatF("all"); }}><FileText size={14} /> Posts</button>
          <button className={type === "page" ? "on" : ""} onClick={() => setType("page")}><Files size={14} /> Pages</button>
        </div>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}><Search size={15} style={{ position: "absolute", left: 11, top: 11, color: "var(--muted)" }} /><input className="inp" style={{ paddingLeft: 34 }} placeholder="Search title or excerpt..." value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="sel" style={{ width: "auto" }} value={statusF} onChange={e => setStatusF(e.target.value)}><option value="all">All statuses</option>{Object.keys(POST_STATUS_LABEL).map(s => <option key={s} value={s}>{POST_STATUS_LABEL[s]}</option>)}</select>
        {type === "post" && <select className="sel" style={{ width: "auto" }} value={catF} onChange={e => setCatF(e.target.value)}><option value="all">All categories</option>{POST_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>}
        <div className="seg"><button className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>All</button><button className={scope === "mine" ? "on" : ""} onClick={() => setScope("mine")}>Mine</button></div>
        <button className="btn btn-primary" onClick={openNew} disabled={!cap.createOwn}><Plus size={15} /> New {type}</button>
      </div>

      {cap.publishAny && pendingCount > 0 && (
        <div className="notice" style={{ marginBottom: 14 }}><SendHorizontal size={16} style={{ flex: "0 0 16px", marginTop: 1 }} /><div><b>{pendingCount} {type === "page" ? "page" : "post"}{pendingCount > 1 ? "s" : ""} awaiting review.</b> Filter by "Pending review" to approve and publish.</div></div>
      )}
      {!cap.createOwn && <div className="notice" style={{ marginBottom: 14 }}><Lock size={15} /><div>Your role can read content but not create or edit it.</div></div>}

      {list.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "46px 20px", color: "var(--muted)" }}><FileText size={34} style={{ marginBottom: 10, opacity: .5 }} /><div style={{ fontWeight: 600, color: "var(--ink)" }}>No {type === "page" ? "pages" : "posts"} here</div><div className="hint">{cap.createOwn ? `Start writing with "New ${type}".` : "Nothing matches your filters."}</div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead><tr><th>Title</th><th>Author</th>{type === "post" && <th>Category</th>}<th>Status</th><th>Updated</th><th style={{ textAlign: "right" }}>Manage</th></tr></thead>
            <tbody>
              {list.map(p => (
                <tr key={p.id}>
                  <td><div style={{ fontWeight: 600 }}>{p.title || "Untitled"}</div><div className="hint vd-mono" style={{ fontSize: 10.5 }}>/{p.slug}</div></td>
                  <td><div style={{ display: "flex", gap: 8, alignItems: "center" }}><Avatar user={authorOf(p.author)} size={26} /><span className="hint">{p.author}</span></div></td>
                  {type === "post" && <td className="hint">{p.category || "—"}</td>}
                  <td><span className={`badge ${POST_STATUS[p.status]}`}>{POST_STATUS_LABEL[p.status]}</span></td>
                  <td className="hint">{p.updated}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>{canEdit(p) ? <><Pencil size={13} /> Edit</> : <><Eye size={13} /> View</>}</button>{" "}
                    <button className="btn btn-danger btn-sm" onClick={() => del(p)} disabled={!canDelete(p)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================ LOCKED PANE =============================== */
function LockedPane({ label, role }) {
  return (
    <div className="card"><div className="locked-pane">
      <div className="ring"><Lock size={26} /></div>
      <h3 className="vd-display" style={{ fontSize: 20, margin: "0 0 6px" }}>{label} is restricted</h3>
      <p style={{ maxWidth: 420, margin: "0 auto" }}>The <b>{role}</b> role doesn't include access to this area. {ROLE_DESC[role]}</p>
      <p className="hint" style={{ marginTop: 14 }}>Switch to an Administrator from the profile menu to manage this, or ask an admin to grant access.</p>
    </div></div>
  );
}

/* ============================== LOGIN ================================== */
const DEMO_PASSWORD = "garden";
const GoogleMark = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.4 5.4 2.4 13.3l7.9 6.1C12.2 13.2 17.6 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 6.9l7.1 5.5c4.1-3.8 6.5-9.4 6.5-16z" />
    <path fill="#FBBC05" d="M10.3 28.6c-.5-1.4-.7-2.9-.7-4.6s.3-3.2.7-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.4 10.7l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.5-5.6l-7.1-5.5c-2 1.3-4.6 2.1-8.4 2.1-6.4 0-11.8-3.7-13.7-9.4l-7.9 6.1C6.4 42.6 14.6 48 24 48z" />
  </svg>
);
const GithubMark = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 014 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);
function Login({ users, onLogin }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const submit = () => {
    setErr(""); setInfo("");
    const u = users.find(x => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) return setErr("No account found with that email.");
    if (u.status === "suspended") return setErr("This account is suspended. Contact an administrator.");
    if (pw !== DEMO_PASSWORD) return setErr("Incorrect password. (Demo password: garden)");
    onLogin(u.id);
  };
  const ssoNote = (provider) => setInfo(`Real ${provider} OAuth needs an OAuth app credential pair (client id + secret) provisioned in the ${provider} console and set as VITE_${provider.toUpperCase()}_CLIENT_ID + a matching backend callback route on the agent server. Once those exist, wiring this button to redirect to the provider's authorize URL is a ~50-line change. For now this is a prototype — pick a demo account below to sign in locally.`);
  return (
    <div className="vd"><style>{CSS}</style>
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-brand">
            <div className="vd-brand-mark" style={{ width: 44, height: 44, borderRadius: 13 }}><Sprout size={24} /></div>
            <div><div className="eyebrow">Advisor CMS</div><h1>Verdant</h1></div>
          </div>
          <h2 className="login-h">Sign in to your workspace</h2>
          <p className="login-sub">Manage the Gardening Advisor — prompts, content, media, and team.</p>

          <div className="sso-row">
            <button className="sso-btn" onClick={() => ssoNote("Google")}><GoogleMark /> Continue with Google</button>
            <button className="sso-btn" onClick={() => ssoNote("GitHub")}><GithubMark /> Continue with GitHub</button>
          </div>
          <div className="or"><span>or sign in with email</span></div>

          <div className="field"><label>Email</label><input className="inp" type="email" value={email} placeholder="you@verdant.garden" onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} /></div>
          <div className="field" style={{ marginBottom: 10 }}><label>Password</label><input className="inp" type="password" value={pw} placeholder="••••••••" onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} /></div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Remember me</label>
            <button className="link" style={{ marginLeft: "auto" }} onClick={() => setInfo("Password reset is handled by your auth provider in production.")}>Forgot password?</button>
          </div>
          {err && <div className="login-err"><Lock size={14} /> {err}</div>}
          {info && <div className="notice" style={{ marginBottom: 12 }}><Shield size={15} /><div>{info}</div></div>}
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12 }} onClick={submit}>Sign in</button>

          <div className="demo-box">
            <div className="hint" style={{ marginBottom: 8 }}>Demo accounts — one click to explore a role. Email form password is <b>garden</b>.</div>
            <div className="demo-chips">
              {users.map(u => (
                <button key={u.id} className="demo-chip" onClick={() => onLogin(u.id)} title={`Sign in as ${u.name}`} disabled={u.status === "suspended"}>
                  <Avatar user={u} size={22} /> <span>{u.name.split(" ")[0]}</span>
                  <span className={`badge ${ROLE_BADGE[u.role]}`} style={{ fontSize: 9 }}>{u.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="login-foot">Verdant CMS · prototype auth — production verifies credentials server-side and never trusts the client.</div>
      </div>
    </div>
  );
}
