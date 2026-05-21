import React, { useRef, useState } from "react";

const ACCEPT = {
  image: "image/jpeg,image/png,image/webp,image/bmp",
  video: "video/mp4,video/avi,video/quicktime,video/webm,video/x-matroska",
};

export default function UploadZone({ mode, onFile }) {
  const inputRef  = useRef(null);
  const [drag, setDrag] = useState(false);
  const [chosen, setChosen] = useState(null);

  function handleFile(file) {
    if (!file) return;
    setChosen(file);
    onFile(file);
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e  => { e.preventDefault(); setDrag(true);  }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault(); setDrag(false);
        handleFile(e.dataTransfer.files[0]);
      }}
      style={{
        position: "relative",
        border: `2px dashed ${drag ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 18,
        padding: "3.5rem 2rem",
        textAlign: "center",
        cursor: "pointer",
        background: drag ? "var(--surface2)" : "var(--surface)",
        transition: "all 0.25s",
        boxShadow: drag ? "0 0 40px rgba(109,40,217,0.15)" : "none",
        overflow: "hidden",
      }}
    >
      {/* radial glow top */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 300, height: 200,
        background: "radial-gradient(ellipse at top, rgba(109,40,217,0.07), transparent 70%)",
        pointerEvents: "none",
      }} />

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[mode]}
        style={{ display: "none" }}
        onChange={e => handleFile(e.target.files[0])}
      />

      <div style={{ fontSize: "3rem", marginBottom: "1rem",
                    transition: "transform 0.3s",
                    transform: drag ? "translateY(-6px) scale(1.1)" : "none" }}>
        {mode === "image" ? "🖼️" : "🎬"}
      </div>

      <h3 style={{ fontWeight: 700, marginBottom: "0.4rem", fontSize: "1.1rem" }}>
        {chosen ? chosen.name : `Drop your ${mode} here`}
      </h3>

      <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
        {chosen
          ? `${(chosen.size / 1024 / 1024).toFixed(2)} MB · click to change`
          : mode === "image"
            ? "or click to browse — JPG, PNG, WEBP, BMP"
            : "or click to browse — MP4, AVI, MOV, WEBM, MKV"}
      </p>

      {chosen && (
        <div style={{
          display: "inline-block", marginTop: "1rem",
          fontFamily: "var(--font-mono)", fontSize: "0.72rem",
          color: "var(--accent2)",
          background: "rgba(109,40,217,0.12)",
          border: "1px solid rgba(109,40,217,0.25)",
          borderRadius: 8, padding: "0.4rem 1rem",
        }}>
          ✓ READY
        </div>
      )}
    </div>
  );
}
