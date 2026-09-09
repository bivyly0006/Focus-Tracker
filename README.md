# Focus Tracker

A task, mood, sleep, and cycle tracker built for ADHD brains — works fully
offline as an installable app, with optional AI features (task breakdown,
weekly summaries) powered by the OpenAI API.

## What's in this repo

```
.
├── index.html          # App shell (3 tabs: Today, Check-in, Insights)
├── style.css            # Styling (color palette baked in)
├── app.js                # All app logic — storage, timer, tasks, AI calls
├── manifest.json        # Makes the app installable (PWA)
├── sw.js                  # Service worker — caches the app for offline use
├── icons/                # App icons (placeholders — swap these out)
├── api/
│   └── openai-proxy.js  # Serverless function that calls OpenAI, keeping your key private
├── vercel.json           # Deployment config for Vercel
└── README.md
```

Everything except the AI features works with **zero setup and zero
internet** — tasks, timer, mood/sleep/cycle logging all save locally in the
browser (IndexedDB) and persist across sessions.

## 1. Run it locally

No build step needed. Just serve the folder — you can't open `index.html`
directly via `file://` because service workers require `http://`.

```bash
# any of these work
npx serve .
# or
python3 -m http.server 8000
```

Then visit `http://localhost:8000` (or whatever port it prints).

## 2. Put it on GitHub

```bash
git init
git add .
git commit -m "Initial commit: Focus Tracker PWA"
gh repo create focus-tracker --public --source=. --push
# or manually: create a repo on github.com, then
git remote add origin https://github.com/YOUR-USERNAME/focus-tracker.git
git branch -M main
git push -u origin main
```

## 3. Deploy it (so it has a real URL people can visit/install)

The easiest path is **Vercel** (free tier, and it natively supports the
`api/` serverless function folder with zero config beyond `vercel.json`,
which is already included).

1. Go to [vercel.com](https://vercel.com), sign in with GitHub
2. "Add New Project" → import your `focus-tracker` repo
3. Before deploying, add an environment variable:
   - Name: `OPENAI_API_KEY`
   - Value: your OpenAI API key
   - (Settings → Environment Variables, or the prompt during import)
4. Deploy. You'll get a URL like `https://focus-tracker-yourname.vercel.app`

**Netlify** and **Cloudflare Pages** both work too — the app shell deploys
identically since it's static files. You'd just move `api/openai-proxy.js`
into their function format:
- Netlify: `netlify/functions/openai-proxy.js`, same logic, swap `req`/`res`
  for Netlify's `event`/`context` handler signature
- Cloudflare Pages: `functions/api/openai-proxy.js`, using
  `export async function onRequestPost(context)`

## 4. Put a link on your website

Once deployed, add a button/link on your site pointing at the Vercel URL —
visiting it *is* the install flow:

```html
<a href="https://focus-tracker-yourname.vercel.app">Get the Focus Tracker app</a>
```

Desktop Chrome/Edge will show an install icon in the address bar. On
Android, Chrome shows an automatic "Add to Home Screen" prompt. On iOS,
users tap Share → "Add to Home Screen" in Safari (iOS doesn't support the
automatic install prompt).

## 5. Swap in real icons

The icons in `/icons` are simple placeholders generated from your color
palette (`#F0B020`, `#103050`, `#1090E0`). Replace `icon-192.png`,
`icon-512.png`, and the two `-maskable` versions with real artwork at the
same filenames and dimensions — no other code changes needed.

## How the AI features work

- `app.js` calls `/api/openai-proxy` (same-origin, no CORS issues) with a
  `system` prompt, the `user` content, and whether JSON is expected
- The proxy function (running server-side, never in the browser) attaches
  your `OPENAI_API_KEY` and calls OpenAI on the app's behalf
- If the user is offline, AI buttons auto-disable (see
  `updateConnectionStatus()` in `app.js`) — everything else keeps working

This is why the key is safe: it only ever exists in Vercel's environment
variables, never in code that ships to a browser.

## Extending it

- **More AI features**: add new prompt types by calling `callAI({ system,
  user, json })` from anywhere in `app.js` — it already routes through the
  proxy
- **Better pattern detection**: the insights tab currently computes simple
  stats client-side; you could send `tasks` + `checkins` to the AI summary
  endpoint more often, or add a dedicated "detect patterns" prompt
- **Push reminders**: would need the Notifications API + a bit more service
  worker logic — ask if you want this added
