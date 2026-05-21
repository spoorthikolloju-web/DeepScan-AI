# 🔬 DeepScan — Full-Stack Deepfake Detection

**React + Express.js + FastAPI + PyTorch**

```
Browser (React :5173)
    │  HTTP /api/*
    ▼
Express.js (:3001)   ← validation, rate-limiting, logging, history
    │  proxies multipart upload
    ▼
FastAPI (:8000)      ← MTCNN + ModelA/B/C ensemble
    │  loads .pth weights
    ▼
Your PyTorch models  → verdict: FAKE / REAL
```

---

## Project Structure

```
deepscan/
├── fastapi-server/
│   ├── main.py              ← FastAPI + your entire notebook logic
│   ├── requirements.txt
│   ├── models.py            ← ⬅ COPY YOUR models.py HERE
│   ├── modelA_best.pth      ← ⬅ COPY YOUR weights HERE
│   ├── modelA_nose.pth
│   ├── modelB_eyes.pth
│   ├── modelB_nose.pth
│   └── best_model.pth       ← (optional ModelC ViT)
│
├── express-server/
│   ├── index.js             ← Express middleware
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── hooks/useApi.js
    │   └── components/
    │       ├── StatusBar.jsx
    │       ├── UploadZone.jsx
    │       ├── ResultCard.jsx
    │       └── HistoryPanel.jsx
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## ⚡ Setup (3 terminals)

### Terminal 1 — FastAPI (Python AI backend)

```bash
cd fastapi-server

# 1. Copy your model files into this folder:
#    models.py  modelA_best.pth  modelA_nose.pth
#    modelB_eyes.pth  modelB_nose.pth  best_model.pth
$ py -3.11 -m venv venv
$ source venv/Scripts/activate
pip install "numpy<2"

pip install torch==2.4.1 torchvision==0.19.1 --index-url https://download.pytorch.org/whl/cpu
# 2. Install deps
#pip install -r requirements.txt

# 3. Start the server
python main.py
# → http://localhost:8000
# → http://localhost:8000/docs  (interactive Swagger UI)
```

If your weights are in a different folder:
```bash
WEIGHTS_DIR=/path/to/your/weights python main.py
```

---

### Terminal 2 — Express.js (Node middleware)

```bash
cd express-server
npm install
npm start
# → http://localhost:3001
```

---

### Terminal 3 — React (Frontend)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## 🌐 API Reference

All these are exposed by Express on port 3001
(Express proxies to FastAPI at port 8000 internally).

| Method | Path                  | Description                        |
|--------|-----------------------|------------------------------------|
| GET    | `/api/health`         | Status of Express + FastAPI        |
| POST   | `/api/predict/image`  | Analyse an image                   |
| POST   | `/api/predict/video`  | Analyse a video                    |
| GET    | `/api/history`        | Last 50 analyses                   |
| DELETE | `/api/history`        | Clear history                      |

### POST `/api/predict/image`
```
Content-Type: multipart/form-data
Field: file  (image/jpeg | image/png | image/webp | image/bmp)
```

### POST `/api/predict/video`
```
Content-Type: multipart/form-data
Field: file        (video/mp4 | video/avi | video/quicktime | video/webm)
Field: num_frames  (int, 5–50, default 20)
```

### Response shape
```json
{
  "verdict":         "FAKE",
  "is_fake":         true,
  "fake_ratio":      0.75,
  "confidence":      0.94,
  "frames_analyzed": 18,
  "frames_skipped":  2,
  "frame_log":       [{"frame_index": 0, "result": "FAKE", "face_confidence": 0.99}],
  "models_used":     5,
  "device":          "cuda",
  "demo_mode":       false,
  "duration_ms":     3200,
  "type":            "video"
}
```

---

## 🎛 Demo Mode

If `models.py` or `.pth` weight files are missing, FastAPI automatically enters
**DEMO MODE** — random predictions, no crash. A yellow banner appears in the UI.

---

## 🚀 Production Deploy

```bash
# FastAPI with Gunicorn
pip install gunicorn
gunicorn -w 2 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000

# Express with PM2
npm install -g pm2
pm2 start index.js --name deepscan-express

# React — build static files
cd frontend && npm run build
# Serve dist/ with nginx or any static host
```

Update the `FASTAPI_URL` env var on your Express server:
```bash
FASTAPI_URL=http://your-gpu-server:8000 node index.js
```
