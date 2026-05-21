"""
DeepScan — FastAPI Python Backend
Wraps the predict_enhanced.ipynb ensemble pipeline into a REST API.

Endpoints:
  GET  /health              → model/device status
  POST /predict/image       → analyse a single image
  POST /predict/video       → analyse a video (sampled frames)
"""

import os, cv2, math, tempfile, time, base64
import numpy as np
import torch
from torchvision import transforms
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uvicorn

# ─── Optional model imports ───────────────────────────────────────────────────
try:
    from facenet_pytorch import MTCNN
    MTCNN_AVAILABLE = True
except ImportError:
    MTCNN_AVAILABLE = False
    print("⚠  facenet-pytorch not installed — running in DEMO mode")

try:
    from models import ModelA, ModelB, ModelC, ModelMouth
    MODELS_AVAILABLE = True
except ImportError:
    MODELS_AVAILABLE = False
    print("⚠  models.py not found — running in DEMO mode")

# ─── App setup ────────────────────────────────────────────────────────────────
app = FastAPI(title="DeepScan API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DEVICE     = torch.device("cuda" if torch.cuda.is_available() else "cpu")
UPLOAD_DIR = tempfile.gettempdir()

# ─── Transforms ───────────────────────────────────────────────────────────────
transform_50 = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((50, 50)),
    transforms.ToTensor(),
    transforms.Normalize([0.5]*3, [0.5]*3),
])
transform_224 = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.5]*3, [0.5]*3),
])

# ─── Model metadata (used in API responses for the frontend) ──────────────────
#
#   models[0]  = ModelA on eyes  → "Model A – Deep CNN"    region: "Eyes & Nose"
#   models[1]  = ModelA on nose  → "Model A – Deep CNN"    region: "Eyes & Nose"
#   models[2]  = ModelB on eyes  → "Model B – Simple CNN"  region: "Eyes & Nose"
#   models[3]  = ModelB on nose  → "Model B – Simple CNN"  region: "Eyes & Nose"
#   models[4]  = ModelMouth      → "Model D – Xception"    region: "Mouth"
#   models[5]  = ModelC ViT      → "Model C – ViT"         region: "Full Face"
#
MODEL_META = [
    {"name": "Model A – Deep CNN",   "region": "Eyes & Nose", "weight": 1.0},
    {"name": "Model A – Deep CNN",   "region": "Eyes & Nose", "weight": 1.0},
    {"name": "Model B – Simple CNN", "region": "Eyes & Nose", "weight": 1.0},
    {"name": "Model B – Simple CNN", "region": "Eyes & Nose", "weight": 1.0},
    {"name": "Model D – Xception",   "region": "Mouth",       "weight": 1.0},
    {"name": "Model C – ViT",        "region": "Full Face",   "weight": 2.5},
]

# ─── Lazy-load singletons ─────────────────────────────────────────────────────
_mtcnn  = None
_models = None

def get_mtcnn():
    global _mtcnn
    if _mtcnn is None and MTCNN_AVAILABLE:
        _mtcnn = MTCNN(
            keep_all=False, device=DEVICE,
            min_face_size=40, thresholds=[0.6, 0.7, 0.7],
            post_process=False,
        )
    return _mtcnn

def get_models():
    global _models
    if _models is not None:
        return _models
    if not MODELS_AVAILABLE:
        return None

    weights_dir = os.environ.get("WEIGHTS_DIR", os.path.dirname(__file__))

    required = {
        "modelA_eyes": os.path.join(weights_dir, "modelA_eyes.pth"),
        "modelA_nose": os.path.join(weights_dir, "modelA_best_nose.pth"),
        "modelB_eyes": os.path.join(weights_dir, "modelB_eyes.pth"),
        "modelB_nose": os.path.join(weights_dir, "modelB_best_nose.pth"),
        "model_mouth": os.path.join(weights_dir, "modelD_mouth_best.pth"),
    }
    missing = [k for k, v in required.items() if not os.path.exists(v)]
    if missing:
        print(f"⚠  Missing weights: {missing}  — DEMO mode active")
        return None

    def _load(cls, path):
        m = cls().to(DEVICE)
        ckpt = torch.load(path, map_location=DEVICE)
        m.load_state_dict(ckpt.get("model_state_dict", ckpt))
        m.eval()
        return m

    _models = [
        _load(ModelA,     required["modelA_eyes"]),   # index 0
        _load(ModelA,     required["modelA_nose"]),   # index 1
        _load(ModelB,     required["modelB_eyes"]),   # index 2
        _load(ModelB,     required["modelB_nose"]),   # index 3
        _load(ModelMouth, required["model_mouth"]),   # index 4
    ]
    model_c = os.path.join(weights_dir, "best_model_2.pth")
    if os.path.exists(model_c):
        _models.append(_load(ModelC, model_c))        # index 5
        print(f"✅ Loaded 6 models (including Model C ViT) on {DEVICE}")
    else:
        print(f"✅ Loaded 5 models on {DEVICE}  (Model C ViT weights not found)")
    return _models

