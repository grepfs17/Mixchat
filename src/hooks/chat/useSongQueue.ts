import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SONG_QUEUE_CONFIG,
  type SongQueueConfig,
  type SongQueueItem,
  type SongQueueMessage,
  type SongQueueOwnerBootstrap,
  type SongQueueSession,
  type SongQueueSubmitter,
} from "../../lib/songQueue/types";
import { extractSubmissions, type SongQueueOwner } from "../../lib/songQueue/extract";
import {
  SongQueueApiError,
  appendSongQueueItem,
  closeSongQueue,
  createSongQueue,
  getSongQueue,
  patchSongQueue,
  removeSongQueueItem,
  setSongQueueIndex,
  updateSongQueueItem,
} from "../../lib/songQueue/api";
import {
  clearSongQueueSession,
  loadSongQueueSession,
  saveSongQueueSession,
} from "../../lib/songQueue/idb";

export type SongQueuePhase = "idle" | "open" | "ended";

export interface UseSongQueueOptions {
  channelKey: string;
  owner: SongQueueOwner;
  /** Master switch; mirrors the Streamer Tools toggle. */
  enabled?: boolean;
  /** Override the per-submitter limit at hook time. */
  perSubmitterLimit?: number;
  /** Called when a fatal error happens that the user should see. */
  onError?: (message: string) => void;
  /** Called when the current item changes (so the panel can announce it). */
  onAdvance?: (item: SongQueueItem | undefined) => void;
  /**
   * Optional chat feed. The hook does not subscribe to a chat source itself;
   * callers feed it messages via `ingestMessage`.
   */
}

export interface UseSongQueueResult {
  phase: SongQueuePhase;
  config: SongQueueConfig;
  setConfig: (next: Partial<SongQueueConfig>) => void;
  bootstrap: SongQueueOwnerBootstrap | null;
  session: SongQueueSession | null;
  currentItem: SongQueueItem | undefined;
  items: SongQueueItem[];
  pending: SongQueueItem[];
  history: SongQueueItem[];
  loading: boolean;
  error: string | null;
  start: () => Promise<void>;
  end: () => Promise<void>;
  ingestMessage: (item: SongQueueMessage) => void;
  remove: (itemId: string) => Promise<void>;
  skip: (itemId: string) => Promise<void>;
  playNow: (itemId: string) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  reportDuration: (itemId: string, durationSec: number) => Promise<void>;
}

const HISTORY_STATUSES = new Set(["played", "skipped"]);

