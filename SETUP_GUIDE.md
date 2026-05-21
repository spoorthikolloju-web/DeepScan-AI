# DeepScan — Complete Setup Guide

## What You're Running

```
Your Browser  (http://localhost:5173)
      │
      │  HTTP /api/*
      ▼
 Express.js   (http://localhost:3001)
      │  File validation, rate-limiting, history tracking
      │  Forwards upload to Python
      ▼
  FastAPI      (http://localhost:8000)
      │  MTCNN face detection + alignment
      │  ModelA eyes/nose + ModelB eyes/nose + ModelC ViT
      ▼
 Your .pth model weights  →  FAKE / REAL verdict
```

You need **3 terminal windows** open at the same time.

---

## Requirements — Install These First

| Tool | Minimum Version | How to Check | Download |
|------|----------------|--------------|----------|
| Python | 3.9+ | `python --version` | https://python.org |
| Node.js | 18+ | `node --version` | https://nodejs.org |
| npm | 9+ | `npm --version` | (comes with Node) |

---

## Step 1 — Add Your Model Files

Copy the following into the `fastapi-server/` folder:

```
fastapi-server/
├── main.py            ← already there
├── requirements.txt   ← already there
├── models.py          ← ⬅ REPLACE the stub with YOUR models.py
├── modelA_best.pth    ← ⬅ copy from Google Drive
├── modelA_nose.pth    ← ⬅ copy from Google Drive
├── modelB_eyes.pth    ← ⬅ copy from Google Drive
├── modelB_nose.pth    ← ⬅ copy from Google Drive
└── best_model.pth     ← ⬅ copy from Google Drive (optional, ModelC ViT)
```

> **If your weights are in a different folder** you can tell FastAPI where they
> are with an environment variable (see Terminal 1 setup below).

---

## Step 2 — Terminal 1: Start FastAPI (Python AI Backend)

```bash
# Navigate into the fastapi-server folder
cd fastapi-server

# Create a virtual environment (strongly recommended)
python -m venv venv

# Activate it:
#   Mac / Linux:
source venv/bin/activate
#   Windows (Command Prompt):
venv\Scripts\activate.bat
#   Windows (PowerShell):
venv\Scripts\Activate.ps1

# Install Python packages
pip install -r requirements.txt

# Start the server
python main.py
```

You should see output like:
```
✅ Loaded 5 models (including ModelC ViT) on cuda
INFO:     Uvicorn running on http://0.0.0.0:8000
```

> **If your weights are in a different folder:**
> ```bash
> # Mac / Linux
> WEIGHTS_DIR=/path/to/your/weights python main.py
>
> # Windows (Command Prompt)
> set WEIGHTS_DIR=C:\path\to\weights && python main.py
>
> # Windows (PowerShell)
> $env:WEIGHTS_DIR="C:\path\to\weights"; python main.py
> ```

> **No weights yet?** The server will still start in DEMO MODE and you can
> test the UI with randomly generated results. A yellow banner appears in the
> browser to let you know.

**Verify it works:**
Open http://localhost:8000/docs — you should see Swagger UI.

---

## Step 3 — Terminal 2: Start Express (Node Middleware)

Open a **new terminal**, keep Terminal 1 running.

```bash
# Navigate into the express-server folder
cd express-server

# Install Node packages (first time only)
npm install

# Start the server
npm start
```

You should see:
```
✅ Express middleware running → http://localhost:3001
   Proxying to FastAPI at      http://localhost:8000
```

**Verify it works:**
```bash
curl http://localhost:3001/api/health
```
Should return JSON with `"express": { "status": "ok" }` and FastAPI status.

---

## Step 4 — Terminal 3: Start React (Frontend)

Open a **third terminal**, keep the other two running.

```bash
# Navigate into the frontend folder
cd frontend

# Install Node packages (first time only)
npm install

# Start the dev server
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in 300ms

  ➜  Local:   http://localhost:5173/
```

---

## Step 5 — Use the App

Open **http://localhost:5173** in your browser.

1. The **status bar** at the top shows if Express and FastAPI are connected.
   - Green dot = online ✅
   - Red dot = offline ❌ (check that terminal is running)

2. Choose **Image** or **Video** tab.

3. **Drag & drop** your file or click to browse.

4. For video, drag the **"Frames to sample"** slider (5–50).
   More frames = more accurate but slower.

5. Click **⚡ Analyze**.

6. Results appear below:
   - **FAKE** 🚨 — deepfake detected
   - **REAL** ✅ — no manipulation found
   - **NO FACE** 🔍 — couldn't detect a face

---

## Troubleshooting

### "Cannot connect to backend"
Make sure all 3 terminals are running. Check:
- Terminal 1: `http://localhost:8000/docs` loads
- Terminal 2: `http://localhost:3001/api/health` returns JSON
- Terminal 3: `http://localhost:5173` loads the UI

### "pip install fails" on facenet-pytorch
```bash
pip install facenet-pytorch --no-deps
pip install torch torchvision  # install these separately
```

### "No module named models"
Your real `models.py` is not in `fastapi-server/`. Copy it there.

### "Weight file not found"
Your `.pth` files are not in `fastapi-server/`. Either copy them there
or use the `WEIGHTS_DIR` environment variable (see Step 2).

### Port already in use
```bash
# Kill whatever is on port 8000 (Mac/Linux)
lsof -ti:8000 | xargs kill -9
# Kill port 3001
lsof -ti:3001 | xargs kill -9
```

### Slow on large videos
Reduce the frame count slider to 5–10. FastAPI loads models once on startup,
so the first request is slow but subsequent ones are faster.

---

## File Size Limits

| Type | Express limit | Notes |
|------|--------------|-------|
| Image | 250 MB | JPG, PNG, WEBP, BMP |
| Video | 250 MB | MP4, AVI, MOV, WEBM, MKV |

---

## Stopping Everything

Press **Ctrl + C** in each terminal window.

---

## Production Notes (optional)

When you're ready to deploy on a server:

```bash
# FastAPI — use Gunicorn with Uvicorn workers
pip install gunicorn
cd fastapi-server
gunicorn -w 2 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000

# Express — use PM2 process manager
npm install -g pm2
cd express-server
pm2 start index.js --name deepscan-express

# React — build to static files
cd frontend
npm run build
# Then serve the  dist/  folder with nginx or any static host
```

If FastAPI runs on a different machine/IP, update Express:
```bash
FASTAPI_URL=http://your-gpu-server-ip:8000 npm start
```
