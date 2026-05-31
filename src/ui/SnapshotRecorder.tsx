import { useEffect, useRef, useState } from "react";

type DiagBus = (event: string, detail: unknown) => void;
interface Frame { t: number; event: string; detail: unknown }

/** Floating REC button (bottom-right). Click to start recording; click again
 *  to stop and POST the buffer to /__lab-snapshot (dev vite plugin writes it
 *  to /tmp/roombuilder-lab-snapshot.json). Any code can emit via
 *    (window as any).__rbDiagBus?.('eventName', detail)
 */
export function SnapshotRecorder() {
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState(0);
  const framesRef = useRef<Frame[]>([]);
  const startRef = useRef(0);
  const recordingRef = useRef(false);

  useEffect(() => { recordingRef.current = recording; }, [recording]);

  // Install the bus once. The bus reads recording state via a ref so we don't
  // tear it down/up on every toggle.
  useEffect(() => {
    const bus: DiagBus = (event, detail) => {
      if (!recordingRef.current) return;
      framesRef.current.push({ t: Date.now() - startRef.current, event, detail });
      setCount(framesRef.current.length);
    };
    (window as unknown as { __rbDiagBus?: DiagBus }).__rbDiagBus = bus;
    return () => {
      const w = window as unknown as { __rbDiagBus?: DiagBus };
      if (w.__rbDiagBus === bus) delete w.__rbDiagBus;
    };
  }, []);

  async function toggle() {
    if (!recording) {
      framesRef.current = [];
      setCount(0);
      startRef.current = Date.now();
      setRecording(true);
      return;
    }
    setRecording(false);
    const snapshot = {
      ts: new Date().toISOString(),
      source: "RoomBuilderSnapshotRecorder",
      frameCount: framesRef.current.length,
      frames: framesRef.current,
    };
    const payload = JSON.stringify(snapshot, null, 2);
    try { await navigator.clipboard?.writeText(payload); } catch { /* ignore */ }
    try { await fetch("/__lab-snapshot", { method: "POST", body: payload }); } catch { /* dev plugin not running */ }
    // eslint-disable-next-line no-console
    console.log("[SnapshotRecorder] frames:", framesRef.current.length);
  }

  return (
    <button
      onClick={toggle}
      title={recording ? `Stop recording (${count} frames)` : "Start diagnostic recording"}
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 9999,
        width: recording ? 96 : 36,
        height: 36,
        borderRadius: 18,
        border: "1px solid rgba(0,0,0,0.2)",
        background: recording ? "#d33" : "#fff",
        color: recording ? "#fff" : "#444",
        cursor: "pointer",
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        fontWeight: 600,
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: 0,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 10,
          height: 10,
          borderRadius: 5,
          background: recording ? "#fff" : "#d33",
        }}
      />
      {recording && <span>■ {count}</span>}
    </button>
  );
}
