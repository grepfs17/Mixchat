import { useState, useRef, useEffect, useCallback } from "react";

interface UseSlowModeReturn {
  cooldown: number;
  startCooldown: (seconds: number) => void;
}

export function useSlowMode(): UseSlowModeReturn {
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear the interval when cooldown reaches zero
  useEffect(() => {
    if (cooldown === 0 && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [cooldown]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCooldown(seconds);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
  }, []);

  return { cooldown, startCooldown };
}
