import { useEffect, useMemo, useRef, useState } from "react";
import { FaCheck } from "react-icons/fa";
import { IS_TWITCH_ONLY } from "../../lib/constants";

export type LoadingStepStatus = "pending" | "active" | "complete";

export interface LoadingStep {
  id: string;
  label: string;
  detail: string;
  status: LoadingStepStatus;
  /** Relative contribution to the progress bar. */
  weight: number;
}

interface LoadingScreenProps {
  steps: LoadingStep[];
}

const TIPS = [
  "Emote autocomplete searches 7TV, BTTV, and FFZ as you type.",
  "Link a YouTube channel to follow both chats in one place.",
  "Favorite channels stay pinned at the top of your sidebar.",
  "Drag the divider to resize the player and chat.",
];

export default function LoadingScreen({ steps }: LoadingScreenProps) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const creepRef = useRef(0);

  const activeStep = steps.find((step) => step.status === "active");
  const allComplete = steps.every((step) => step.status === "complete");
  const activeStepId = activeStep?.id;

  const targetProgress = useMemo(() => {
    const total = steps.reduce((sum, step) => sum + step.weight, 0) || 1;
    const value = steps.reduce((sum, step) => {
      if (step.status === "complete") return sum + step.weight;
      if (step.status === "active") return sum + step.weight * 0.35;
      return sum;
    }, 0);
    if (allComplete) return 100;
    return Math.min(96, Math.round((value / total) * 100));
  }, [steps, allComplete]);

  const statusLabel =
    activeStep?.label ??
    (allComplete
      ? "Ready"
      : (steps[steps.length - 1]?.label ?? "Loading"));
  const statusDetail =
    activeStep?.detail ?? (allComplete ? "Opening Mixchat" : "");

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (TIPS.length < 2) return;
    const timer = window.setInterval(() => {
      setTipIndex((index) => (index + 1) % TIPS.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  // Reset the slow creep whenever the active stage changes.
  useEffect(() => {
    creepRef.current = 0;
  }, [activeStepId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (activeStepId) {
        creepRef.current = Math.min(10, creepRef.current + 0.12);
      }
      const goal = activeStepId
        ? Math.min(96, targetProgress + creepRef.current)
        : targetProgress;

      setDisplayProgress((previous) => {
        const diff = goal - previous;
        if (diff <= 0) return previous;
        if (diff < 0.5) return goal;
        return previous + diff * 0.18;
      });
    }, 80);
    return () => window.clearInterval(timer);
  }, [targetProgress, activeStepId]);

  const progress = Math.min(100, Math.round(displayProgress));

  return (
    <div className="loading-overlay loading-screen">
      <div className="loading-screen__glow loading-screen__glow--one" />
      <div className="loading-screen__glow loading-screen__glow--two" />

      <div className="loading-screen__card">
        <img
          src={IS_TWITCH_ONLY ? "/logo-twitch.webp" : "/logo.webp"}
          alt="Mixchat"
          className="loading-screen__logo"
        />

        <div className="loading-screen__status" role="status" aria-live="polite">
          <span className="loading-screen__status-label">
            {statusLabel}
            {!allComplete && (
              <span className="loading-screen__dots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            )}
          </span>
          {statusDetail && (
            <span className="loading-screen__status-detail">{statusDetail}</span>
          )}
        </div>

        <div
          className="loading-screen__progress"
          role="progressbar"
          aria-label="Loading Mixchat"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className="loading-screen__progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="loading-screen__progress-meta">
          <span>{progress}%</span>
          <span>{elapsedSeconds}s</span>
        </div>

        <ul className="loading-screen__steps">
          {steps.map((step) => (
            <li
              key={step.id}
              className={`loading-screen__step loading-screen__step--${step.status}`}
              aria-current={step.status === "active" ? "step" : undefined}
            >
              <span className="loading-screen__step-icon" aria-hidden="true">
                {step.status === "complete" && <FaCheck size={9} />}
              </span>
              <span>{step.label}</span>
            </li>
          ))}
        </ul>

        {elapsedSeconds >= 8 && (
          <p className="loading-screen__hint">
            Still working. A slow connection or Twitch may be taking a moment.
          </p>
        )}

        <p className="loading-screen__tip" key={tipIndex}>
          {TIPS[tipIndex]}
        </p>
      </div>
    </div>
  );
}
