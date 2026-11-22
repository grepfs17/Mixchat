import { useEffect, useState } from "react";
import type { RefObject } from "react";

export interface VodGameChange {
  offsetSeconds: number;
  gameId: string;
  gameName: string;
}

export interface VodInfo {
  title: string;
  gameName: string;
  gameChanges: VodGameChange[];
}

interface VodInfoResponse {
  title?: string;
  gameName?: string;
  gameChanges?: VodGameChange[];
}

interface VodPlayerLike {
  getCurrentTime(): number;
}

const EMPTY_INFO: VodInfo = {
  title: "",
  gameName: "",
  gameChanges: [],
};

function gameAtOffset(
  gameChanges: VodGameChange[],
  offsetSeconds: number,
  fallback: string,
): string {
  let gameName = fallback;
  for (const change of gameChanges) {
    if (change.offsetSeconds > offsetSeconds + 0.5) break;
    gameName = change.gameName || gameName;
  }
  return gameName;
}

export function useVodInfo(
  videoId: string | null | undefined,
  playerRef?: RefObject<VodPlayerLike | null>,
): VodInfo {
  const [info, setInfo] = useState<VodInfo>(EMPTY_INFO);
  const [gameName, setGameName] = useState("");

  useEffect(() => {
    if (!videoId) {
      setInfo(EMPTY_INFO);
      setGameName("");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setInfo(EMPTY_INFO);
    setGameName("");

    fetch(
      `/api/twitch-vod-info?video_id=${encodeURIComponent(videoId)}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load VOD info");
        return (await res.json()) as VodInfoResponse;
      })
      .then((data) => {
        if (cancelled) return;
        const next: VodInfo = {
          title: data.title ?? "",
          gameName: data.gameName ?? "",
          gameChanges: Array.isArray(data.gameChanges)
            ? data.gameChanges
            : [],
        };
        setInfo(next);
        setGameName(next.gameName);
      })
      .catch((err: Error) => {
        if (cancelled || err.name === "AbortError") return;
        setInfo(EMPTY_INFO);
        setGameName("");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [videoId]);

  // Categories can change mid-VOD. Track the player clock and swap the shown
  // category when the next GAME_CHANGE moment is reached.
  useEffect(() => {
    if (info.gameChanges.length === 0) {
      setGameName(info.gameName);
      return;
    }

    let lastGame = "";

    const update = () => {
      const player = playerRef?.current;
      if (!player) return;

      let time: number;
      try {
        time = player.getCurrentTime();
      } catch {
        return;
      }
      if (!Number.isFinite(time) || time < 0) return;

      const nextGame = gameAtOffset(info.gameChanges, time, info.gameName);
      if (nextGame === lastGame) return;
      lastGame = nextGame;
      setGameName(nextGame);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [info, playerRef]);

  return { title: info.title, gameName, gameChanges: info.gameChanges };
}
