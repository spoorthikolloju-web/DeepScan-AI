import { useState, useCallback } from "react";

const BASE = "/api";

export function useApi() {
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [result,   setResult]   = useState(null);
  const [health,   setHealth]   = useState(null);

  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/health`);
      const d = await r.json();
      setHealth(d);
      return d;
    } catch {
      setHealth({ express: { status: "unreachable" }, fastapi: { status: "unreachable" } });
      return null;
    }
  }, []);

  const predict = useCallback(async (file, type, numFrames = 20) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);
      if (type === "video") form.append("num_frames", String(numFrames));

      const endpoint = type === "image" ? `${BASE}/predict/image` : `${BASE}/predict/video`;
      const resp = await fetch(endpoint, { method: "POST", body: form });
      const data = await resp.json();

      if (!resp.ok) throw new Error(data.error || "Server error");
      setResult(data);
      return data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/history`);
      return await r.json();
    } catch {
      return { history: [], total: 0 };
    }
  }, []);

  const clearHistory = useCallback(async () => {
    await fetch(`${BASE}/history`, { method: "DELETE" });
  }, []);

  return { loading, error, result, health, predict, checkHealth, fetchHistory, clearHistory };
}
