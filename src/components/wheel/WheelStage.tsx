import { useCallback, useEffect, useRef, useState } from "react";
import { FaDharmachakra } from "react-icons/fa";
import { drawWheel, optionIndexAtPointer } from "../../lib/wheel/draw";

export const WHEEL_SPIN_MS = 8000;
const SPIN_SOUND_SRC = "/wheel/wheel-effect.mp3";
const WIN_SOUND_SRC = "/wheel/win-effect.mp3";

interface WheelStageProps {
  options: string[];
  disabled?: boolean;
  onSpinStart?: () => void;
  onSpinStateChange?: (spinning: boolean) => void;
  onWinner: (option: string) => void;
}

/**
 * The canvas wheel plus the spin interaction. Owns the rotation so the winner
 * can be derived from the final angle.
 */
export default function WheelStage({
  options,
  disabled = false,
  onSpinStart,
  onSpinStateChange,
  onWinner,
}: WheelStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  // Snapshot of the options rendered when the spin started. Freezing the
  // drawn slices keeps the wheel and the announced winner in agreement even
  // if the editor changes the option list mid-spin.
  const [frozenOptions, setFrozenOptions] = useState<string[]>([]);
  const spinAudioRef = useRef<HTMLAudioElement | null>(null);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRafRef = useRef<number | null>(null);

  const displayOptions = spinning ? frozenOptions : options;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const size = stage.clientWidth;
    if (size <= 0) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWheel(ctx, size, displayOptions);
  }, [displayOptions]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    return () => {
      if (fadeRafRef.current !== null) cancelAnimationFrame(fadeRafRef.current);
    };
  }, []);

  const playWinSound = useCallback(() => {
    const audio = winAudioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      audio.volume = 0.25;
      void audio.play().catch(() => undefined);
    } catch {
      // Ignore autoplay rejections.
    }
  }, []);

  const fadeOutSpinSound = useCallback((delayMs: number, durationMs: number) => {
    window.setTimeout(() => {
      const audio = spinAudioRef.current;
      if (!audio) return;
      const startVolume = audio.volume;
      const start = performance.now();
      const tick = () => {
        const elapsed = performance.now() - start;
        const progress = Math.min(elapsed / durationMs, 1);
        audio.volume = startVolume * (1 - progress);
        if (progress < 1) {
          fadeRafRef.current = requestAnimationFrame(tick);
        } else {
          audio.pause();
        }
      };
      fadeRafRef.current = requestAnimationFrame(tick);
    }, delayMs);
  }, []);

  const spin = useCallback(() => {
    if (spinning || options.length === 0 || disabled) return;
    const captured = [...options];
    setFrozenOptions(captured);
    setSpinning(true);
    onSpinStart?.();
    onSpinStateChange?.(true);

    const spinAudio = spinAudioRef.current;
    if (spinAudio) {
      try {
        spinAudio.currentTime = 0.5;
        spinAudio.volume = 0.25;
        void spinAudio.play().catch(() => undefined);
      } catch {
        // Ignore autoplay rejections.
      }
    }
    const fadeTime = WHEEL_SPIN_MS - WHEEL_SPIN_MS / 1.25;
    fadeOutSpinSound(WHEEL_SPIN_MS - fadeTime, fadeTime);

    const extraRotations = WHEEL_SPIN_MS / 1000 + Math.random() * 5;
    const finalAngle = Math.random() * 360;
    const delta = extraRotations * 360 + finalAngle;
    const target = rotationRef.current + delta;
    rotationRef.current = target;
    setRotation(target);

    window.setTimeout(() => {
      setSpinning(false);
      onSpinStateChange?.(false);
      const audio = spinAudioRef.current;
      if (audio) audio.pause();
      playWinSound();
      const index = optionIndexAtPointer(rotationRef.current, captured.length);
      if (index >= 0 && index < captured.length) {
        onWinner(captured[index]);
      }
    }, WHEEL_SPIN_MS);
  }, [
    disabled,
    fadeOutSpinSound,
    onSpinStart,
    onSpinStateChange,
    onWinner,
    options,
    playWinSound,
    spinning,
  ]);

  const canSpin = options.length > 0 && !disabled && !spinning;

  return (
    <div className="wheel-stage-wrap">
      <div className="wheel-stage" ref={stageRef}>
        <div className="wheel-pointer" aria-hidden="true" />
        <canvas
          ref={canvasRef}
          className="wheel-canvas"
          style={{ transform: `rotate(${rotation}deg)` }}
          aria-label="Prize wheel"
          role="img"
        />
      </div>
      <button
        type="button"
        className="wheel-spin-btn"
        onClick={spin}
        disabled={!canSpin}
      >
        <FaDharmachakra className="wheel-spin-icon" size={20} />
        <span>{spinning ? "Spinning…" : "Spin!"}</span>
      </button>
      <audio ref={spinAudioRef} src={SPIN_SOUND_SRC} preload="auto" />
      <audio ref={winAudioRef} src={WIN_SOUND_SRC} preload="auto" />
    </div>
  );
}