export function useSongQueue(options: UseSongQueueOptions): UseSongQueueResult {
  const {
    channelKey,
    owner,
    enabled = true,
    perSubmitterLimit,
    onError,
    onAdvance,
  } = options;

  const [phase, setPhase] = useState<SongQueuePhase>("idle");
  const [config, setConfigState] = useState<SongQueueConfig>(DEFAULT_SONG_QUEUE_CONFIG);
  const [bootstrap, setBootstrap] = useState<SongQueueOwnerBootstrap | null>(null);
  const [session, setSession] = useState<SongQueueSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep latest config in a ref so the debounced ingestion can read it
  // without re-binding the timer on every keystroke.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Same for owner, since the extractor uses it.
  const ownerRef = useRef(owner);
  useEffect(() => {
    ownerRef.current = owner;
  }, [owner]);

  const perSubmitterRef = useRef(perSubmitterLimit);
  useEffect(() => {
    perSubmitterRef.current = perSubmitterLimit;
  }, [perSubmitterLimit]);

  // ---- IDB hydration on mount (does not require a network call) ----
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const stored = await loadSongQueueSession(channelKey);
      if (cancelled || !stored) return;
      setBootstrap({
        sessionId: stored.sessionId,
        ownerToken: stored.ownerToken,
        isPublic: stored.session.isPublic,
        publicUrl: `/s/${stored.sessionId}`,
        title: stored.session.title,
        channelName: stored.session.channelName || "",
        channelPlatform: stored.session.channelPlatform || "",
        createdAt: stored.session.createdAt,
      });
      setSession(stored.session);
      setConfigState((prev) => ({
        ...prev,
        title: stored.session.title || prev.title,
        isPublic: stored.session.isPublic,
      }));
      setPhase(stored.session.ended ? "ended" : "open");
    })();
    return () => {
      cancelled = true;
    };
  }, [channelKey, enabled]);

  // ---- Network reconciliation: pull the server record and merge ----
  const refresh = useCallback(async () => {
    if (!bootstrap) return;
    setLoading(true);
    try {
      const server = await getSongQueue(bootstrap.sessionId, bootstrap.ownerToken);
      setSession(server);
      await saveSongQueueSession(
        channelKey,
        bootstrap.sessionId,
        bootstrap.ownerToken,
        server,
      );
      if (server.ended) setPhase("ended");
    } catch (err) {
      if (err instanceof SongQueueApiError && err.status === 410) {
        setPhase("ended");
      } else if (err instanceof SongQueueApiError && err.status === 404) {
        await clearSongQueueSession(channelKey);
        setBootstrap(null);
        setSession(null);
        setPhase("idle");
      } else {
        const msg = err instanceof Error ? err.message : "Failed to load queue";
        setError(msg);
        onError?.(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [bootstrap, channelKey, onError]);

  // Refresh after bootstrap loads.
  useEffect(() => {
    if (bootstrap && phase === "open") {
      void refresh();
    }
    // We intentionally do not depend on `refresh` to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap?.sessionId, phase]);

  // ---- Advance callback (announce) ----
  useEffect(() => {
    if (!session) return;
    const item = session.items[session.currentIndex];
    onAdvance?.(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.currentIndex, session?.version]);

  // ---- Public actions ----
  const setConfig = useCallback(async (next: Partial<SongQueueConfig>) => {
    setConfigState((prev) => ({ ...prev, ...next }));
    // Persist isPublic changes to the server and IDB.
    if (bootstrap && next.isPublic !== undefined && next.isPublic !== bootstrap.isPublic) {
      try {
        const updated = await patchSongQueue(
          bootstrap.sessionId,
          bootstrap.ownerToken,
          { isPublic: next.isPublic },
        );
        setBootstrap((prev) => prev ? { ...prev, isPublic: updated.isPublic } : prev);
        setSession((prev) => prev ? { ...prev, isPublic: updated.isPublic } : prev);
        if (session) {
          await saveSongQueueSession(channelKey, bootstrap.sessionId, bootstrap.ownerToken, {
            ...session,
            isPublic: updated.isPublic,
          });
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "Failed to update sharing");
        // Revert the optimistic local update on failure.
        setConfigState((prev) => ({ ...prev, isPublic: !next.isPublic }));
      }
    }
  }, [bootstrap, session, channelKey, onError]);

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Derive channel platform and display name from channelKey
    // (e.g. "twitch:alice" → platform="twitch", name="alice").
    const [channelPlatform, channelName] = channelKey.includes(":")
      ? channelKey.split(":")
      : ["", channelKey];
    try {
      const created = await createSongQueue({
        title: config.title || undefined,
        isPublic: config.isPublic,
        channelName,
        channelPlatform,
      });
      setBootstrap(created);
      setSession({
        sessionId: created.sessionId,
        title: created.title,
        channelName: created.channelName,
        channelPlatform: created.channelPlatform,
        ownerTokenHash: "",
        createdAt: created.createdAt,
        lastSeenAt: created.createdAt,
        isPublic: created.isPublic,
        currentIndex: 0,
        version: 0,
        ended: false,
        items: [],
      });
      setPhase("open");
      setConfigState((prev) => ({
        ...prev,
        title: created.title,
        isPublic: created.isPublic,
      }));
      await saveSongQueueSession(channelKey, created.sessionId, created.ownerToken, {
        sessionId: created.sessionId,
        title: created.title,
        channelName: created.channelName,
        channelPlatform: created.channelPlatform,
        ownerTokenHash: "",
        createdAt: created.createdAt,
        lastSeenAt: created.createdAt,
        isPublic: created.isPublic,
        currentIndex: 0,
        version: 0,
        ended: false,
        items: [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start queue";
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [channelKey, config.isPublic, config.title, onError]);

  const end = useCallback(async () => {
    if (!bootstrap) return;
    setLoading(true);
    try {
      await closeSongQueue(bootstrap.sessionId, bootstrap.ownerToken);
      setPhase("ended");
      if (session) {
        const updated = { ...session, ended: true, isPublic: false };
        setSession(updated);
        await saveSongQueueSession(channelKey, bootstrap.sessionId, bootstrap.ownerToken, updated);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to end queue";
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [bootstrap, channelKey, onError, session]);

  // ---- Chat ingestion ----
  // Debounced by animation frame so a burst of messages produces a single
  // round of extraction per frame.
  const ingestFrameRef = useRef<number | null>(null);
  const pendingMessagesRef = useRef<SongQueueMessage[]>([]);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  const flushIngest = useCallback(async () => {
    ingestFrameRef.current = null;
    if (!bootstrap || phase !== "open") return;
    const cfg = configRef.current;
    const own = ownerRef.current;
    const cap = perSubmitterRef.current ?? cfg.perSubmitterLimit;
    const messages = pendingMessagesRef.current;
    pendingMessagesRef.current = [];
    if (messages.length === 0) return;
    const { accepted } = extractSubmissions(
      messages,
      { scope: cfg.scope, eligibility: cfg.eligibility, perSubmitterLimit: cap },
      own,
      session?.items ?? [],
    );
    if (accepted.length === 0) return;

    // Append server-side, one at a time so we surface per-item errors. Add to
    // the optimistic pending list first so the UI updates instantly.
    const optimistic: SongQueueItem[] = [];
    for (const submission of accepted) {
      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tempItem: SongQueueItem = {
        id: tempId,
        videoId: submission.videoId,
        title: "Validating…",
        channelTitle: "",
        thumbnail: `https://i.ytimg.com/vi/${submission.videoId}/hqdefault.jpg`,
        durationSec: 0,
        submitter: submission.submitter,
        submittedAt: submission.submittedAt,
        status: "pending",
      };
      optimistic.push(tempItem);
      try {
        const real = await appendSongQueueItem(
          bootstrap.sessionId,
          bootstrap.ownerToken,
          {
            videoId: submission.videoId,
            submitter: submission.submitter,
            maxQueueLength: cfg.maxQueueLength,
          },
        );
        // Replace the temp with the real item.
        setSession((prev) => {
          if (!prev) return prev;
          const withoutTemp = prev.items.filter((it) => it.id !== tempId);
          return { ...prev, items: [...withoutTemp, real] };
        });
        // Persist the updated IDB record lazily.
        if (session) {
          const merged = {
            ...session,
            items: session.items.filter((it) => it.id !== tempId).concat(real),
          };
          await saveSongQueueSession(
            channelKey,
            bootstrap.sessionId,
            bootstrap.ownerToken,
            merged,
          );
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to add song";
        setError(msg);
        onError?.(msg);
        // Drop the optimistic item.
        setSession((prev) =>
          prev ? { ...prev, items: prev.items.filter((it) => it.id !== tempId) } : prev,
        );
      }
    }
  }, [bootstrap, channelKey, onError, phase, session]);

  const ingestMessage = useCallback(
    (item: SongQueueMessage) => {
      if (phase !== "open" || !bootstrap) return;
      const key = `${item.platform}:${item.msg.id}`;
      if (seenMessageIdsRef.current.has(key)) return;
      seenMessageIdsRef.current.add(key);
      pendingMessagesRef.current.push(item);
      if (ingestFrameRef.current === null) {
        ingestFrameRef.current = requestAnimationFrame(() => {
          void flushIngest();
        });
      }
    },
    [bootstrap, flushIngest, phase],
  );

  // ---- Queue manipulation ----
  const remove = useCallback(
    async (itemId: string) => {
      if (!bootstrap) return;
      const previous = session;
      setSession((prev) =>
        prev ? { ...prev, items: prev.items.filter((it) => it.id !== itemId) } : prev,
      );
      try {
        await removeSongQueueItem(bootstrap.sessionId, bootstrap.ownerToken, itemId);
        if (previous) {
          await saveSongQueueSession(
            channelKey,
            bootstrap.sessionId,
            bootstrap.ownerToken,
            { ...previous, items: previous.items.filter((it) => it.id !== itemId) },
          );
        }
      } catch (err) {
        setSession(previous);
        const msg = err instanceof Error ? err.message : "Failed to remove";
        setError(msg);
        onError?.(msg);
      }
    },
    [bootstrap, channelKey, onError, session],
  );

  const skip = useCallback(
    async (itemId: string) => {
      if (!bootstrap) return;
      try {
        const item = await updateSongQueueItem(
          bootstrap.sessionId,
          bootstrap.ownerToken,
          itemId,
          { status: "skipped" },
        );
        setSession((prev) =>
          prev
            ? { ...prev, items: prev.items.map((it) => (it.id === itemId ? item : it)) }
            : prev,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to skip";
        setError(msg);
        onError?.(msg);
      }
    },
    [bootstrap, onError],
  );

  const playNow = useCallback(
    async (itemId: string) => {
      if (!bootstrap || !session) return;
      const idx = session.items.findIndex((it) => it.id === itemId);
      if (idx === -1) return;
      await setSongQueueIndex(bootstrap.sessionId, bootstrap.ownerToken, idx, {
        status: "playing",
      });
      setSession((prev) =>
        prev
          ? {
              ...prev,
              currentIndex: idx,
              items: prev.items.map((it) =>
                it.id === itemId
                  ? { ...it, status: "playing" as const }
                  : it.status === "playing"
                    ? { ...it, status: "skipped" as const }
                    : it,
              ),
            }
          : prev,
      );
    },
    [bootstrap, session],
  );

  const next = useCallback(async () => {
    if (!bootstrap || !session) return;
    const maxIndex = Math.max(0, session.items.length - 1);
    const atEnd = session.currentIndex >= maxIndex && session.items.length > 0;
    const target = atEnd && config.loop
      ? 0
      : Math.min(session.currentIndex + 1, maxIndex);
    if (target === session.currentIndex && session.items.length > 0) return;
    const previousId = session.items[session.currentIndex]?.id;
    await setSongQueueIndex(bootstrap.sessionId, bootstrap.ownerToken, target, {
      status: "playing",
    });
    setSession((prev) =>
      prev
        ? {
            ...prev,
            currentIndex: target,
            items: prev.items.map((it) => {
              if (it.id === previousId && it.status === "playing") {
                return { ...it, status: "played" as const };
              }
              if (prev.items[target]?.id === it.id) {
                return { ...it, status: "playing" as const };
              }
              return it;
            }),
          }
        : prev,
    );
  }, [bootstrap, session, config.loop]);

  const previous = useCallback(async () => {
    if (!bootstrap || !session) return;
    const target = Math.max(0, session.currentIndex - 1);
    if (target === session.currentIndex) return;
    await setSongQueueIndex(bootstrap.sessionId, bootstrap.ownerToken, target, {
      status: "playing",
    });
    setSession((prev) =>
      prev
        ? {
            ...prev,
            currentIndex: target,
            items: prev.items.map((it, i) => ({
              ...it,
              status: i === target ? ("playing" as const) : it.status,
            })),
          }
        : prev,
    );
  }, [bootstrap, session]);

  const reportDuration = useCallback(
    async (itemId: string, durationSec: number) => {
      if (!bootstrap) return;
      // Optimistic local update first
      setSession((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                it.id === itemId
                  ? { ...it, durationSec: Math.max(it.durationSec, durationSec) }
                  : it,
              ),
            }
          : prev,
      );
      try {
        await setSongQueueIndex(bootstrap.sessionId, bootstrap.ownerToken, session?.currentIndex ?? 0, {
          durationSec,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to report duration";
        setError(msg);
        onError?.(msg);
      }
    },
    [bootstrap, onError, session?.currentIndex],
  );

  const items = useMemo(() => session?.items ?? [], [session]);
  const currentItem = useMemo(
    () => items[session?.currentIndex ?? 0],
    [items, session?.currentIndex],
  );
  const pending = useMemo(
    () => items.filter((it) => it.status === "pending"),
    [items],
  );
  const history = useMemo(
    () => items.filter((it) => HISTORY_STATUSES.has(it.status)),
    [items],
  );

  return {
    phase,
    config,
    setConfig,
    bootstrap,
    session,
    currentItem,
    items,
    pending,
    history,
    loading,
    error,
    start,
    end,
    ingestMessage,
    remove,
    skip,
    playNow,
    next,
    previous,
    reportDuration,
  };
}
