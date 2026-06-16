# Dev & Deploy Workflow

## 1 — Test locally before pushing

Open a terminal in the project folder and run:

```bash
cd "c:/Users/cyang/Desktop/JFK Terminal 6/Reality Capture Prediction"
npx serve .
```

Open your browser and go to the URL shown in the terminal (usually `http://localhost:3000`).

Stop the server when done: **Ctrl + C**

> First run will ask to install `serve` — press **y** to confirm. Takes a few seconds, then works instantly every time after.

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
| Run locally | `npx serve .` |
| View locally | `http://localhost:3000` |
| Stage all changes | `git add index.html css/ js/` |
| Save a version | `git commit -m "your message"` |
| Push live | `git push` |

---

## If git asks for your password

Use your **Personal Access Token** — not your GitHub password.
Generate one at: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