# ─── Core helpers 
def align_face(frame, left_eye, right_eye):
    le = np.array(left_eye,  dtype=np.float32)
    re = np.array(right_eye, dtype=np.float32)
    angle  = math.degrees(math.atan2(re[1]-le[1], re[0]-le[0]))
    center = tuple(((le + re) / 2).astype(np.float32))
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    h, w = frame.shape[:2]
    aligned = cv2.warpAffine(frame, M, (w,h),
                             flags=cv2.INTER_LINEAR,
                             borderMode=cv2.BORDER_REFLECT_101)
    return aligned, M

def transform_point(pt, M):
    return M @ np.array([pt[0], pt[1], 1.0], dtype=np.float32)

def transform_box(box, M):
    x1,y1,x2,y2 = box
    corners = np.array([[x1,y1,1],[x2,y1,1],[x1,y2,1],[x2,y2,1]], dtype=np.float32)
    r = (M @ corners.T).T
    return int(r[:,0].min()), int(r[:,1].min()), int(r[:,0].max()), int(r[:,1].max())

def safe_crop(img, x1, y1, x2, y2):
    h, w = img.shape[:2]
    x1,y1 = max(0,x1), max(0,y1)
    x2,y2 = min(w,x2), min(h,y2)
    if x2<=x1 or y2<=y1: return None
    return img[y1:y2, x1:x2]

def crop_eyes(aligned_frame, le, re, margin=10):
    ex1 = int(min(le[0], re[0])) - margin
    ex2 = int(max(le[0], re[0])) + margin
    ey1 = int(min(le[1], re[1])) - margin
    ey2 = int(max(le[1], re[1])) + margin
    return safe_crop(aligned_frame, ex1, ey1, ex2, ey2)

def crop_nose(aligned_frame, nose_pt, face_box):
    fx1,fy1,fx2,fy2 = face_box
    hw = int(max(fx2-fx1,1)*0.18)
    hh = int(max(fy2-fy1,1)*0.18)
    nx,ny = int(nose_pt[0]), int(nose_pt[1])
    return safe_crop(aligned_frame, nx-hw, ny-hh, nx+hw, ny+hh)

def crop_mouth(face_224, mtcnn):
    """Matches training logic: detect landmarks on the 224x224 face crop."""
    boxes, probs, landmarks = mtcnn.detect(face_224, landmarks=True)
    if landmarks is None:
        return None
    ml, mr = landmarks[0][3], landmarks[0][4]
    cx, cy = int((ml[0] + mr[0]) / 2), int((ml[1] + mr[1]) / 2)
    m = int(224 * 0.25)
    x1, y1 = cx - m, cy - m//2
    x2, y2 = cx + m, cy + m//2
    mouth_crop = safe_crop(face_224, x1, y1, x2, y2)
    if mouth_crop is not None:
        return cv2.resize(mouth_crop, (50, 50))
    return None

def predict_single(model, tensor):
    """Returns (prediction:int, confidence:float).
    prediction: 0=FAKE, 1=REAL
    confidence: softmax probability of the predicted class
    """
    with torch.no_grad():
        out  = model(tensor.unsqueeze(0).to(DEVICE))
        prob = torch.softmax(out, dim=1)
        pred = torch.argmax(prob, dim=1).item()
        conf = prob[0][pred].item()
    return pred, conf

def majority_vote(preds, weights=None):
    if weights is None:
        return int(np.bincount(preds).argmax())
    weighted_counts = np.zeros(2)
    for p, w in zip(preds, weights):
        weighted_counts[p] += w
    return int(np.argmax(weighted_counts))

