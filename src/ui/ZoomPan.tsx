import { useCallback, useEffect, useRef, useState } from "react";

interface ViewTransform {
  scale: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 20;

/**
 * Mouse-driven zoom + pan around arbitrary inner content.
 *  - wheel (Cmd/Ctrl or pinch): zoom anchored on the cursor
 *  - left-button drag: pan
 *  - Fit button / double click: back to the fit view
 *
 * Opens at `fitScale` (25%) with the wrapper sized to the content's full
 * scaled height, so an entire sheet is visible top to bottom. Content is
 * injected via dangerouslySetInnerHTML so we can wrap the same HTML-string
 * diagrams the print window uses.
 */
export function ZoomPan({
  html,
  minHeight = 240,
  fitScale = 0.25,
}: {
  html: string;
  minHeight?: number;
  /** initial scale; Fit / double-click return here */
  fitScale?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewTransform>({ scale: fitScale, tx: 0, ty: 0 });
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const goFit = useCallback(
    () => setView({ scale: fitScale, tx: 0, ty: 0 }),
    [fitScale],
  );

  // Size the wrapper to the content's full height at fit scale, so the whole
  // sheet is visible vertically when the view opens (or is re-fit).
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () =>
      setFitHeight(Math.max(minHeight, el.scrollHeight * fitScale));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [html, fitScale, minHeight]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  }, [view.tx, view.ty]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setView((v) => ({
      ...v,
      tx: d.tx + (e.clientX - d.x),
      ty: d.ty + (e.clientY - d.y),
    }));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  }, []);

  // Native wheel listener with passive:false so we can preventDefault and
  // stop the page from scrolling while the cursor is over the diagram.
  // React's synthetic onWheel is passive by default in React 18.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // Only zoom when Cmd/Ctrl is held; otherwise let the wheel scroll the
      // page normally. (Trackpad pinch-zoom in Chrome arrives as a wheel
      // event with ctrlKey synthetically set, so this also covers pinch.)
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setView((v) => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
        const actualFactor = nextScale / v.scale;
        const nextTx = cx - (cx - v.tx) * actualFactor;
        const nextTy = cy - (cy - v.ty) * actualFactor;
        return { scale: nextScale, tx: nextTx, ty: nextTy };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const atFit =
    Math.abs(view.scale - fitScale) < 1e-6 && view.tx === 0 && view.ty === 0;

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={goFit}
      style={{
        position: "relative",
        overflow: "hidden",
        height: fitHeight ?? minHeight,
        minHeight,
        touchAction: "none",
        cursor: dragRef.current ? "grabbing" : "grab",
        userSelect: "none",
      }}
      title="Cmd/Ctrl-scroll (or pinch) to zoom · drag to pan · double-click or Fit to reset"
    >
      <div
        ref={contentRef}
        style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transformOrigin: "0 0",
          width: "100%",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {!atFit && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={goFit}
          style={{
            position: "absolute",
            right: 8,
            top: 8,
            fontSize: 11,
            padding: "3px 9px",
          }}
        >
          Fit
        </button>
      )}
      <div
        style={{
          position: "absolute",
          right: 8,
          bottom: 8,
          background: "#0008",
          color: "#fff",
          fontSize: 11,
          padding: "2px 6px",
          borderRadius: 3,
          pointerEvents: "none",
        }}
      >
        {Math.round(view.scale * 100)}%
      </div>
    </div>
  );
}
