import { useEffect, useRef } from "react";
import type { StreamTransitionInfo } from "./StreamGrid";

interface StreamTransitionOverlayProps {
  transitionInfo: StreamTransitionInfo;
  targetRef: React.RefObject<HTMLElement | null>;
  onAnimationComplete: () => void;
}

export default function StreamTransitionOverlay({
  transitionInfo,
  targetRef,
  onAnimationComplete,
}: StreamTransitionOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onAnimationComplete);
  useEffect(() => {
    onCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  useEffect(() => {
    const target = targetRef.current;
    const el = overlayRef.current;
    if (!target || !el) {
      onCompleteRef.current();
      return;
    }

    const srcRect = transitionInfo.rect;
    const dstRect = target.getBoundingClientRect();

    el.style.left = `${srcRect.left}px`;
    el.style.top = `${srcRect.top}px`;
    el.style.width = `${srcRect.width}px`;
    el.style.height = `${srcRect.height}px`;

    const tx = dstRect.left - srcRect.left;
    const ty = dstRect.top - srcRect.top;
    const sx = dstRect.width / srcRect.width;
    const sy = dstRect.height / srcRect.height;

    requestAnimationFrame(() => {
      if (!el) return;
      el.style.transition =
        "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.4s ease";
      el.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
      el.style.borderRadius = "0px";
    });

    timerRef.current = setTimeout(() => {
      onCompleteRef.current();
    }, 550);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [transitionInfo, targetRef]);

  return (
    <div
      ref={overlayRef}
      className="stream-transition-overlay"
      style={{
        position: "fixed",
        zIndex: 9999,
        overflow: "hidden",
        pointerEvents: "none",
        willChange: "auto",
        transformOrigin: "top left",
        borderRadius: "16px",
      }}
    >
      <img
        src={transitionInfo.thumbnailUrl}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
      <div className="stream-transition-overlay__gradient" />
      <div className="stream-transition-overlay__channel-name">
        {transitionInfo.channelName}
      </div>
    </div>
  );
}
