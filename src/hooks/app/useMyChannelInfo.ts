import { useState, useEffect } from "react";
import type { PlatformSession } from "../../lib/types";

interface MyChannelInfo {
  description: string;
  followerCount: number | null;
}

export function useMyChannelInfo(session: PlatformSession | undefined) {
  const [info, setInfo] = useState<MyChannelInfo>({
    description: "",
    followerCount: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchInfo() {
      setLoading(true);
      try {
        const [usersRes, followersRes] = await Promise.all([
          fetch(
            `/api/twitch-proxy?path=/helix/users&id=${encodeURIComponent(session!.userId)}`,
          ),
          fetch(
            `/api/twitch-proxy?path=/helix/channels/followers&broadcaster_id=${encodeURIComponent(session!.userId)}`,
          ),
        ]);

        let desc = "";
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          desc = usersData.data?.[0]?.description ?? "";
        }

        let followerCount: number | null = null;
        if (followersRes.ok) {
          const followersData = await followersRes.json();
          if (typeof followersData.total === "number") {
            followerCount = followersData.total;
          }
        }

        if (!cancelled) {
          setInfo({ description: desc, followerCount });
        }
      } catch {
        if (!cancelled) {
          setInfo({ description: "", followerCount: null });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchInfo();

    return () => {
      cancelled = true;
    };    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.userId]);

  return { ...info, loading };
}
