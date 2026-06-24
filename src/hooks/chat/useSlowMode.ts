import { useState, useRef, useEffect, useCallback } from "react";

interface UseSlowModeReturn {
  cooldown: number;
  startCooldown: (seconds: number) => void;
}

export function useSlowMode(): UseSlowModeReturn {
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCooldown(seconds);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  return { cooldown, startCooldown };
}
