/**
 * DeepScan — Express.js Middleware Server
 *
 * Sits between React frontend (port 5173) and FastAPI backend (port 8000).
 * Responsibilities:
 *   - File validation & size limits
 *   - Rate limiting
 *   - Request logging
 *   - Proxying multipart uploads to FastAPI
 *   - Normalising responses for the frontend
 *   - History tracking (in-memory; swap for Redis/DB in production)
 */

const express       = require("express");
const multer        = require("multer");
const cors          = require("cors");
const morgan        = require("morgan");
const rateLimit     = require("express-rate-limit");
const FormData      = require("form-data");
const fetch         = require("node-fetch");
const path          = require("path");
const fs            = require("fs");

const app  = express();
const PORT = process.env.PORT            || 3001;
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(morgan("dev"));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max: 30,               // max 30 requests per window per IP
  message: { error: "Too many requests — please wait a moment." },
});
app.use("/api/", limiter);

// ── Multer: disk storage with validation ─────────────────────────────────────
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg","image/png","image/webp","image/bmp"]);
const ALLOWED_VIDEO_MIME = new Set(["video/mp4","video/avi","video/quicktime",
                                    "video/x-msvideo","video/webm","video/x-matroska"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, require("os").tmpdir()),
  filename:    (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 },  // 250 MB hard cap
  fileFilter(req, file, cb) {
    const all = new Set([...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME]);
    if (all.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

// ── In-memory history (last 50 analyses) ─────────────────────────────────────
const history = [];

function addHistory(entry) {
  history.unshift(entry);
  if (history.length > 50) history.pop();
}

// ── Helper: forward file to FastAPI ──────────────────────────────────────────
async function proxyToFastAPI(endpoint, filePath, mimetype, extraFields = {}) {
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath), {
    contentType: mimetype,
    filename:    path.basename(filePath),
  });
  for (const [k, v] of Object.entries(extraFields)) {
    form.append(k, String(v));
  }

  const resp = await fetch(`${FASTAPI_URL}${endpoint}`, {
    method:  "POST",
    body:    form,
    headers: form.getHeaders(),
    timeout: 300_000,   // 5 min for long videos
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.detail || data.error || "FastAPI error");
  return data;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** Health — checks both Express and FastAPI */
app.get("/api/health", async (req, res) => {
  let fastapi = { status: "unreachable" };
  try {
    const r = await fetch(`${FASTAPI_URL}/health`, { timeout: 4000 });
    fastapi  = await r.json();
  } catch (_) {}
  res.json({
    express: { status: "ok", port: PORT },
    fastapi,
  });
});

/** Predict image */
app.post("/api/predict/image", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  if (!ALLOWED_IMAGE_MIME.has(req.file.mimetype))
    return res.status(400).json({ error: "Not a valid image format" });

  const start = Date.now();
  try {
    const result = await proxyToFastAPI("/predict/image", req.file.path, req.file.mimetype);
    const entry  = {
      id:          Date.now(),
      type:        "image",
      filename:    req.file.originalname,
      verdict:     result.verdict,
      is_fake:     result.is_fake,
      fake_ratio:  result.fake_ratio,
      confidence:  result.confidence,
      demo_mode:   result.demo_mode,
      duration_ms: Date.now() - start,
      created_at:  new Date().toISOString(),
    };
    addHistory(entry);
    res.json({ ...result, duration_ms: entry.duration_ms });
  } catch (err) {
    console.error("Image predict error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

/** Predict video */
app.post("/api/predict/video", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  if (!ALLOWED_VIDEO_MIME.has(req.file.mimetype))
    return res.status(400).json({ error: "Not a valid video format" });

  const numFrames = parseInt(req.body.num_frames) || 20;
  const start     = Date.now();
  try {
    const result = await proxyToFastAPI(
      "/predict/video", req.file.path, req.file.mimetype,
      { num_frames: Math.max(5, Math.min(numFrames, 50)) }
    );
    const entry = {
      id:             Date.now(),
      type:           "video",
      filename:       req.file.originalname,
      verdict:        result.verdict,
      is_fake:        result.is_fake,
      fake_ratio:     result.fake_ratio,
      frames_analyzed:result.frames_analyzed,
      demo_mode:      result.demo_mode,
      duration_ms:    Date.now() - start,
      created_at:     new Date().toISOString(),
    };
    addHistory(entry);
    res.json({ ...result, duration_ms: entry.duration_ms });
  } catch (err) {
    console.error("Video predict error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

/** History */
app.get("/api/history", (req, res) => {
  res.json({ history, total: history.length });
});

app.delete("/api/history", (req, res) => {
  history.length = 0;
  res.json({ message: "History cleared" });
});

// ── Multer error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(413).json({ error: "File too large (max 250 MB)" });
  if (err.message?.startsWith("Unsupported"))
    return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`✅ Express middleware running → http://localhost:${PORT}`);
  console.log(`   Proxying to FastAPI at      ${FASTAPI_URL}`);
});
