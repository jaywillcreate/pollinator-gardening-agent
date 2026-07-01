# Verdant — Gardening Advisor CMS

A single-page **content management dashboard** for a native-plant & pollinator
*Gardening Advisor* chatbot. Verdant lets a team configure the bot's appearance,
write the prompts behind its answers, manage a media library, publish articles
and pages, and control who can do what — all behind a login.

> Built with React + Vite. No backend required to run the demo: data persists in
> the browser via `localStorage`. See **Authentication** and **Persistence**
> below for what production would add.

---

## Features

- **Login** — email/password (demo), one-click demo accounts per role, and
  Google/GitHub SSO placeholders.
- **Greenhouse (overview)** — at-a-glance stats, recent activity, editable
  announcement, knowledge-base & storage status.
- **Live Bot Preview** — the chatbot rendered in a "terrarium" frame that
  re-skins instantly as you edit the theme; answers are grounded in the
  knowledge base.
- **Theme Studio** — typography, type spacing, color palette, bubble/input
  radii, gradient toggle, SVG logo upload, image upload + filter editing, and
  savable theme presets with JSON export.
- **Prompt Studio** — create, duplicate, version (with restore), tag, and
  publish system prompts; per-prompt model, temperature, top-p, max tokens,
  and `{{variable}}` placeholders.
- **Media Library** — upload, tag, add alt text, organize into collections,
  grid/list views, sort, search, bulk archive/delete, external-URL images,
  and an asset/metadata split (binaries stored separately from records).
- **Posts & Pages** — Markdown editor with live preview, slugs, excerpts,
  categories, tags, featured images (picked from the Media Library), and a
  **draft → pending review → published** workflow mapped to user roles.
- **Users & Roles** — add people, choose a botanical avatar or upload a photo,
  assign roles, set status, and view the full permission matrix.
- **Code Editor** — scoped custom CSS / JS / head HTML with snippets and a live
  preview.
- **Account settings** — profile, avatar, preferences, and storage/data tools.

## Roles & permissions

| Capability | Administrator | Editor | Author | Contributor | Subscriber |
|---|:---:|:---:|:---:|:---:|:---:|
| Read content & own profile | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create / save own drafts | ✓ | ✓ | ✓ | ✓ | — |
| Publish own content | ✓ | ✓ | ✓ | — | — |
| Edit & publish any content | ✓ | ✓ | — | — | — |
| Delete any content | ✓ | ✓ | — | — | — |
| System settings & plugins | ✓ | — | — | — | — |
| Manage users | ✓ | — | — | — | — |

For Posts & Pages this means a **Contributor** can submit drafts for review, an
**Author** can publish their own, and an **Editor/Administrator** can approve,
publish, or delete anyone's.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build to dist/
npm run preview  # preview the production build
```

### Logging in

The demo ships with five accounts. On the login screen, either:

- click a **demo account chip** to jump straight into that role, or
- enter an account email with the demo password **`garden`**.

| Email | Role |
|---|---|
| maya@verdant.garden | Administrator |
| devin@verdant.garden | Editor |
| priya@verdant.garden | Author |
| sam@verdant.garden | Contributor |
| jordan@verdant.garden | Subscriber |

You can also switch users at any time from the profile menu in the top-right.

## Authentication (prototype vs production)

The login flow in this repo is a **client-side prototype**: it checks the email
against the seeded users and a shared demo password, then stores a session id in
browser storage. That is fine for a demo but is **not secure** on its own.

For production, replace `Login`'s `submit()` and the `session` handling with a
real flow:

1. Verify credentials **on a server**; never trust the client.
2. Store password hashes (e.g. bcrypt/argon2), never plaintext.
3. Issue a signed, httpOnly session cookie or JWT.
4. Wire the **Continue with Google / GitHub** buttons to real OAuth/SSO.
5. Re-check the user's role on every privileged request server-side — the
   client-side permission gates here are UX, not security.

## Connecting the live agent

By default the preview uses demo replies. To stream answers from the real
**pollinator-gardening-agent**, set `VITE_AGENT_URL` (see `.env.example`) to the
agent's `/api/chat` endpoint and use the patched handler in
[`integration/api/chat.js`](./integration/api/chat.js). The dashboard's published
(active) prompt becomes the agent's system prompt, and its model/temperature/
top-p/max-tokens are forwarded. The preview header shows **● Live agent** when
connected. Full details and a validation script are in
[`integration/INTEGRATION.md`](./integration/INTEGRATION.md):

```bash
cp .env.example .env      # set VITE_AGENT_URL
node integration/test/validate.mjs   # prove the wiring against a mock
```

## Persistence

A small storage adapter (`store` in `VerdantDashboard.jsx`) selects a backend at
runtime, in order:

1. `window.storage` — Anthropic Claude artifact persistent storage (if present).
2. `localStorage` — the standalone web build (this repo).
3. in-memory — last-resort fallback (data lasts the session).

Media binaries are written under their own `blob:<id>` keys via an `assetStore`,
and records keep only a lightweight URL reference — so the metadata stays small.
External images are stored as plain URLs with no local copy. To go to real
infrastructure, point `assetStore` at object storage (S3/CloudFront) and keep
the content records in a database.

## Deploying to GitHub Pages

This repo includes `.github/workflows/deploy.yml`. To use it:

1. Push to a GitHub repo's `main` branch.
2. In **Settings → Pages**, set **Source = GitHub Actions**.
3. The workflow builds with the correct `base` (`/<repo-name>/`) and deploys.

For a custom domain or user/org page, the default `base: "/"` is correct and you
can simplify the workflow.

## Knowledge base

The advisor's prompts and seeded content reference native-plant horticulture
sources — regional pollinator-friendly planting guides, cultural and seed-mix
guides, germination codes, and site-prep methods (smothering, solarization).
Wire your retrieval layer into `BOT_REPLIES` / the live preview and into the
active prompt to ground real answers.

## Project structure

```
verdant-cms/
├─ index.html
├─ package.json
├─ vite.config.js
├─ .github/workflows/deploy.yml
└─ src/
   ├─ main.jsx              # mounts the app
   ├─ index.css            # page reset
   └─ VerdantDashboard.jsx # the entire CMS (components + storage + styles)
```

## License

MIT — see [LICENSE](./LICENSE).
