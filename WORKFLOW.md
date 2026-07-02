# Dev & Deploy Workflow

## 1 — Test locally before pushing

### One-time setup: add your Airtable credentials

Open `js/config.local.js` and replace the placeholder values with your real credentials:

```js
window.__LOCAL_AT_BASE__  = 'appXXXX…';   // Airtable base ID
window.__LOCAL_AT_TOKEN__ = 'patXXXX…';   // Airtable personal access token
```

This file is gitignored — credentials will never be committed.  
Get the values from: **Airtable → your base → Help → API** (or your Airtable account token settings).

### Run the local server

```bash
cd "c:/Users/cyang/Desktop/JFK Terminal 6/Reality Capture Prediction"
npx serve . -l 8080
```

Open `http://localhost:8080`. Stop with **Ctrl + C**.

---

## 2 — Push changes to GitHub (and live site)

After you make any changes to `index.html`, `css/`, or `js/`:

```bash
cd "c:/Users/cyang/Desktop/JFK Terminal 6/Reality Capture Prediction"
git add index.html css/ js/
git commit -m "describe what you changed"
git push
```

Your live site at **https://cyang-pixel.github.io/RealityCapturePrediction** updates automatically within ~30 seconds.

---

## Quick reference

| What you want | Command |
|---|---|
| Run locally | `npx serve . -l 8080` |
| View locally | `http://localhost:8080` |
| Stage all changes | `git add index.html css/ js/` |
| Save a version | `git commit -m "your message"` |
| Push live | `git push` |

---

## If git asks for your password

Use your **Personal Access Token** — not your GitHub password.
Generate one at: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