def frame_to_thumbnail(frame_bgr, max_width=320):
    """Encode a frame as a base64 JPEG data-URI for the frontend."""
    h, w = frame_bgr.shape[:2]
    if w > max_width:
        scale = max_width / w
        frame_bgr = cv2.resize(frame_bgr, (max_width, int(h * scale)))
    _, buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, 70])
    b64 = base64.b64encode(buf).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"

def build_model_outputs(raw_preds, num_models):
    """
    Convert raw (pred, conf) pairs into per-model objects for the frontend.

    All 6 models shown individually:

    """

    # Pre-computed validation accuracies — fill in your real numbers:
    MODEL_ACCURACY = {
        "Model A – Deep CNN (Eyes)":   0.86,
        "Model A – Deep CNN (Nose)":   0.82,
        "Model B – Simple CNN (Eyes)": 0.83,
        "Model B – Simple CNN (Nose)": 0.82,
        "Model D – Xception":          0.86,
        "Model C – ViT":               0.938,
    }

    # Maps each raw_preds index to its display name, region, accuracy key
    MODEL_MAP = [
        # (display_name,                  region,      accuracy_key)
        ("Model A – Deep CNN (Eyes)",   "Eyes",       "Model A – Deep CNN (Eyes)"),
        ("Model A – Deep CNN (Nose)",   "Nose",       "Model A – Deep CNN (Nose)"),
        ("Model B – Simple CNN (Eyes)", "Eyes",       "Model B – Simple CNN (Eyes)"),
        ("Model B – Simple CNN (Nose)", "Nose",       "Model B – Simple CNN (Nose)"),
        ("Model D – Xception",          "Mouth",      "Model D – Xception"),
        ("Model C – ViT",               "Full Face",  "Model C – ViT"),
    ]

    outputs = []
    for i, (pred, conf) in enumerate(raw_preds):
        if i >= len(MODEL_MAP):
            break
        name, region, acc_key = MODEL_MAP[i]
        outputs.append({
            "name":       name,
            "region":     region,
            "label":      "fake" if pred == 0 else "real",
            "confidence": round(conf, 4),
            "accuracy":   MODEL_ACCURACY.get(acc_key),
        })

    return outputs


def run_frame(frame, mtcnn, models):
    """
    Run all models on one frame.

    Returns:
        vote           (int|None)   — 0=FAKE, 1=REAL, None=no face
        face_conf      (float|None) — MTCNN detection confidence
        model_outputs  (list|None)  — per-model results for the frontend
    """
    img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    boxes, probs, landmarks = mtcnn.detect(img_rgb, landmarks=True)
    if boxes is None or len(boxes) == 0:
        return None, None, None

    idx      = int(np.argmax(probs))
    box      = boxes[idx].astype(int)
    lm       = landmarks[idx]
    le, re, nose_pt = lm[0], lm[1], lm[2]
    conf     = float(probs[idx])

    af, M    = align_face(frame, le, re)
    abox     = transform_box(box, M)
    ale      = transform_point(le,  M)
    are_     = transform_point(re,  M)
    anose    = transform_point(nose_pt, M)

    ax1,ay1,ax2,ay2 = abox
    face_crop = safe_crop(af, ax1,ay1,ax2,ay2)
    if face_crop is None: return None, None, None

    em = max(10, int(max(ax2-ax1,1)*0.06))
    eyes_crop = crop_eyes(af, ale, are_, em)
    nose_crop = crop_nose(af, anose, abox)
    if eyes_crop is None or nose_crop is None: return None, None, None

    face_224     = cv2.resize(face_crop, (224, 224))
    face_224_rgb = cv2.cvtColor(face_224, cv2.COLOR_BGR2RGB)
    mouth_crop   = crop_mouth(face_224_rgb, mtcnn)

    if any(c is None for c in [eyes_crop, nose_crop, mouth_crop]):
        return None, None, None

    eyes_t  = transform_50 (cv2.cvtColor(eyes_crop, cv2.COLOR_BGR2RGB))
    nose_t  = transform_50 (cv2.cvtColor(nose_crop, cv2.COLOR_BGR2RGB))
    face_t  = transform_224(cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB))
    mouth_t = transform_50 (mouth_crop)

    # Collect (pred, conf) from every model
    raw_preds = [
        predict_single(models[0], eyes_t),   # ModelA eyes
        predict_single(models[1], nose_t),   # ModelA nose
        predict_single(models[2], eyes_t),   # ModelB eyes
        predict_single(models[3], nose_t),   # ModelB nose
        predict_single(models[4], mouth_t),  # ModelD mouth
    ]
    if len(models) == 6:
        raw_preds.append(predict_single(models[5], face_t))  # ModelC ViT

    # Weighted majority vote (ModelC counts 2.5x)
    weights = [1.0, 1.0, 1.0, 1.0, 1.0]
    if len(models) == 6:
        weights.append(2.5)
    preds_only = [p for p, _ in raw_preds]
    vote = majority_vote(preds_only, weights=weights)

    model_outputs = build_model_outputs(raw_preds, len(models))

    return vote, conf, model_outputs


# ─── Demo-mode mock ───────────────────────────────────────────────────────────
def _mock(kind: str, num_frames: int = 1):
    import random
    is_fake    = random.random() > 0.5
    fake_ratio = random.uniform(0.55, 0.95) if is_fake else random.uniform(0.05, 0.40)

    MODEL_ACCURACY = {
        "Model A – Deep CNN (Eyes)":   0.86,
        "Model A – Deep CNN (Nose)":   0.82,
        "Model B – Simple CNN (Eyes)": 0.83,
        "Model B – Simple CNN (Nose)": 0.82,
        "Model D – Xception":          0.86,
        "Model C – ViT":               0.938,
    }

    def mock_models(frame_is_fake):
        """Generate realistic mock model outputs for all 6 models."""
        results = []
        specs = [
            ("Model A – Deep CNN (Eyes)",   "Eyes"),
            ("Model A – Deep CNN (Nose)",   "Nose"),
            ("Model B – Simple CNN (Eyes)", "Eyes"),
            ("Model B – Simple CNN (Nose)", "Nose"),
            ("Model D – Xception",          "Mouth"),
            ("Model C – ViT",               "Full Face"),
        ]
        for name, region in specs:
            flip  = random.random() < 0.15
            label = "fake" if (frame_is_fake ^ flip) else "real"
            conf  = random.uniform(0.62, 0.97)
            results.append({
                "name":       name,
                "region":     region,
                "label":      label,
                "confidence": round(conf, 4),
                "accuracy":   MODEL_ACCURACY[name],
            })
        return results

    frames = []
    for i in range(num_frames):
        frame_fake  = random.random() > (0.35 if is_fake else 0.7)
        model_outs  = mock_models(frame_fake)
        fake_votes  = sum(1 for m in model_outs if m["label"] == "fake")
        frame_label = "fake" if fake_votes >= len(model_outs) / 2 else "real"
        frames.append({
            "id":          i,
            "timestamp":   round(i * 0.83, 2),
            "thumbnail":   None,
            "label":       frame_label,
            "models":      model_outs,
        })

    return {
        "verdict":         "FAKE" if is_fake else "REAL",
        "is_fake":         is_fake,
        "fake_ratio":      round(fake_ratio, 3),
        "confidence":      round(random.uniform(0.72, 0.99), 3),
        "frames_analyzed": num_frames,
        "frames_skipped":  0,
        "frames":          frames,          # ← new: full per-frame analytics
        "frame_log":       [               # ← kept for backward compat
            {"frame_index": f["id"], "result": f["label"].upper(),
             "face_confidence": round(random.uniform(0.80, 0.99), 3)}
            for f in frames
        ],
        "models_used": 4,
        "device":      str(DEVICE),
        "demo_mode":   True,
        "type":        kind,
    }


# ─── Routes ───────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    models = get_models()
    return {
        "status":          "ok",
        "device":          str(DEVICE),
        "mtcnn_available": MTCNN_AVAILABLE,
        "models_loaded":   models is not None,
        "num_models":      len(models) if models else 0,
        "demo_mode":       models is None,
    }


@app.post("/predict/image")
async def predict_image(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    tmp = os.path.join(UPLOAD_DIR, f"img_{int(time.time()*1000)}_{file.filename}")
    try:
        with open(tmp, "wb") as f:
            f.write(await file.read())

        models = get_models()
        mtcnn  = get_mtcnn()

        if models is None or mtcnn is None:
            return _mock("image", 1)

        frame = cv2.imread(tmp)
        if frame is None:
            raise HTTPException(400, "Cannot decode image")

        vote, conf, model_outputs = run_frame(frame, mtcnn, models)
        if vote is None:
            return {"verdict": "NO_FACE", "is_fake": None,
                    "message": "No face detected", "type": "image",
                    "demo_mode": False}

        is_fake  = (vote == 0)
        thumb    = frame_to_thumbnail(frame)
        # Single-frame analytics object
        frame_obj = {
            "id":        0,
            "timestamp": 0.0,
            "thumbnail": thumb,
            "label":     "fake" if is_fake else "real",
            "models":    model_outputs,
        }

        return {
            "verdict":         "FAKE" if is_fake else "REAL",
            "is_fake":         is_fake,
            "confidence":      round(conf, 3) if conf else None,
            "fake_ratio":      1.0 if is_fake else 0.0,
            "frames_analyzed": 1,
            "frames_skipped":  0,
            "frames":          [frame_obj],     # ← new
            "frame_log":       [{"frame_index": 0,
                                 "result": "FAKE" if is_fake else "REAL",
                                 "face_confidence": round(conf,3) if conf else None}],
            "models_used":     len(models),
            "device":          str(DEVICE),
            "demo_mode":       False,
            "type":            "image",
        }
    finally:
        if os.path.exists(tmp): os.remove(tmp)


@app.post("/predict/video")
async def predict_video(
    file:       UploadFile = File(...),
    num_frames: int        = Form(20),
):
    if not file.content_type.startswith("video/"):
        raise HTTPException(400, "File must be a video")

    num_frames = max(5, min(num_frames, 50))
    tmp = os.path.join(UPLOAD_DIR, f"vid_{int(time.time()*1000)}_{file.filename}")
    try:
        with open(tmp, "wb") as f:
            f.write(await file.read())

        models = get_models()
        mtcnn  = get_mtcnn()

        if models is None or mtcnn is None:
            return _mock("video", num_frames)

        cap   = cv2.VideoCapture(tmp)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps   = cap.get(cv2.CAP_PROP_FPS)

        if total == 0 or not cap.isOpened():
            cap.release()
            raise HTTPException(400, "Invalid or unreadable video")

        indices = np.linspace(0, total-1, num_frames, dtype=int)
        votes, skipped = [], 0
        frames_out  = []   # new: per-frame analytics for frontend
        frame_log   = []   # kept for backward compat

        for i, idx in enumerate(indices):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
            ret, frame = cap.read()
            timestamp  = round(int(idx) / fps, 2) if fps > 0 else 0.0

            if not ret:
                skipped += 1
                frame_log.append({"frame_index": int(idx), "result": "skip",
                                   "face_confidence": None})
                continue

            vote, conf, model_outputs = run_frame(frame, mtcnn, models)

            if vote is None:
                skipped += 1
                frame_log.append({"frame_index": int(idx), "result": "no_face",
                                   "face_confidence": None})
            else:
                votes.append(vote)
                is_frame_fake = (vote == 0)
                thumb = frame_to_thumbnail(frame)

                frames_out.append({
                    "id":        i,
                    "timestamp": timestamp,
                    "thumbnail": thumb,
                    "label":     "fake" if is_frame_fake else "real",
                    "models":    model_outputs,
                })
                frame_log.append({
                    "frame_index":    int(idx),
                    "result":         "FAKE" if is_frame_fake else "REAL",
                    "face_confidence": round(conf, 3) if conf else None,
                })

        cap.release()

        if not votes:
            return {"verdict": "NO_FACE", "is_fake": None,
                    "message": "No faces found in sampled frames",
                    "type": "video", "demo_mode": False}

        final      = majority_vote(votes)
        is_fake    = (final == 0)
        fake_ratio = sum(1 for v in votes if v == 0) / len(votes)

        return {
            "verdict":         "FAKE" if is_fake else "REAL",
            "is_fake":         is_fake,
            "fake_ratio":      round(fake_ratio, 3),
            "confidence":      round(fake_ratio, 3),
            "frames_analyzed": len(votes),
            "frames_skipped":  skipped,
            "frames":          frames_out,   # ← new: full per-frame analytics
            "frame_log":       frame_log,    # ← kept for backward compat
            "video_fps":       round(fps, 2),
            "total_frames":    total,
            "models_used":     len(models),
            "device":          str(DEVICE),
            "demo_mode":       False,
            "type":            "video",
        }
    finally:
        if os.path.exists(tmp): os.remove(tmp)


if __name__ == "__main__":
    get_models()
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
